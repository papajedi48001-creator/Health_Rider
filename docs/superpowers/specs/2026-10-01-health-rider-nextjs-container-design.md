# แบบระบบ Health Rider: Next.js Container Edition

วันที่: 1 ตุลาคม 2026  
สถานะ: รอทบทวนสเปก

## 1. เป้าหมายและขอบเขต

Health Rider คือระบบบริหารการส่งยาถึงบ้านของโรงพยาบาลวาริชภูมิ สำหรับยาที่เภสัชกรรมจัดเตรียมและยืนยันให้ส่งแล้วเท่านั้น ระบบสร้างงานจากข้อมูล HOSxP แบบอ่านอย่างเดียว ควบคุมการรับงานด้วย QR บันทึกหลักฐานการส่งแบบออฟไลน์ และสรุปค่าบริการไรเดอร์ตามโซน/หมู่บ้าน

กติกาธุรกิจและคำศัพท์ใน `CONTEXT.md` ยังคงเป็นข้อกำหนดของระบบฉบับนี้ทั้งหมด สเปกนี้เปลี่ยนเฉพาะสถาปัตยกรรมการพัฒนาและการนำขึ้นใช้งานจาก Laravel เป็น Next.js/React และ MariaDB แบบ containerized

ในรุ่นแรก ระบบไม่แก้ไข HOSxP, ไม่มี consent workflow, patient notification, GPS, OTP, route optimisation, เลขบัตรประชาชน/บัญชีธนาคารไรเดอร์ หรือการจ่ายเงินจริง

## 2. สถาปัตยกรรมที่เลือก

ใช้ Docker Compose เป็นหน่วยติดตั้งมาตรฐาน ประกอบด้วยสองบริการในเครือข่าย Health Rider ภายใน

| บริการ | หน้าที่ | การเก็บข้อมูล |
| --- | --- | --- |
| `web` | Next.js App Router, React server/client components, route handlers, API และ PWA | ไม่มีข้อมูลถาวร นอกจากไฟล์หลักฐานบน mounted volume ใน v1 |
| `db` | MariaDB ของ Health Rider | named volume สำหรับข้อมูลธุรกรรม, audit และการตั้งค่า |

HOSxP MariaDB เป็นบริการภายนอก Compose และเข้าถึงผ่านเครือข่ายที่โรงพยาบาลอนุญาตเท่านั้น แอปใช้บัญชี HOSxP แบบ `SELECT` เท่านั้น โดยแยก `HOS_DATABASE_URL` จาก `DATABASE_URL` ของ Health Rider อย่างชัดเจน ห้ามนำข้อมูล HOSxP ไปเป็น container หรือ volume ของระบบใหม่นี้

Next.js เป็น full-stack boundary เดียว: route handlers และ service modules ทำหน้าที่ API ฝั่งเซิร์ฟเวอร์, React ทำหน้าจอของเภสัชกรรม ผู้ประสานงาน การเงิน และผู้ดูแล, ส่วน Rider PWA เป็น client component ที่มี IndexedDB และ service worker สำหรับคิวออฟไลน์หลัง claim สำเร็จ

## 3. ขอบเขตโมดูล

1. **Identity and access** — บัญชีเฉพาะบุคคล, role `pharmacy`, `coordinator`, `rider`, `finance`, `admin`, `auditor`; v1 ใช้ local credential ที่ hash แล้วและเตรียม adapter boundary ไว้สำหรับ OIDC ในอนาคต
2. **HOSxP intake** — HOSxP adapter ดึง candidate ด้วย eligibility rule ที่ตั้งค่าได้, แปลง encoding ใน adapter เท่านั้น, และไม่สร้างงานจนกว่าผู้ใช้ pharmacy จะยืนยัน
3. **Delivery core** — Delivery Request, zone/village, effective-dated Zone Rate, Delivery Attempt, state transition และ immutable Audit Event
4. **Pharmacy** — ยืนยัน candidate, เตรียมพัสดุ, ออก/พิมพ์ Package QR แบบ opaque และรับคืนยา
5. **Rider PWA** — QR claim แบบออนไลน์/atomic, หน้างานที่ claim แล้วเท่านั้น, บันทึกรับยา ส่งยา ส่งไม่สำเร็จ และคืนยาแบบ offline-first
6. **Operations** — กระดานรายวัน, การแก้ข้อมูลนำส่งระหว่างงาน, sync conflict และข้อยกเว้นที่มีเหตุผล/audit
7. **Finance and reporting** — คัดงานที่ส่งสำเร็จและหลักฐานครบเข้ารอบรายเดือน, ตรวจ อนุมัติ ปิดรอบ และ export CSV

## 4. ข้อมูลและการเข้าถึง

MariaDB ของ Health Rider เป็น system of record สำหรับคำขอส่งยาและหลักฐาน ตารางหลักประกอบด้วย `users`, `rider_profiles`, `delivery_zones`, `zone_rates`, `eligibility_rules`, `delivery_requests`, `delivery_attempts`, `package_qr_tokens`, `delivery_evidence`, `offline_delivery_events`, `sync_conflicts`, `payout_periods`, `payout_lines` และ `audit_events` โดยใช้ ULID เป็น public identifier และจำนวนเงินเป็น integer satang

ข้อมูลผู้ป่วยใน `delivery_requests` เป็น snapshot เฉพาะ HN, ชื่อเต็ม, อายุ, โทรศัพท์, ที่อยู่ และรหัสโซนที่จำเป็นต่อการนำส่งเท่านั้น Rider ที่ claim สำเร็จเห็น snapshot นี้ได้ แต่ไม่เห็นยา, CID หรือประวัติการรักษา ข้อมูลสำคัญทุกการเปลี่ยนแปลงเก็บ audit event ที่แก้ไข/ลบไม่ได้

ภาพหลักฐานเก็บใน volume ที่ไม่ได้เปิดเป็น static public URL; route handler ตรวจ role/ownership ก่อนอ่านหรือดาวน์โหลด ภาพต้องหลีกเลี่ยงใบหน้าและฉลากยาที่เกินจำเป็น

## 5. กระบวนการหลัก

1. HOSxP adapter แสดง candidate ที่เข้าเกณฑ์ โดยไม่มีผลเขียนกลับ HOSxP
2. Pharmacy ยืนยัน candidate; ระบบ snapshot ข้อมูลนำส่งและ Zone Rate ตาม effective date
3. Pharmacy เตรียมพัสดุและออก Package QR รหัสสุ่ม หมดอายุ และไม่มีข้อมูลผู้ป่วย/ยา
4. Rider ที่ล็อกอินสแกน QR ขณะออนไลน์; transaction เดียวเปลี่ยน attempt จาก `prepared` เป็น `claimed` และป้องกันการ claim ซ้ำ
5. หลัง claim Rider PWA เก็บ pickup/delivery/failure evidence ใน IndexedDB ระหว่างออฟไลน์ พร้อม UUID, device time, base delivery version และไฟล์หลักฐาน
6. เมื่อกลับออนไลน์ PWA sync เหตุการณ์แบบ idempotent; server เก็บ server time และตอบรับก่อน client ล้างคิว/ไฟล์ในเครื่อง
7. การส่งสำเร็จต้องมีเวลา รูปหลักฐาน และความสัมพันธ์ผู้รับครบ; การส่งไม่สำเร็จต้องมีเหตุผลมาตรฐานและคืนยาภายในวันเดียวกันก่อนสร้าง QR ใหม่สำหรับ attempt ถัดไป
8. Coordinator แก้ข้อมูลนำส่งระหว่างงานได้ ยกเว้น HN/ข้อมูลพัสดุ โดยต้องมีเหตุผลและ audit; offline event ที่ใช้ version เก่าจะเข้าคิว conflict เพื่อทบทวน ไม่ทิ้งหลักฐาน
9. เฉพาะงานส่งสำเร็จที่หลักฐานครบเป็น Payable Delivery; finance สร้าง ตรวจ อนุมัติ ปิดรอบ และ export รายงานภายนอกระบบการเงิน

## 6. Container และการตั้งค่า

- `compose.yaml` ใช้ healthcheck สำหรับ MariaDB และให้ `web` รอ `db` healthy; production image ใช้ multi-stage Node build และ `next start`
- `.env.example` ระบุชื่อแปรแวดล้อมเท่านั้น เช่น `DATABASE_URL`, `HOS_DATABASE_URL`, `AUTH_SECRET`, `EVIDENCE_STORAGE_PATH`; ห้ามใส่ credential จริง
- MariaDB app user มีสิทธิ์เฉพาะ schema ของ Health Rider; HOSxP user ต้องเป็น read-only และถูกจำกัดเครือข่าย
- migration ของ Prisma เป็นช่องทางเปลี่ยน schema; seed ใช้เฉพาะข้อมูล development/de-identified
- volume ฐานข้อมูลและหลักฐานเป็นข้อมูลที่ต้องสำรองตามนโยบายโรงพยาบาล; การ restore drill และการกำหนด retention เป็นเงื่อนไขก่อน go-live แต่ไม่ใช่การ deploy ในงานนี้

## 7. PWA และ Offline Security

- QR claim ต้องออนไลน์เสมอ; service worker ไม่ cache endpoint ที่มีข้อมูลผู้ป่วยหรือ QR
- หลัง claim เท่านั้นจึงเก็บข้อมูลภารกิจของตนใน IndexedDB; encryption key ผูกกับ active session และข้อมูลที่ sync สำเร็จถูกล้างหลัง server acknowledgement
- event UUID + rider identity ทำให้ sync ซ้ำไม่มีผลซ้ำ; หลักฐานที่ sync ไม่สำเร็จคงอยู่จนผู้ใช้เห็นสถานะชัดเจน
- Browser ต้องขอสิทธิ์กล้องเฉพาะขณะสแกน/ถ่ายหลักฐาน และไม่มีการส่งพิกัด

## 8. การทดสอบและเกณฑ์ยอมรับ

- Vitest ทดสอบ domain/service, authorization, rate snapshot, QR token และ offline queue
- Playwright ทดสอบ workflow ตาม role รวม mobile viewport และ offline-to-online queue
- integration test ใช้ MariaDB test container ของ Health Rider; HOSxP adapter ใช้ fake/read-only test fixture ไม่ต่อ HOSxP จริง
- QR claim พร้อมกันสองคนต้องสำเร็จเพียงคนเดียว; ผู้ที่ไม่ claim เปิดข้อมูลผู้ป่วยไม่ได้
- Zone Rate ภายหลังต้องไม่เปลี่ยน snapshot งานเดิม; attempt ส่งสำเร็จต้องหลักฐานครบ
- failed delivery ต้อง return แล้วจึง retry ได้; payout ที่ปิดแล้วแก้รายการ/อัตราไม่ได้
- `docker compose config`, test suite, production build และ migration test ต้องผ่านก่อนถือว่า implementation พร้อมให้ตรวจทาน

## 9. งานที่ตั้งใจไม่ทำในรอบนี้

ไม่เปิด service สู่ production, ไม่สร้าง HOSxP account, ไม่ใช้ข้อมูลผู้ป่วยจริง, ไม่ย้ายข้อมูลจากระบบเดิม, และไม่ลบโค้ด Laravel ที่ทำไว้ก่อนหน้าโดยอัตโนมัติ โค้ดดังกล่าวเก็บเป็นประวัติใน branch/worktree เดิม แต่จะไม่เป็นฐานของ implementation ใหม่นี้

## 10. เกณฑ์ความสำเร็จ

ทีมสามารถสั่ง Docker Compose เพื่อได้ Next.js/React, MariaDB และ schema ที่พร้อมทดสอบ ผู้ใช้ตามบทบาททำ workflow ตั้งแต่ HOSxP candidate ที่ยืนยันโดยเภสัชกรรมจนถึงรอบเบิกจ่ายได้ในสภาพแวดล้อมทดสอบ โดย QR เป็น opaque, สิทธิ์ข้อมูลผู้ป่วยถูกจำกัด, เหตุการณ์ออฟไลน์ sync ได้อย่างตรวจสอบย้อนหลังได้ และไม่มีการเขียนกลับไปยัง HOSxP

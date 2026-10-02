# Health Rider — Delivery-only Scope Change

วันที่: 2 ตุลาคม 2026
สถานะ: รอทบทวนสเปก

## เป้าหมาย

Health Rider เป็นระบบบริหารการส่งยาถึงบ้านของโรงพยาบาลวาริชภูมิเท่านั้น ระบบไม่มีการคำนวณ จัดเก็บ อนุมัติ หรือรายงานค่าตอบแทนไรเดอร์ และไม่มีบทบาทการเงิน โซนและหมู่บ้านคงไว้เพื่อระบุพื้นที่ส่งยาและการค้นหา/ติดตามงานเท่านั้น

เอกสารนี้แทนที่ข้อกำหนดเรื่อง Zone Rate, rate snapshot, Payable Delivery, Payout Period, payout CSV และ role `finance` ในสเปก Next.js Container ฉบับวันที่ 1 ตุลาคม 2026

## ขอบเขตที่คงอยู่

- HOS เป็นแหล่งข้อมูลแบบอ่านอย่างเดียว; เภสัชกรรมยืนยัน candidate ก่อนสร้างงานเสมอ
- เภสัชกรรมเตรียมพัสดุ ออก Package QR แบบ opaque และยืนยันรับยาคืน
- Rider ภายในและผู้รับจ้างภายนอกรับงานด้วย QR ขณะออนไลน์ แล้วบันทึกรับ/ส่ง/ส่งไม่สำเร็จแบบ offline-first
- Coordinator ติดตามงาน แก้เฉพาะที่อยู่หรือโทรศัพท์ระหว่างส่ง และจัดการ sync conflict
- Admin จัดการบัญชี โซน/หมู่บ้าน และค่าตั้งระบบ; auditor อ่าน audit trail ได้อย่างเดียว
- QR claim, สิทธิ์ข้อมูลผู้ป่วย, หลักฐานแบบ privacy-preserving, audit trail, return/retry และ offline sync ยังคงข้อกำหนดเดิม

## ขอบเขตที่นำออก

- role `finance` และบัญชีทดสอบ/สิทธิ์ของการเงิน
- Zone Rate, rate snapshot และหน้าจอ/API สำหรับดูแลอัตรา
- Payout Period, Payout Line, eligibility, approval, close และ CSV ค่าตอบแทน
- เงื่อนไขที่ผูกการส่งสำเร็จกับการได้รับเงิน และทุก audit event ที่เกี่ยวกับ payout
- UAT, คู่มืออบรม, release checklist และ test ที่อ้างถึงการเงินหรือจำนวนเงิน

## แบบจำลองข้อมูลเป้าหมาย

ฐานข้อมูล UAT ล้างและสร้างใหม่ได้ จึงไม่มีการย้ายหรือเก็บข้อมูลการเงิน ตารางและคอลัมน์ต่อไปนี้ต้องไม่มีใน schema ใหม่:

- `zone_rates`, `payout_periods`, `payout_lines`
- `delivery_requests.rate_satang_snapshot`, `delivery_requests.rate_effective_on`
- enum `PayoutPeriodStatus` และ enum user role ค่า `finance`

ตารางหลักที่คงอยู่คือ `users`, `rider_profiles`, `delivery_zones`, `eligibility_rules`, `delivery_requests`, `delivery_attempts`, `package_qr_tokens`, `delivery_evidence`, `offline_delivery_events`, `sync_conflicts` และ `audit_events`

## การทำงานและสิทธิ์

1. Pharmacy ยืนยัน candidate จาก HOS แล้วเลือกโซน/หมู่บ้านเพื่อสร้าง Delivery Request โดยไม่มีข้อมูลจำนวนเงิน
2. Pharmacy เตรียมพัสดุและออก QR; Rider ที่ล็อกอิน claim QR แบบ atomic ขณะออนไลน์ได้เพียงคนเดียว
3. Rider ทำงานออฟไลน์หลัง claim สำเร็จ; server acknowledge ก่อนล้าง event/หลักฐานในเครื่อง
4. Failed Delivery ต้องระบุเหตุผลและส่งยาคืนภายในวันเดียวกันก่อนสร้าง attempt/QR ใหม่
5. Coordinator แก้ได้เฉพาะที่อยู่/โทรศัพท์ พร้อมเหตุผล, delivery version และ old/new audit; แก้ HN หรือ identity ของพัสดุไม่ได้
6. Auditor อ่าน audit ได้ แต่ไม่มี route หรือ action สำหรับแก้ไขหรือลบ

## การทดสอบและ UAT

การยอมรับระบบเน้นการส่งยาครบวงจรและความปลอดภัยของข้อมูล: HOS read-only, เภสัชกรรม, QR claim, offline pickup/delivery/sync, failed delivery/return/retry, in-transit amendment, conflict review และ audit read-only

ต้องนำ test, route, หน้า UI, seed, เอกสาร UAT/operations/release และข้อความใด ๆ ที่อ้างถึง finance, payout, rate หรือจำนวนเงินออก แล้วรัน migration ใหม่กับ UAT database ว่าง รวมทั้ง test suite, production build และ Compose configuration ก่อนส่ง UAT รอบใหม่

## นอกขอบเขต

ไม่มี payment execution, บัญชีธนาคาร, GPS, OTP, route optimisation, patient notification, consent workflow หรือการเขียนกลับ HOS

## เกณฑ์ความสำเร็จ

ระบบที่สร้างจากฐานข้อมูล UAT ใหม่ไม่มี schema, API, route, role หรือเอกสารปฏิบัติงานเกี่ยวกับค่าตอบแทน และผู้ใช้สามารถทดสอบงานส่งยาตั้งแต่ HOS candidate จนถึงส่งสำเร็จหรือรับยาคืน โดยรักษาสิทธิ์ข้อมูลและ audit trail ตามข้อกำหนดเดิม

# คู่มือตั้งค่า Staging/Production

## Staging

1. สร้าง host และ MariaDB แยกจาก production; จำกัด network ให้เฉพาะผู้ดูแล
2. คัดลอก `.env.example` เป็น environment runtime ที่จัดการผ่าน secret store/ระบบปฏิบัติการ
3. กำหนด `DATABASE_URL`, `HOS_DATABASE_URL`, `HOS_ELIGIBLE_ITEM_CODES`, `AUTH_SECRET`, `EVIDENCE_STORAGE_PATH` โดยไม่ใส่ค่าจริงใน Git; `AUTH_SECRET` ต้องเป็นค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร (เช่น `openssl rand -base64 48`) มิฉะนั้น Compose และการล็อกอินจะไม่ทำงาน
4. บัญชี HOSxP ต้องมี `SELECT` เท่านั้นและจำกัด network source
5. รัน `docker compose up -d --build`; service `migrate` จะรัน `prisma migrate deploy` ให้เสร็จก่อน `web` เริ่มทำงาน
6. สร้างบัญชีและโซน UAT ด้วย `docker compose run --rm -e SEED_UAT_PASSWORD -e SEED_ZONES_FILE migrate npm run db:seed` แล้วทำ UAT ตาม checklist
7. Cookie ของ session ตั้งค่า `Secure` ใน production จึงต้องเข้าผ่าน HTTPS (reverse proxy) ยกเว้นการทดสอบบน `localhost`; ถ้าจำเป็นต้องลองผ่าน HTTP ด้วย IP ในวง LAN ชั่วคราว ตั้ง `SESSION_COOKIE_INSECURE=true` (กล้องสแกน QR และโหมดออฟไลน์ของ rider ยังต้องใช้ HTTPS)
8. Reverse proxy ต้องรับ request body ได้อย่างน้อย 5 MB (เช่น nginx `client_max_body_size 5m;`) เพราะการ sync ส่งยาสำเร็จแนบรูปหลักฐานมาด้วย

## Production gate

- เปลี่ยน development password/secret ทุกตัวก่อนเริ่ม container
- กำหนด HTTPS, reverse proxy/firewall, backup encryption และการเข้าถึง evidence volume
- ตั้ง retention, owner ของ HOSxP account, incident contact และ restore target ตามนโยบายโรงพยาบาล
- ห้ามถือว่า staging credential, HOSxP connectivity หรือ backup ใช้ production ได้โดยอัตโนมัติ

## Backup/restore

- สำรอง MariaDB แบบ consistent backup พร้อมทดสอบ restore ไปยัง isolated host
- สำรอง evidence volume โดยผูกกับรอบ backup เดียวกัน
- บันทึกเวลา RPO/RTO ที่ตกลง, checksum/ผล restore, ผู้ทำ และผลการทดสอบ
- ห้ามทำ restore ทับ production ในการซ้อม

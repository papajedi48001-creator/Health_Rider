# คู่มือตั้งค่า Staging/Production

## Staging

1. สร้าง host และ MariaDB แยกจาก production; จำกัด network ให้เฉพาะผู้ดูแล
2. คัดลอก `.env.example` เป็น environment runtime ที่จัดการผ่าน secret store/ระบบปฏิบัติการ
3. กำหนด `DATABASE_URL`, `HOS_DATABASE_URL`, `HOS_ELIGIBLE_ITEM_CODES`, `AUTH_SECRET`, `EVIDENCE_STORAGE_PATH` โดยไม่ใส่ค่าจริงใน Git
4. บัญชี HOS ต้องมี `SELECT` เท่านั้นและจำกัด network source
5. รัน `docker compose up -d`, `npx prisma migrate deploy`, แล้วทำ UAT ตาม checklist

## Production gate

- เปลี่ยน development password/secret ทุกตัวก่อนเริ่ม container
- กำหนด HTTPS, reverse proxy/firewall, backup encryption และการเข้าถึง evidence volume
- ตั้ง retention, owner ของ HOS account, incident contact และ restore target ตามนโยบายโรงพยาบาล
- ห้ามถือว่า staging credential, HOS connectivity หรือ backup ใช้ production ได้โดยอัตโนมัติ

## Backup/restore

- สำรอง MariaDB แบบ consistent backup พร้อมทดสอบ restore ไปยัง isolated host
- สำรอง evidence volume โดยผูกกับรอบ backup เดียวกัน
- บันทึกเวลา RPO/RTO ที่ตกลง, checksum/ผล restore, ผู้ทำ และผลการทดสอบ
- ห้ามทำ restore ทับ production ในการซ้อม

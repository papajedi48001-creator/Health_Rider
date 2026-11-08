# ข้อมูลทดสอบและบัญชี UAT

ใช้ข้อมูล de-identified เท่านั้น และลบ/หมดอายุบัญชี UAT หลังรอบทดสอบตามนโยบาย

| Role | Username ตัวอย่าง | ใช้ทดสอบ |
| --- | --- | --- |
| pharmacy | `pharmacy.uat` | ยืนยัน candidate, QR, รับยาคืน |
| rider internal | `rider.internal.uat` | claim/offline/sync |
| rider external | `rider.external.uat` | ขอบเขต contractor rider |
| coordinator | `coordinator.uat` | exception/amendment/conflict |
| auditor | `auditor.uat` | read-only audit |
| admin | `admin.uat` | role/configuration verification |
| pharmacy + coordinator | `multi.uat` | บัญชีหลายบทบาท: เลือกบทบาทหลัง login และสลับบทบาท |

บัญชีเหล่านี้สร้างด้วย `npm run db:seed` (ดู `platform/README.md`) โดยใช้รหัสผ่านจาก `SEED_UAT_PASSWORD` ซึ่งต้องยาวอย่างน้อย 12 ตัวอักษรและไม่เก็บใน Git การรัน seed ซ้ำจะตั้งรหัสผ่านใหม่และเปิดใช้งานบัญชีอีกครั้ง

โซน/หมู่บ้านนำเข้าจากไฟล์ CSV ที่กำหนดใน `SEED_ZONES_FILE` (คอลัมน์ `subdistrictCode,villageCode,displayName`) รหัสตำบลเป็นตัวเลข 6 หลัก `chwpart+amppart+tmbpart` และรหัสหมู่บ้านคือ `moopart` ของผู้ป่วยใน HOSxP ตัวอย่างรูปแบบอยู่ที่ `platform/prisma/seed-data/delivery-zones.example.csv` ซึ่งเป็นรหัสทดสอบ `990000` เท่านั้น ส่วนการใช้งานจริงให้นำเข้าโซนจากแท็บ "โซนจัดส่ง" ด้วยปุ่ม "ดึงหมู่บ้านจาก HOSxP"

เตรียม candidate อย่างน้อย 3 รายการ: ส่งสำเร็จ, ส่งไม่สำเร็จ/คืนยา, และงานสำหรับ offline conflict. ไม่ใช้ HN/ชื่อ/โทรศัพท์ของผู้ป่วยจริงในภาพหน้าจอหรือ defect log.

# Release Checklist และ Rollback Plan

## ก่อนเปิดใช้งาน

- [ ] UAT ทุก role ผ่าน และ Critical/High defect ปิดหรือมีการอนุมัติความเสี่ยง
- [ ] ตรวจ release commit/tag, migration และ backup/restore drill
- [ ] production secrets/HOS read-only/firewall/HTTPS ได้รับอนุมัติ
- [ ] แจ้งช่วงเวลาเปลี่ยนระบบ, owner และช่องทาง incident
- [ ] ยืนยัน rollback artifact และ backup ที่ restore ได้

## วันเปิดใช้งาน

- [ ] เริ่มบริการ, ตรวจ healthcheck และ migration log
- [ ] ทดสอบ smoke: login, HOS candidate, QR claim, offline sync และ audit โดยใช้ข้อมูลทดสอบที่อนุญาต
- [ ] เฝ้าดู error log, DB capacity, evidence volume และ HOS read latency

## Rollback

1. หยุดรับงานใหม่และแจ้ง pharmacy/rider ใช้ขั้นตอนสำรองที่โรงพยาบาลอนุมัติ
2. เก็บ log, container/image version, เวลา และข้อมูล incident; ห้ามลบ evidence หรือ audit
3. เปลี่ยนกลับ image/configuration เวอร์ชันก่อนหน้าเมื่อได้รับอนุมัติจาก incident owner
4. Restore DB/evidence เฉพาะจาก backup ที่ผ่านการยืนยัน และทำบนคำสั่งของผู้รับผิดชอบเท่านั้น
5. ตรวจความสอดคล้องของ Delivery Attempt, QR, evidence และ audit ก่อนเปิดรับงานใหม่
6. ทำ post-incident review และกำหนดเกณฑ์ re-release

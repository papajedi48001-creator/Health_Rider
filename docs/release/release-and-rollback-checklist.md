# Release Checklist และ Rollback Plan

## ก่อนเปิดใช้งาน

- [ ] UAT ทุก role ผ่าน และ Critical/High defect ปิดหรือมีการอนุมัติความเสี่ยง
- [ ] ตรวจ release commit/tag, migration และ backup/restore drill
- [ ] production secrets/HOSxP read-only/firewall/HTTPS ได้รับอนุมัติ
- [ ] แจ้งช่วงเวลาเปลี่ยนระบบ, owner และช่องทาง incident
- [ ] ยืนยัน rollback artifact และ backup ที่ restore ได้

## วันเปิดใช้งาน

- [ ] เริ่มบริการ, ตรวจ healthcheck และ migration log
- [ ] ทดสอบ smoke: login, HOSxP candidate, QR claim, offline sync และ audit โดยใช้ข้อมูลทดสอบที่อนุญาต
- [ ] เฝ้าดู error log, DB capacity, evidence volume และ HOSxP read latency

## Rollback

1. หยุดรับงานใหม่และแจ้ง pharmacy/rider ใช้ขั้นตอนสำรองที่โรงพยาบาลอนุมัติ
2. เก็บ log, container/image version, เวลา และข้อมูล incident; ห้ามลบ evidence หรือ audit
3. เมื่อได้รับอนุมัติจาก incident owner ให้ admin ย้อนกลับจากเมนู "ผู้ดูแลระบบ > อัปเดตระบบ" (ย้อนได้ถึงเวอร์ชัน 1.0.0, ดู [system-updates.md](../operations/system-updates.md)) หรือ checkout tag เวอร์ชันก่อนหน้าแล้ว build ใหม่ด้วยมือ
4. Restore DB/evidence เฉพาะจาก backup ที่ผ่านการยืนยัน และทำบนคำสั่งของผู้รับผิดชอบเท่านั้น
5. ตรวจความสอดคล้องของ Delivery Attempt, QR, evidence และ audit ก่อนเปิดรับงานใหม่
6. ทำ post-incident review และกำหนดเกณฑ์ re-release

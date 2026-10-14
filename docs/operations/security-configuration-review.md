# Security/Configuration Review ก่อนใช้งานจริง

- [ ] HOSxP account read-only, จำกัด source IP/network และทดสอบว่า write ถูกปฏิเสธ
- [ ] `AUTH_SECRET` สุ่มยาว, อยู่ใน secret manager/runtime environment, ไม่อยู่ใน Git/log
- [ ] MariaDB ไม่มี host port เปิดสู่เครือข่ายสาธารณะ; มีบัญชีแยก least privilege
- [ ] HTTPS, firewall, access log และ OS patching ได้รับการยืนยันโดยผู้ดูแล
- [ ] Evidence volume ไม่เป็น static public URL และ backup เข้ารหัส
- [ ] Browser/device policy รองรับการล้างข้อมูล local เมื่อเปลี่ยนอุปกรณ์/ถอนสิทธิ์
- [ ] Audit log และ backup/restore owner/retention มีเอกสารตามนโยบายโรงพยาบาล
- [ ] ทำ dependency/security scan ล่าสุดและทบทวน advisory ที่ยังค้างก่อน release

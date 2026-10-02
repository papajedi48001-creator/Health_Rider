# ข้อมูลทดสอบและบัญชี UAT

ใช้ข้อมูล de-identified เท่านั้น และลบ/หมดอายุบัญชี UAT หลังรอบทดสอบตามนโยบาย

| Role | Username ตัวอย่าง | ใช้ทดสอบ |
| --- | --- | --- |
| pharmacy | `uat-pharmacy` | ยืนยัน candidate, QR, รับยาคืน |
| rider internal | `uat-rider-in` | claim/offline/sync |
| rider external | `uat-rider-out` | ขอบเขต contractor rider |
| coordinator | `uat-coordinator` | exception/amendment/conflict |
| finance | `uat-finance` | payout/export |
| auditor | `uat-auditor` | read-only audit |
| admin | `uat-admin` | role/configuration verification |

เตรียม candidate อย่างน้อย 3 รายการ: ส่งสำเร็จ, ส่งไม่สำเร็จ/คืนยา, และงานสำหรับ offline conflict. ไม่ใช้ HN/ชื่อ/โทรศัพท์ของผู้ป่วยจริงในภาพหน้าจอหรือ defect log.

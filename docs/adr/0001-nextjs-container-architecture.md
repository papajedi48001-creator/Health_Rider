# ADR 0001: ใช้ Next.js/React และ MariaDB แบบ Docker Compose

วันที่: 1 ตุลาคม 2026  
สถานะ: Accepted

## บริบท

Health Rider ต้องทำงานเป็นระบบเว็บและ PWA สำหรับไรเดอร์ พร้อมฐานข้อมูลธุรกรรมของตนเอง และอ่าน HOS แบบไม่แก้ไข ผู้ใช้เลือกการพัฒนาและการติดตั้งในรูปแบบ container ด้วย Next.js/React/MariaDB แทนสถาปัตยกรรม Laravel เดิม

## การตัดสินใจ

ใช้ Next.js App Router เป็น web/API boundary, React สำหรับ UI/PWA, Prisma สำหรับ MariaDB schema/query และ Docker Compose สำหรับบริการ `web` กับ `db` HOS เป็น external read-only dependency ที่ตั้งค่าด้วย environment variable แยกต่างหาก

## ผลตามมา

- ทีมได้ runtime และการติดตั้งที่มี Node.js/Compose เป็นมาตรฐานเดียว
- ต้องทดสอบ route handlers, client offline queue และ database transaction ในชุดทดสอบ JavaScript/TypeScript
- HOS connectivity, credential และ backup/restore production ยังเป็นเรื่องที่ต้องจัดการโดยโรงพยาบาลก่อนใช้งานจริง

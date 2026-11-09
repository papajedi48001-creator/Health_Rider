# อัปเดตและย้อนกลับเวอร์ชันจากหน้าเว็บ

เมนู **ผู้ดูแลระบบ > อัปเดตระบบ** (`/health-rider/admin/updates`) ใช้ได้เฉพาะ admin

- แสดงเวอร์ชันที่ใช้อยู่ และทุกเวอร์ชันที่ติดตั้งได้ พร้อมวันเวลาที่ออกและ "มีอะไรใหม่"
- กด **อัปเดตเป็นเวอร์ชันนี้** หรือ **ย้อนกลับเป็นเวอร์ชันนี้** ต้องกรอกเหตุผล ซึ่งบันทึกในประวัติการตรวจสอบ
- ย้อนกลับได้ถึงเวอร์ชัน **1.0.0** เท่านั้น (เวอร์ชันแรกที่มีระบบนี้) เวอร์ชันก่อนหน้านั้นไม่มีตัวอัปเดต จึงย้อนกลับมาไม่ได้
- ทุกครั้งที่เปลี่ยนเวอร์ชัน เซิร์ฟเวอร์จะ: สำรองฐานข้อมูล → ดึงโค้ดตาม tag → `docker compose up -d --build` → ตรวจว่าเวอร์ชันใหม่ตอบ `/api/version` ถ้าไม่ผ่าน จะกลับไปเวอร์ชันเดิมให้อัตโนมัติ
- ผลทุกครั้งแสดงในตาราง "ประวัติการอัปเดตและย้อนกลับ" ท้ายหน้า

## การทำงาน

แอปใน Docker ไม่มีสิทธิ์สั่ง git หรือ docker เอง แต่จะเขียนคำสั่งลงโฟลเดอร์ที่ใช้ร่วมกับเครื่องแม่:

| ไฟล์ใน `/var/lib/health-rider-updater` | ใครเขียน | เนื้อหา |
|---|---|---|
| `request.json` | แอป (เมื่อ admin กดปุ่ม) | คำสั่งที่รออยู่ 1 รายการ |
| `status.json` | ตัวอัปเดตบนเครื่องแม่ | เวอร์ชันที่ติดตั้งได้, งานที่กำลังทำ, ประวัติ 30 รายการ |

ตัวอัปเดต (`platform/deploy/updater/health-rider-updater.py`) รันจาก systemd timer ทุก 1 นาทีในฐานะ root
ดึง tag ใหม่จาก GitHub ทุก 10 นาที หรือทันทีเมื่อ admin กด "ตรวจหาเวอร์ชันใหม่ตอนนี้"
ตัวอัปเดตตรวจคำสั่งซ้ำทุกข้อ (รูปแบบเวอร์ชัน, มี tag จริง, ไม่ต่ำกว่า 1.0.0) ไม่เชื่อสิ่งที่แอปเขียนมา

## ติดตั้งครั้งแรก (ทำครั้งเดียวบนเครื่อง .251)

1. อัปเดตโค้ดเป็นเวอร์ชันที่มีระบบนี้ (ครั้งสุดท้ายที่ต้องทำด้วยมือ):

   ```bash
   cd /opt/health-rider
   git fetch --tags origin
   git checkout v1.0.0
   ```

2. ติดตั้งตัวอัปเดต (สร้างโฟลเดอร์ร่วม, `/etc/health-rider-updater.env`, systemd timer และเพิ่ม `UPDATER_STATE_DIR` ใน `.env.production`):

   ```bash
   sudo apt install -y mariadb-client python3     # Ubuntu/Debian
   sudo dnf install -y mariadb python3 policycoreutils-python-utils   # Rocky/AlmaLinux/RHEL
   sudo bash /opt/health-rider/platform/deploy/updater/install.sh
   ```

3. ตรวจ `HR_HEALTH_URL` ใน `/etc/health-rider-updater.env` ถ้า `WEB_PUBLISH` ไม่ใช่ `127.0.0.1:3000` ให้แก้ให้ตรง เช่น `http://192.168.1.251:3000/health-rider/api/version`

4. สร้างระบบใหม่ให้ container เห็นโฟลเดอร์ร่วม:

   ```bash
   cd /opt/health-rider/platform
   docker compose -f compose.production.yaml --env-file .env.production up -d --build
   ```

5. เปิดหน้า "อัปเดตระบบ" ต้องเห็นเวอร์ชัน 1.0.0 และ "ตรวจหาเวอร์ชันใหม่ล่าสุด" ภายใน 1-2 นาที

ตรวจสถานะ: `systemctl status health-rider-updater.timer` · log: `journalctl -u health-rider-updater -n 100`

repo เป็น private: บัญชี root ต้อง `git fetch` ได้ (ใช้ credential เดียวกับตอน clone หรือ deploy key) ถ้าดึงไม่ได้ หน้าเว็บจะแสดง "ดึงเวอร์ชันใหม่จาก GitHub ไม่ได้"

### ค่าใน `/etc/health-rider-updater.env`

| ค่า | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `HR_REPO_DIR` | `/opt/health-rider` | โฟลเดอร์ที่ clone repo |
| `HR_STATE_DIR` | `/var/lib/health-rider-updater` | โฟลเดอร์ร่วมกับแอป (ต้องตรงกับ `UPDATER_STATE_DIR` ใน `.env.production`) |
| `HR_HEALTH_URL` | `http://127.0.0.1:3000/health-rider/api/version` | ที่อยู่ที่ใช้ตรวจว่าเวอร์ชันใหม่เปิดได้ |
| `HR_HEALTH_TIMEOUT` | `300` | วินาทีที่รอให้เวอร์ชันใหม่ตอบ ก่อนย้อนกลับอัตโนมัติ |
| `HR_FETCH_INTERVAL` | `600` | วินาทีระหว่างการดึง tag จาก GitHub |
| `HR_BACKUP` | `required` | `off` = ไม่สำรองฐานข้อมูล (ไม่แนะนำ) |
| `HR_BACKUP_DIR` / `HR_BACKUP_KEEP` | `/var/backups/health-rider` / `14` | ที่เก็บไฟล์สำรอง `.sql.gz` และจำนวนที่เก็บไว้ |

ไฟล์สำรองมีข้อมูลผู้ป่วย เก็บในโฟลเดอร์สิทธิ์ root เท่านั้น (0700) รูปหลักฐานการส่งอยู่ใน Docker volume ซึ่งการเปลี่ยนเวอร์ชันไม่แตะ

## ออกเวอร์ชันใหม่ (ฝั่งผู้พัฒนา)

1. เพิ่มรายการไว้บนสุดของ `platform/releases.json`:

   ```json
   {
     "version": "1.1.0",
     "releasedAt": "2026-11-20T14:00:00+07:00",
     "title": "พิมพ์ฉลากซ้ำและหมุนฉลาก 180°",
     "schemaChange": false,
     "whatsNew": ["พิมพ์ฉลาก QR ซ้ำได้จากหน้ารอไรเดอร์", "เลือกหมุนฉลาก 180° ในตั้งค่าฉลาก"]
   }
   ```

   - เวอร์ชันแบบ `major.minor.patch` แก้บั๊กเพิ่ม patch, เพิ่มฟีเจอร์เพิ่ม minor
   - `schemaChange: true` เมื่อเวอร์ชันนั้นมี migration ใหม่ หน้าเว็บจะเตือนตอนย้อนกลับผ่านเวอร์ชันนี้
   - ห้ามลบหรือแก้ `rollbackFloor` และรายการเก่า (เทสต์ตรวจไว้)
2. merge เข้า `codex/health-rider-nextjs` แล้วติด tag ที่ commit นั้น: `git tag v1.1.0 && git push origin v1.1.0`
3. ภายใน 10 นาที เวอร์ชันใหม่จะขึ้นในหน้า "อัปเดตระบบ" ให้ admin กดอัปเดตเอง ระบบไม่อัปเดตอัตโนมัติ

### กติกา migration เพื่อให้ย้อนกลับได้

การย้อนกลับเปลี่ยนเฉพาะโค้ด ไม่ย้อนฐานข้อมูล (`prisma migrate deploy` ของเวอร์ชันเก่าเจอ migration ที่ใหม่กว่าในฐานแล้วจะข้ามไป ไม่ error ทดสอบกับ MariaDB แล้ว) ดังนั้น migration ต้อง **เพิ่มอย่างเดียว**:

- เพิ่มตารางหรือคอลัมน์ใหม่ได้ คอลัมน์ใหม่ต้อง nullable หรือมีค่า default
- ห้ามลบหรือเปลี่ยนชื่อคอลัมน์/ตารางที่เวอร์ชันเก่ายังใช้ในเวอร์ชันเดียวกัน ให้ทำในเวอร์ชันถัดไปหลังมั่นใจว่าจะไม่ย้อนกลับแล้ว
- ถ้าจำเป็นต้องเปลี่ยนแบบย้อนไม่ได้ ให้แจ้ง admin ว่าย้อนกลับต้องใช้ไฟล์สำรองฐานข้อมูล

### กติกาของไฟล์ร่วม

`status.json` และ `request.json` ต้องอ่านได้ทั้งเวอร์ชันเก่าและใหม่ เพิ่มฟิลด์ได้ แต่ห้ามเปลี่ยนความหมายหรือลบฟิลด์เดิม
ถ้าแก้ `health-rider-updater.py` หรือไฟล์ systemd ของมัน ให้เพิ่มเลข `UPDATER_REVISION` ในสคริปต์ หลังอัปเดตสำเร็จ ตัวอัปเดตจะเห็นว่ารุ่นในโค้ดใหม่กว่ารุ่นที่ติดตั้ง (`/usr/local/lib/health-rider-updater`) แล้วติดตั้งให้เอง การย้อนกลับไม่ติดตั้งตัวอัปเดตรุ่นเก่ากลับ (ตัวอัปเดตของ 1.0.0 ยังไม่มีความสามารถนี้ การอัปเดตจาก 1.0.0 เป็น 1.0.1 จึงต้องรัน `install.sh` เองหนึ่งครั้ง)

## ถ้ามีปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| "ยังไม่ได้ติดตั้งตัวอัปเดตบนเซิร์ฟเวอร์" | ยังไม่ได้ทำขั้นตอนติดตั้ง หรือ build image ก่อนติดตั้ง |
| "แอปเขียนโฟลเดอร์ของตัวอัปเดตไม่ได้" | โฟลเดอร์ต้องเป็นของ uid `1001` mode `0770` และถ้า SELinux เปิด (`getenforce` = Enforcing) ต้องมี label `container_file_t` รัน `install.sh` ใหม่ (เครื่อง Rocky/RHEL ติดตั้ง `policycoreutils-python-utils` ก่อน) |
| "ไม่ได้รายงานสถานะเกิน 3 นาที" | timer หยุด: `systemctl enable --now health-rider-updater.timer` แล้วดู `journalctl -u health-rider-updater` |
| งานขึ้น "ไม่สำเร็จ ... กลับไปใช้เวอร์ชันเดิมแล้ว" | เวอร์ชันใหม่ build หรือเปิดไม่ขึ้น ระบบกลับเวอร์ชันเดิมให้แล้ว ดูข้อความใน log |
| "กลับไปเวอร์ชันเดิมไม่สำเร็จ" | ต้องแก้บนเครื่อง: `git checkout v<เวอร์ชันเดิม>` แล้ว `docker compose ... up -d --build` และถ้าจำเป็น restore จากไฟล์ใน `/var/backups/health-rider` |
| "มีไฟล์ในโฟลเดอร์ระบบถูกแก้ไขด้วยมือ" | มีคนแก้ไฟล์ใน `/opt/health-rider` ดู `git status` แล้วย้ายการแก้ไปไว้ใน `.env.production` หรือ `git stash` |

# ขึ้นระบบ Production: waritch-hosp.moph.go.th/health-rider

ระบบเปิดให้ใช้ที่ `https://waritch-hosp.moph.go.th/health-rider` และเก็บข้อมูลใน MariaDB ของโรงพยาบาลที่ `192.168.1.254`

```
ผู้ใช้ ──HTTPS──> reverse proxy ของโดเมนโรงพยาบาล ──HTTP──> เครื่องแอป :3000 (Docker: web)
                                                              └──> MariaDB 192.168.1.254:3306 (ฐาน health_rider)
```

HTTPS และใบรับรองดูแลโดย reverse proxy ของโดเมนโรงพยาบาล จึงไม่ต้องใช้ Caddy (`--profile https`) และไม่ต้องรัน MariaDB ใน Docker

## 1. เตรียมฐานข้อมูลบน 192.168.1.254

ใช้ฐานข้อมูลและบัญชีแยกของ Health Rider เท่านั้น ห้ามสร้างตารางใน schema ของ HOSxP และห้ามใช้บัญชี root ของเซิร์ฟเวอร์

```sql
CREATE DATABASE health_rider CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- เปลี่ยน 192.168.1.50 เป็น IP ของเครื่องที่รันแอป
CREATE USER 'health_rider'@'192.168.1.50' IDENTIFIED BY 'รหัสผ่านสุ่มยาว';
GRANT ALL PRIVILEGES ON health_rider.* TO 'health_rider'@'192.168.1.50';
```

- สิทธิ์ `ALL` จำกัดเฉพาะฐาน `health_rider` เพราะการ migrate ต้องสร้างและแก้ตาราง
- MariaDB ควรเป็นเวอร์ชัน 10.6 ขึ้นไป (CI ทดสอบกับ 11.7) ตรวจด้วย `SELECT VERSION();`
- `bind-address` ของ MariaDB ต้องรับการเชื่อมต่อจากวง LAN และ firewall ควรเปิดพอร์ต 3306 ให้เฉพาะ IP เครื่องแอป
- สร้างรหัสผ่านสุ่มด้วย `openssl rand -hex 24` เพื่อไม่ให้มีอักขระที่ต้อง encode ใน URL ถ้าใช้อักขระพิเศษ เช่น `@ : / #` ต้อง URL-encode ก่อนใส่ใน `DATABASE_URL`
- ทดสอบจากเครื่องแอปด้วย `mariadb -h 192.168.1.254 -u health_rider -p health_rider -e 'SELECT 1'`

บัญชีอ่าน HOSxP เป็นอีกบัญชีหนึ่ง ให้สิทธิ์ `SELECT` เท่านั้น (เปลี่ยน `hos` เป็นชื่อฐาน HOSxP จริง) แล้วกรอกที่เมนูตั้งค่าระบบ (ข้อ 6) หรือใส่ใน `HOS_DATABASE_URL`

```sql
CREATE USER 'hr_hos_read'@'192.168.1.50' IDENTIFIED BY 'รหัสผ่านสุ่มยาว';
GRANT SELECT ON hos.* TO 'hr_hos_read'@'192.168.1.50';
```

## 2. ตั้งค่าบนเครื่องแอป

```bash
git clone https://github.com/papajedi48001-creator/health_rider.git
cd health_rider/platform
cp .env.production.example .env.production
chmod 600 .env.production
```

แก้ `.env.production`:

| ตัวแปร | ค่า |
| --- | --- |
| `DATABASE_URL` | `mysql://health_rider:<รหัสผ่าน>@192.168.1.254:3306/health_rider` |
| `AUTH_SECRET` | ค่าสุ่มอย่างน้อย 32 ตัวอักษร: `openssl rand -base64 48` |
| `NEXT_PUBLIC_BASE_PATH` | `/health-rider` (ค่าเริ่มต้นของไฟล์นี้อยู่แล้ว) |
| `HOS_DATABASE_URL`, `HOS_ELIGIBLE_ITEM_CODES` | ไม่บังคับ ตั้งที่เมนูตั้งค่าระบบแทนได้ |
| `WEB_PUBLISH` | เว้นว่างถ้า reverse proxy อยู่เครื่องเดียวกัน ถ้าอยู่คนละเครื่องใส่ `<IP เครื่องแอป>:3000` แล้วตั้ง firewall ให้พอร์ตนี้รับเฉพาะเครื่อง proxy |

ไฟล์ `.env.production` ถูก gitignore และไม่ถูกคัดลอกเข้า image ห้ามส่งไฟล์นี้ผ่านแชทหรืออีเมล

`NEXT_PUBLIC_BASE_PATH` ถูกฝังตอน build ถ้าเปลี่ยนค่าต้อง build image ใหม่

Docker network ของแอปใช้วง `10.250.252.0/24` (ตั้งได้ที่ `DOCKER_SUBNET`) เพราะวง `172.x` ที่ Docker เลือกเองอาจชนกับเครือข่ายโรงพยาบาล ทำให้ SSH เข้าเครื่องไม่ได้ ต้องไม่ซ้ำกับวงที่ใช้อยู่ (ตรวจด้วย `ip route` และ `docker network ls`)

## 3. Build และเริ่มระบบ

```bash
docker compose -f compose.production.yaml --env-file .env.production up -d --build
docker compose -f compose.production.yaml --env-file .env.production logs migrate   # ต้องจบด้วย migrations applied
curl -I http://127.0.0.1:3000/health-rider/login                                    # ต้องได้ 200
```

service `migrate` รัน `prisma migrate deploy` กับฐานบน 192.168.1.254 ให้เสร็จก่อน `web` เริ่ม ถ้าเชื่อมฐานไม่ได้ `web` จะไม่เริ่ม

## 4. ตั้ง reverse proxy ของโดเมน

ส่งต่อ path `/health-rider` ไปที่แอป **โดยไม่ตัด prefix ออก** เพราะแอปรู้ตัวเองว่าอยู่ใต้ `/health-rider`

nginx:

```nginx
location /health-rider {
    proxy_pass http://127.0.0.1:3000;          # ไม่มี / หรือ path ต่อท้าย เพื่อส่ง URL เดิมทั้งหมด
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 5m;                   # การ sync ส่งยาสำเร็จแนบรูปหลักฐาน
}
```

Apache (mod_proxy):

```apache
ProxyPreserveHost On
ProxyPass        /health-rider http://127.0.0.1:3000/health-rider
ProxyPassReverse /health-rider http://127.0.0.1:3000/health-rider
RequestHeader set X-Forwarded-Proto "https"
LimitRequestBody 5242880
```

ถ้า proxy อยู่คนละเครื่อง เปลี่ยน `127.0.0.1` เป็น IP เครื่องแอป

- ระบบจำกัดการเดารหัสผ่านตาม IP ผู้ใช้จากค่า `X-Forwarded-For` ตัวสุดท้าย proxy จึงต้องต่อท้าย IP จริงของผู้ใช้ (ค่าข้างบนทำแล้ว) ถ้ามี proxy ซ้อนสองชั้น ชั้นที่ติดกับแอปต้องส่ง IP ที่ได้จากชั้นนอกมาเป็นตัวสุดท้าย
- **โดเมนที่ผ่าน Cloudflare** IP ที่ nginx เห็นคือ IP ของ Cloudflare ไม่ใช่ผู้ใช้ ถ้าไม่แก้ ผู้ใช้หลายคนจะใช้โควตาเดารหัสผิดร่วมกัน (50 ครั้งต่อ 15 นาที) และอาจถูกล็อกพร้อมกัน ให้เพิ่มใน `http {}` ของ nginx เพื่อคืน IP จริงจาก `CF-Connecting-IP` เฉพาะคำขอที่มาจาก Cloudflare จริง (รายการ IP ล่าสุดอยู่ที่ https://www.cloudflare.com/ips/):

  ```nginx
  set_real_ip_from 173.245.48.0/20;
  set_real_ip_from 103.21.244.0/22;
  set_real_ip_from 103.22.200.0/22;
  set_real_ip_from 103.31.4.0/22;
  set_real_ip_from 141.101.64.0/18;
  set_real_ip_from 108.162.192.0/18;
  set_real_ip_from 190.93.240.0/20;
  set_real_ip_from 188.114.96.0/20;
  set_real_ip_from 197.234.240.0/22;
  set_real_ip_from 198.41.128.0/17;
  set_real_ip_from 162.158.0.0/15;
  set_real_ip_from 104.16.0.0/13;
  set_real_ip_from 104.24.0.0/14;
  set_real_ip_from 172.64.0.0/13;
  set_real_ip_from 131.0.72.0/22;
  set_real_ip_from 2400:cb00::/32;
  set_real_ip_from 2606:4700::/32;
  set_real_ip_from 2803:f800::/32;
  set_real_ip_from 2405:b500::/32;
  set_real_ip_from 2405:8100::/32;
  set_real_ip_from 2a06:98c0::/29;
  set_real_ip_from 2c0f:f248::/32;
  real_ip_header CF-Connecting-IP;
  ```

  เมื่อตั้งแล้ว `$proxy_add_x_forwarded_for` ในบล็อกข้างบนจะต่อท้ายด้วย IP จริงของผู้ใช้เอง ไม่ต้องแก้แอป ตรวจได้จาก log ของ nginx ว่าคอลัมน์ IP เป็น IP ผู้ใช้ ไม่ใช่ 172.64.x / 104.x
- Cookie ของระบบผูกกับ path `/health-rider` จึงไม่ปนกับระบบอื่นในโดเมนเดียวกัน
- ทดสอบ: เปิด `https://waritch-hosp.moph.go.th/health-rider` ต้องเด้งไปหน้าเข้าสู่ระบบ และรูปมาสคอตต้องแสดง

## 5. บัญชีแรกและก่อนเปิดใช้จริง

1. สร้างบัญชีชุดแรกด้วย seed (ครั้งเดียว):
   ```bash
   docker compose -f compose.production.yaml --env-file .env.production run --rm -e SEED_UAT_PASSWORD='รหัสชั่วคราวยาว' migrate npm run db:seed
   ```
2. เข้าด้วย `admin.uat` สร้างบัญชี admin จริงของโรงพยาบาล
3. เข้าด้วย admin จริง แล้ว**ปิดบัญชี `*.uat` ทุกบัญชี** เพราะ seed ใช้รหัสเดียวกันทุกบัญชี
4. เจ้าหน้าที่และไรเดอร์สมัครเองได้ที่หน้าเข้าสู่ระบบ แล้ว admin อนุมัติในหน้า "บัญชีผู้ใช้"
5. ติดตั้งเป็นแอปเพื่อเปิดแบบไม่มีแถบที่อยู่ แอปจะเปิดหน้าแรกตามบทบาทของผู้ใช้ (ไรเดอร์ไปหน้าสแกน)
   - คอมพิวเตอร์ (Chrome/Edge): เปิด `https://waritch-hosp.moph.go.th/health-rider` แล้วกดไอคอน "ติดตั้งแอป" ท้ายแถบที่อยู่ หรือเมนู ⋮ > "ส่งแคสต์ บันทึก และแชร์" > "ติดตั้งหน้าเว็บเป็นแอป"
   - Android (Chrome): เมนู ⋮ > "เพิ่มลงในหน้าจอหลัก" > "ติดตั้ง"
   - iPhone (Safari): ปุ่มแชร์ > "เพิ่มไปยังหน้าจอโฮม"

## 6. ตั้งค่าระบบในหน้าเว็บ

เมนู "ผู้ดูแลระบบ > ตั้งค่าระบบ" (`/health-rider/admin/settings`) ใช้ได้เฉพาะ admin

- **การเชื่อมต่อ HOSxP**: host, port, ชื่อฐาน, บัญชีอ่านอย่างเดียว และรหัสยาที่ส่งถึงบ้านได้ (icode) กด "ทดสอบการเชื่อมต่อ" ก่อน "บันทึก" ได้ ค่าที่บันทึกมีผลทันทีและใช้แทน `HOS_DATABASE_URL` / `HOS_ELIGIBLE_ITEM_CODES` ใน `.env.production` ปุ่ม "กลับไปใช้ค่าจาก .env" ลบค่าที่บันทึกไว้
- รหัสผ่าน HOSxP ถูกเข้ารหัสด้วยกุญแจที่ได้จาก `AUTH_SECRET` ถ้าเปลี่ยน `AUTH_SECRET` ต้องกรอกรหัสผ่าน HOSxP ใหม่
- **ค่าตั้งของเซิร์ฟเวอร์** (ฐานข้อมูล, `AUTH_SECRET`, path ของเว็บ, cookie, ที่เก็บรูปหลักฐาน) แสดงสถานะอย่างเดียว ไม่แสดงรหัสผ่านหรือ secret ค่าเหล่านี้ยังแก้ใน `.env.production`
- ทุกการบันทึกถูกเก็บในประวัติการตรวจสอบ (ไม่มีรหัสผ่าน)

## 7. อัปเดตเวอร์ชัน

```bash
git pull
docker compose -f compose.production.yaml --env-file .env.production up -d --build
```

สำรองฐานก่อนอัปเดตทุกครั้ง (ข้อ 8) เพราะ migration อาจแก้ตาราง

## 8. สำรองข้อมูล

- ฐานข้อมูล: `mariadb-dump --single-transaction -h 192.168.1.254 -u health_rider -p health_rider > health_rider-$(date +%F).sql`
- รูปหลักฐานการส่ง: volume `health-rider-evidence` บนเครื่องแอป เช่น
  `docker run --rm -v platform_health-rider-evidence:/data -v "$PWD":/backup alpine tar czf /backup/evidence-$(date +%F).tgz -C /data .`
  (ชื่อ volume ดูได้จาก `docker volume ls`)
- สำรองทั้งสองอย่างในรอบเดียวกัน และเก็บไฟล์สำรองในที่ที่เข้ารหัสหรือจำกัดสิทธิ์ เพราะมีข้อมูลผู้ป่วย

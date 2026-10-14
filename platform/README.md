# Health Rider platform

ระบบบริหารการส่งยาถึงบ้าน โรงพยาบาลวาริชภูมิ (Next.js + Prisma + MariaDB) ขอบเขตและคำศัพท์อยู่ที่ `../CONTEXT.md` และ `../docs/superpowers/specs/`

## รันด้วย Docker Compose

```bash
cp .env.example .env            # ตั้ง AUTH_SECRET, รหัสผ่าน MariaDB และ SEED_UAT_PASSWORD
docker compose up -d --build    # db → migrate (prisma migrate deploy) → web
docker compose run --rm -e SEED_UAT_PASSWORD -e SEED_ZONES_FILE=prisma/seed-data/delivery-zones.example.csv migrate npm run db:seed
```

เปิด `http://localhost:3000` แล้วล็อกอินด้วยบัญชี `*.uat` (รายชื่อใน `../docs/operations/test-data-and-accounts.md`)

## พัฒนาบนเครื่อง

ต้องใช้ Node.js 22.18 ขึ้นไป และ MariaDB ที่เข้าถึงได้จาก `DATABASE_URL`

```bash
npm ci
npx prisma generate
npm run db:migrate
SEED_UAT_PASSWORD=... SEED_ZONES_FILE=prisma/seed-data/delivery-zones.example.csv npm run db:seed
AUTH_SECRET=... npm run dev
```

## ตรวจสอบ

```bash
npm run typecheck
npm test                         # integration test ของ MariaDB รันเมื่อมี DATABASE_URL
npm run build
# browser tests ต้องมี server ที่ seed แล้ว
E2E_PASSWORD=$SEED_UAT_PASSWORD PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

ตั้ง `PLAYWRIGHT_CHROMIUM_EXECUTABLE` เพื่อใช้ Chromium ที่ติดตั้งไว้แล้วแทนการดาวน์โหลด

## การล็อกอินและสิทธิ์

- Session เก็บในตาราง `sessions` (เก็บเฉพาะ HMAC ของ token ด้วย `AUTH_SECRET`) อายุ 12 ชั่วโมง ปิดบัญชี (`users.active = false`) แล้วใช้งานต่อไม่ได้ทันที
- Cookie เป็น `HttpOnly`, `SameSite=Lax` และ `Secure` เมื่อ `NODE_ENV=production`
- `src/proxy.ts` ส่งผู้ที่ไม่มี session ไปหน้า `/login`; layout ของแต่ละส่วนตรวจบทบาทอีกชั้น และทุก API ตรวจบทบาทเอง
- ล็อกอินผิด 10 ครั้งใน 15 นาทีต่อชื่อผู้ใช้จะถูกพักชั่วคราว

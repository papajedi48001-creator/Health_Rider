import { HeroBanner } from '@/brand/hero-banner';
import { AccountProfile } from '@/account/account-profile';

export default function AccountPage() {
  return (
    <main className="account-page">
      <HeroBanner title="บัญชีของฉัน" text="ข้อมูลส่วนตัว รูปโปรไฟล์ และรหัสผ่านของคุณ" />
      <AccountProfile />
    </main>
  );
}

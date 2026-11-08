import { HeroBanner } from '@/brand/hero-banner';
import { AdminSettings } from '@/app/(staff)/admin/admin-settings';
import { HealthCenterSettings } from '@/app/(staff)/admin/health-center-settings';

export default function AdminSettingsPage() {
  return (
    <main>
      <HeroBanner title="ตั้งค่าระบบ" text="ตั้งค่าการทำงานของระบบ ภูไทไรเดอร์" />
      <h1>ตั้งค่าระบบ</h1>
      <HealthCenterSettings />
      <AdminSettings />
    </main>
  );
}

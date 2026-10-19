import { AdminSettings } from '@/app/(staff)/admin/admin-settings';
import { HealthCenterSettings } from '@/app/(staff)/admin/health-center-settings';

export default function AdminSettingsPage() {
  return (
    <main>
      <h1>ตั้งค่าระบบ</h1>
      <HealthCenterSettings />
      <AdminSettings />
    </main>
  );
}

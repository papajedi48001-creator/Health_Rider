import { AdminLicense } from '@/app/(staff)/admin/admin-license';
import { AdminSettings } from '@/app/(staff)/admin/admin-settings';

export default function AdminSettingsPage() {
  return (
    <main>
      <h1>ตั้งค่าระบบ</h1>
      <AdminSettings />
      <AdminLicense />
    </main>
  );
}

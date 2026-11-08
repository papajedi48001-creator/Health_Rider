import { HeroBanner } from '@/brand/hero-banner';
import { AdminZones } from '@/app/(staff)/admin/admin-zones';

export default function AdminZonesPage() {
  return (
    <main>
      <HeroBanner title="โซนจัดส่ง" text="จัดการโซนและพื้นที่ที่ให้บริการส่งยา" />
      <h1>โซนจัดส่ง</h1>
      <AdminZones />
    </main>
  );
}

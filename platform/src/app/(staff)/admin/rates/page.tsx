import { HeroBanner } from '@/brand/hero-banner';
import { AdminRates } from '@/app/(staff)/admin/admin-rates';

export default function AdminRatesPage() {
  return (
    <main>
      <HeroBanner title="ค่าบริการ" text="ตั้งอัตราค่าบริการต่องานของแต่ละโซน" />
      <h1>ค่าบริการ</h1>
      <AdminRates />
    </main>
  );
}

import Link from 'next/link';
import { AccountProfile } from '@/account/account-profile';
import { Icon } from '@/brand/icons';
import { InstallAppButton } from '@/pwa/install-app-button';
import { RiderFeedback } from '@/feedback/rider-feedback';

export default function RiderProfilePage() {
  return (
    <main className="rider-page">
      <AccountProfile />
      <InstallAppButton />
      <RiderFeedback />
      <Link href="/help#rider" className="btn btn-secondary"><Icon name="info" /> คู่มือการใช้งาน</Link>
    </main>
  );
}

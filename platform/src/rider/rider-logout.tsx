'use client';

import { useState, type FormEvent } from 'react';
import { Icon } from '@/brand/icons';
import { clearOfflineData } from '@/pwa/indexeddb-store';
import { riderQueue, syncRiderQueue } from '@/pwa/rider-sync';

// Signing out clears the patient data kept on the phone for offline work, so the next person to use the
// phone cannot read it. Records not yet sent are synced first; if that fails the rider decides.
export function RiderLogout() {
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      if ((await riderQueue.pending()).length > 0) await syncRiderQueue();
      const remaining = (await riderQueue.pending()).length;
      if (remaining > 0 && !window.confirm(`ยังมี ${remaining} รายการที่ยังไม่ได้ส่งเข้าระบบ ถ้าออกจากระบบตอนนี้ รายการเหล่านี้จะถูกลบจากเครื่อง\n\nกด "ยกเลิก" แล้วต่อสัญญาณเพื่อส่งข้อมูลก่อน หรือกด "ตกลง" เพื่อออกจากระบบและลบรายการ`)) {
        setBusy(false);
        return;
      }
      await clearOfflineData();
    } catch {
      // The browser blocked storage access; sign out anyway.
    }
    form.submit();
  }

  return (
    <form action="/api/auth/logout" method="post" onSubmit={(event) => void submit(event)}>
      <button type="submit" className="rider-logout" aria-label="ออกจากระบบ" disabled={busy}>
        <Icon name="logout" />
      </button>
    </form>
  );
}

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '@/lib/api-client';
import { deliveryTierNotice } from '@/license/delivery-tier';
import { planLabels, type LicenseState, type LicenseStatus } from '@/license/license';

type LicenseInfo = { license: LicenseState & { installationId: string | null }; activeRiders: number; deliveriesThisMonth: number };

const statusLabels: Record<LicenseStatus, string> = {
  unconfigured: 'เวอร์ชันนี้ยังไม่เปิดใช้ระบบ license',
  unactivated: 'ยังไม่ได้เปิดใช้งาน',
  invalid: 'token key ใช้ไม่ได้',
  active: 'ใช้งานได้',
  grace: 'หมดอายุ อยู่ในช่วงผ่อนผัน',
  expired: 'หมดอายุ',
  clockBack: 'เวลาเครื่องเซิร์ฟเวอร์ย้อนหลัง',
};

function thaiDate(date: string | null) {
  if (!date) return 'ไม่มีวันหมดอายุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

// Shows the key in use and takes a new one from the vendor to renew; the change applies at once.
export function AdminLicense() {
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<LicenseInfo>('/api/admin/license');
    if (!result.ok) return setMessage(result.message);
    setInfo(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await callApi('/api/license', { method: 'POST', json: { token } });
    setBusy(false);
    if (!result.ok) return setMessage(`บันทึกไม่สำเร็จ: ${result.message}`);
    setToken('');
    setMessage('บันทึก token key แล้ว มีผลทันที');
    await load();
  }

  if (!info) return <section aria-labelledby="settings-license"><h2 id="settings-license">License</h2><p aria-live="polite">{message || 'กำลังโหลด'}</p></section>;
  const { license } = info;
  const current = license.license;
  const tierNotice = deliveryTierNotice(current, info.deliveriesThisMonth);

  return (
    <section aria-labelledby="settings-license">
      <h2 id="settings-license">License</h2>
      <p>สถานะ: <strong>{statusLabels[license.status]}</strong></p>
      {license.message && <p className={license.status === 'active' ? 'notice' : 'notice notice-danger'}>{license.message}</p>}
      {tierNotice && <p className="notice">{tierNotice}</p>}
      {license.status !== 'unconfigured' && (
        <table>
          <tbody>
            <tr><th scope="row">รหัสเครื่อง</th><td><code>{license.installationId}</code></td></tr>
            {current && (
              <>
                <tr><th scope="row">หน่วยงาน</th><td>{current.licensee.name}</td></tr>
                <tr><th scope="row">เลขที่ key</th><td><code>{current.keyId}</code></td></tr>
                <tr><th scope="row">ประเภท</th><td>{planLabels[current.plan]}</td></tr>
                <tr><th scope="row">ใช้งานได้ถึง</th><td>{thaiDate(current.expiresAt)}</td></tr>
                <tr><th scope="row">ไรเดอร์ที่ใช้งานอยู่</th><td>{info.activeRiders} / {current.maxRiders ?? 'ไม่จำกัด'} คน</td></tr>
                <tr><th scope="row">งานส่งยาเดือนนี้</th><td>{info.deliveriesThisMonth.toLocaleString('th-TH')} / {current.maxDeliveriesPerMonth?.toLocaleString('th-TH') ?? 'ไม่จำกัด'} งาน</td></tr>
              </>
            )}
          </tbody>
        </table>
      )}
      {license.status !== 'unconfigured' && (
        <form onSubmit={(event) => void activate(event)}>
          <label>
            ต่ออายุหรือเปลี่ยน token key
            <textarea rows={3} value={token} onChange={(event) => setToken(event.target.value)} placeholder="HR1...." spellCheck={false} autoComplete="off" />
          </label>
          <button type="submit" disabled={busy || !token.trim()}>{busy ? 'กำลังตรวจสอบ' : 'บันทึก token key'}</button>
        </form>
      )}
      <p aria-live="polite" className={message.startsWith('บันทึกไม่สำเร็จ') ? 'notice notice-danger' : undefined}>{message}</p>
    </section>
  );
}

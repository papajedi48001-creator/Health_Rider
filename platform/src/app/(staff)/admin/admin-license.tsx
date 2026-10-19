'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { callApi } from '@/lib/api-client';
import { deliveryTierNotice } from '@/license/delivery-tier';
import type { LicenseState, LicenseStatus } from '@/license/license';

type LicenseInfo = { license: LicenseState; activeRiders: number; deliveriesThisMonth: number; buildDate: string | null };

const statusLabels: Record<LicenseStatus, string> = {
  unconfigured: 'เวอร์ชันนี้ยังไม่เปิดใช้ระบบ license',
  trial: 'ช่วงทดลองใช้ (ยังไม่ได้ติดตั้ง license)',
  unlicensed: 'ไม่มี license (ดูข้อมูลได้อย่างเดียว)',
  active: 'ใช้งานได้',
  grace: 'หมดอายุ อยู่ในช่วงผ่อนผัน',
  expired: 'หมดอายุ (ดูข้อมูลได้อย่างเดียว)',
  updatesExpired: 'เวอร์ชันนี้เกินสิทธิ์รับอัปเดต (ดูข้อมูลได้อย่างเดียว)',
};

function thaiDate(date: string | null) {
  if (!date) return 'ไม่มีวันหมดอายุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

// Shows the installed license and installs a new file sent by the vendor.
export function AdminLicense() {
  const [info, setInfo] = useState<LicenseInfo | null>(null);
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

  async function install(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setBusy(true);
    const result = await callApi<LicenseInfo>('/api/admin/license', { method: 'PUT', json: { text: await file.text() } });
    setBusy(false);
    if (!result.ok) return setMessage(`ติดตั้งไม่สำเร็จ: ${result.message}`);
    setInfo(result.data);
    setMessage('ติดตั้ง license แล้ว มีผลทันที');
  }

  if (!info) return <section aria-labelledby="settings-license"><h2 id="settings-license">License</h2><p aria-live="polite">{message || 'กำลังโหลด'}</p></section>;
  const { license } = info;
  const current = license.license;
  const tierNotice = deliveryTierNotice(current, info.deliveriesThisMonth);

  return (
    <section aria-labelledby="settings-license">
      <h2 id="settings-license">License</h2>
      <p>สถานะ: <strong>{statusLabels[license.status]}</strong></p>
      {license.message && <p className={license.writable ? 'notice' : 'notice notice-danger'}>{license.message}</p>}
      {tierNotice && <p className="notice">{tierNotice}</p>}
      {license.problem && <p className="notice notice-danger">ไฟล์ที่ติดตั้งไว้ใช้ไม่ได้: {license.problem}</p>}
      {current && (
        <table>
          <tbody>
            <tr><th scope="row">ผู้ได้รับสิทธิ์</th><td>{current.licensee.name} (รหัสหน่วยบริการ {current.licensee.hcode}) จ.{current.licensee.province}</td></tr>
            <tr><th scope="row">เลขที่ license</th><td><code>{current.licenseId}</code></td></tr>
            <tr><th scope="row">ประเภท</th><td>{current.type === 'perpetual' ? 'ขายขาด + สัญญาดูแลระบบ (MA)' : 'Subscription รายปี'}</td></tr>
            <tr><th scope="row">ใช้งานได้ถึง</th><td>{thaiDate(current.expiresAt)}</td></tr>
            <tr><th scope="row">สิทธิ์รับอัปเดตถึง</th><td>{thaiDate(current.updatesUntil)}</td></tr>
            <tr><th scope="row">ไรเดอร์ที่ใช้งานอยู่</th><td>{info.activeRiders} / {current.maxRiders ?? 'ไม่จำกัด'} คน</td></tr>
            <tr><th scope="row">งานส่งยาเดือนนี้</th><td>{info.deliveriesThisMonth.toLocaleString('th-TH')} / {current.maxDeliveriesPerMonth?.toLocaleString('th-TH') ?? 'ไม่จำกัด'} งาน</td></tr>
          </tbody>
        </table>
      )}
      {info.buildDate && <p>เวอร์ชันที่ติดตั้ง build วันที่ {thaiDate(info.buildDate)}</p>}
      {license.status !== 'unconfigured' && (
        <label>
          ติดตั้งไฟล์ license (.json ที่ได้รับจากผู้พัฒนา)
          <input type="file" accept=".json,.lic,application/json" disabled={busy} onChange={(event) => void install(event)} />
        </label>
      )}
      <p aria-live="polite" className={message.startsWith('ติดตั้งไม่สำเร็จ') ? 'notice notice-danger' : undefined}>{message}</p>
    </section>
  );
}

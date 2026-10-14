'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '@/lib/api-client';

type Zone = { id: string; subdistrictCode: string; villageCode: string; displayName: string; active: boolean };

export function AdminZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const result = await callApi<{ zones: Zone[] }>('/api/admin/zones');
    if (result.ok) setZones(result.data.zones);
    else setMessage(result.message);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const result = await callApi('/api/admin/zones', { json: Object.fromEntries(new FormData(formElement)) });
    if (!result.ok) return setMessage(result.message);
    formElement.reset();
    await load();
    setMessage('เพิ่มโซนแล้ว');
  }

  async function toggle(zone: Zone) {
    const result = await callApi(`/api/admin/zones/${zone.id}`, { method: 'PATCH', json: { active: !zone.active } });
    if (!result.ok) return setMessage(result.message);
    await load();
    setMessage(zone.active ? `ปิดใช้โซน ${zone.displayName} แล้ว` : `เปิดใช้โซน ${zone.displayName} แล้ว`);
  }

  return (
    <section aria-labelledby="admin-zones">
      <h2 id="admin-zones">โซนจัดส่ง</h2>
      <p>รหัสตำบลและหมู่บ้านต้องตรงกับ <code>patient.tmbpart</code> และ <code>patient.moopart</code> ใน HOS</p>
      <p aria-live="polite">{message}</p>
      <form onSubmit={(event) => void create(event)} aria-label="เพิ่มโซน">
        <label>รหัสตำบล 6 หลัก (จังหวัด+อำเภอ+ตำบล) <input name="subdistrictCode" required inputMode="numeric" pattern="\d{6}" /></label>
        <label>รหัสหมู่บ้าน <input name="villageCode" required /></label>
        <label>ชื่อโซน <input name="displayName" required /></label>
        <button type="submit">เพิ่มโซน</button>
      </form>
      <table>
        <thead><tr><th>ตำบล</th><th>หมู่บ้าน</th><th>ชื่อโซน</th><th>สถานะ</th><th /></tr></thead>
        <tbody>
          {zones.map((zone) => (
            <tr key={zone.id}>
              <td><code>{zone.subdistrictCode}</code></td>
              <td><code>{zone.villageCode}</code></td>
              <td>{zone.displayName}</td>
              <td>{zone.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
              <td><button type="button" onClick={() => void toggle(zone)}>{zone.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

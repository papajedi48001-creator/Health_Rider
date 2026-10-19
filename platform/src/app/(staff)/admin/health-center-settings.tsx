'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '@/lib/api-client';

type HealthCenter = { id: string; name: string; hospcode: string | null; users: number };

// The รพ.สต. list that every account chooses from; renaming one moves its accounts along with it.
export function HealthCenterSettings() {
  const [centers, setCenters] = useState<HealthCenter[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const result = await callApi<{ healthCenters: HealthCenter[] }>('/api/admin/health-centers');
    if (!result.ok) return setMessage(result.message);
    setCenters(result.data.healthCenters);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await callApi('/api/admin/health-centers', { json: Object.fromEntries(new FormData(form)) });
    if (!result.ok) return setMessage(result.message);
    form.reset();
    setMessage('เพิ่ม รพ.สต. แล้ว');
    await load();
  }

  async function save(event: FormEvent<HTMLFormElement>, center: HealthCenter) {
    event.preventDefault();
    const result = await callApi(`/api/admin/health-centers/${center.id}`, { method: 'PATCH', json: Object.fromEntries(new FormData(event.currentTarget)) });
    if (!result.ok) return setMessage(result.message);
    setEditing(null);
    setMessage(`บันทึก ${center.name} แล้ว`);
    await load();
  }

  async function remove(center: HealthCenter) {
    if (!window.confirm(`ลบ ${center.name} ออกจากรายชื่อ?`)) return;
    const result = await callApi(`/api/admin/health-centers/${center.id}`, { method: 'DELETE' });
    if (!result.ok) return setMessage(result.message);
    setMessage(`ลบ ${center.name} แล้ว`);
    await load();
  }

  return (
    <section aria-labelledby="settings-health-centers">
      <h2 id="settings-health-centers">รพ.สต.</h2>
      <p className="muted">รายชื่อที่ผู้ใช้ทุกคนต้องเลือกตอนสมัครหรือแก้ไขข้อมูล ผู้ประสานงานจะเห็นเฉพาะงานของไรเดอร์ใน รพ.สต. เดียวกัน รหัสสถานบริการซ้ำกันได้</p>
      <p aria-live="polite">{message}</p>
      <form className="filter-bar" aria-label="เพิ่ม รพ.สต." onSubmit={(event) => void add(event)}>
        <label>ชื่อ รพ.สต. <input name="name" required maxLength={255} /></label>
        <label>รหัสสถานบริการ <input name="hospcode" required inputMode="numeric" pattern="[0-9A-Za-z]{1,20}" /></label>
        <button type="submit">เพิ่ม รพ.สต.</button>
      </form>
      <table>
        <thead><tr><th>ชื่อ รพ.สต.</th><th>รหัสสถานบริการ</th><th>บัญชีผู้ใช้</th><th /></tr></thead>
        <tbody>
          {centers.map((center) => (
            <tr key={center.id}>
              {editing === center.id ? (
                <td colSpan={4}>
                  <form className="filter-bar" aria-label={`แก้ไข ${center.name}`} onSubmit={(event) => void save(event, center)}>
                    <label>ชื่อ รพ.สต. <input name="name" required maxLength={255} defaultValue={center.name} autoFocus /></label>
                    <label>รหัสสถานบริการ <input name="hospcode" required inputMode="numeric" pattern="[0-9A-Za-z]{1,20}" defaultValue={center.hospcode ?? ''} /></label>
                    <button type="submit">บันทึก</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>ยกเลิก</button>
                  </form>
                </td>
              ) : (
                <>
                  <td>{center.name}</td>
                  <td>{center.hospcode ? <code>{center.hospcode}</code> : 'ยังไม่ระบุ'}</td>
                  <td>{center.users}</td>
                  <td>
                    <button type="button" onClick={() => setEditing(center.id)}>แก้ไข</button>
                    <button type="button" onClick={() => void remove(center)} disabled={center.users > 0} title={center.users > 0 ? 'ยังมีบัญชีผู้ใช้อยู่ใน รพ.สต. นี้' : undefined}>ลบ</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

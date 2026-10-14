'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '@/lib/api-client';

type Zone = { id: string; subdistrictCode: string; villageCode: string; displayName: string; active: boolean };
type HosVillage = { subdistrictCode: string; villageCode: string; displayName: string; visits: number; exists: boolean };

const villageKey = (village: { subdistrictCode: string; villageCode: string }) => `${village.subdistrictCode}/${village.villageCode}`;

export function AdminZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [message, setMessage] = useState('');
  const [villages, setVillages] = useState<HosVillage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

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

  async function loadVillages() {
    setMessage('กำลังอ่านหมู่บ้านจาก HOS');
    const result = await callApi<{ villages: HosVillage[] }>('/api/admin/zone-import');
    if (!result.ok) return setMessage(`อ่านหมู่บ้านจาก HOS ไม่ได้: ${result.message}`);
    setVillages(result.data.villages);
    setSelected(new Set(result.data.villages.filter((village) => !village.exists).map(villageKey)));
    setMessage('');
  }

  function toggleVillage(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function importVillages() {
    const chosen = (villages ?? []).filter((village) => !village.exists && selected.has(villageKey(village)));
    setImporting(true);
    const result = await callApi<{ created: number }>('/api/admin/zone-import', {
      json: { zones: chosen.map(({ subdistrictCode, villageCode, displayName }) => ({ subdistrictCode, villageCode, displayName })) },
    });
    setImporting(false);
    if (!result.ok) return setMessage(result.message);
    setVillages(null);
    await load();
    setMessage(`เพิ่มโซนจาก HOS แล้ว ${result.data.created} โซน`);
  }

  const importable = (villages ?? []).filter((village) => !village.exists && selected.has(villageKey(village))).length;

  return (
    <section aria-labelledby="admin-zones">
      <h2 id="admin-zones">โซนจัดส่ง</h2>
      <p>รหัสตำบลคือ <code>chwpart+amppart+tmbpart</code> และรหัสหมู่บ้านคือ <code>moopart</code> ของผู้ป่วยใน HOS</p>
      <p aria-live="polite">{message}</p>
      <section aria-label="นำเข้าโซนจาก HOS">
        <button type="button" onClick={() => void loadVillages()}>ดึงหมู่บ้านจาก HOS (90 วันล่าสุด)</button>
        {villages && (
          <>
            <table>
              <thead><tr><th /><th>ชื่อโซน</th><th>ตำบล</th><th>หมู่บ้าน</th><th>จำนวนครั้ง</th></tr></thead>
              <tbody>
                {villages.map((village) => (
                  <tr key={villageKey(village)}>
                    <td>
                      {village.exists ? 'มีแล้ว' : (
                        <input type="checkbox" aria-label={`เลือก ${village.displayName}`} checked={selected.has(villageKey(village))} onChange={() => toggleVillage(villageKey(village))} />
                      )}
                    </td>
                    <td>{village.displayName}</td>
                    <td><code>{village.subdistrictCode}</code></td>
                    <td><code>{village.villageCode}</code></td>
                    <td>{village.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" disabled={importing || importable === 0} onClick={() => void importVillages()}>
              {importing ? 'กำลังเพิ่มโซน' : `เพิ่มโซนที่เลือก (${importable})`}
            </button>
          </>
        )}
      </section>
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

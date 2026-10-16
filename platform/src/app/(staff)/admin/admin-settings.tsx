'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callApi } from '@/lib/api-client';

type HosSettings = {
  source: 'system' | 'env' | 'none';
  host: string;
  port: number;
  user: string;
  database: string;
  hasPassword: boolean;
  eligibleItemCodes: string[];
  problem: string | null;
};
type SystemInfo = {
  basePath: string;
  database: { host: string; name: string; version: string | null; migrations: number | null; error: string | null };
  authSecret: string | null;
  secureCookie: boolean;
  evidence: { path: string; writable: boolean };
  runtime: { node: string; mode: string };
};
type HosTest = {
  version: string;
  tables: Array<{ name: string; ok: boolean; message: string | null }>;
  items: Array<{ code: string; name: string | null }>;
};

const sourceLabels: Record<HosSettings['source'], string> = {
  system: 'ใช้ค่าที่บันทึกในหน้านี้',
  env: 'ใช้ค่าจากไฟล์ .env.production',
  none: 'ยังไม่ได้ตั้งค่า',
};

export function AdminSettings() {
  const [hos, setHos] = useState<HosSettings | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [message, setMessage] = useState('');
  const [test, setTest] = useState<HosTest | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<{ hos: HosSettings; system: SystemInfo }>('/api/admin/settings');
    if (!result.ok) return setMessage(result.message);
    setHos(result.data.hos);
    setSystem(result.data.system);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function formValues(form: HTMLFormElement) {
    return Object.fromEntries(new FormData(form));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    const result = await callApi<{ hos: HosSettings }>('/api/admin/settings', { method: 'PUT', json: formValues(form) });
    setBusy(false);
    if (!result.ok) return setMessage(`บันทึกไม่สำเร็จ: ${result.message}`);
    setHos(result.data.hos);
    setMessage('บันทึกการตั้งค่า HOSxP แล้ว มีผลทันทีโดยไม่ต้องรีสตาร์ต');
  }

  async function runTest(form: HTMLFormElement | null) {
    if (!form || !form.reportValidity()) return;
    setBusy(true);
    setTest(null);
    setMessage('กำลังทดสอบการเชื่อมต่อ HOSxP');
    const result = await callApi<HosTest>('/api/admin/settings/hos-test', { json: formValues(form) });
    setBusy(false);
    if (!result.ok) return setMessage(`ทดสอบไม่ผ่าน: ${result.message}`);
    setTest(result.data);
    const failed = result.data.tables.some((table) => !table.ok);
    setMessage(failed ? 'เชื่อมต่อได้ แต่บัญชีนี้อ่านบางตารางไม่ได้ ดูรายละเอียดด้านล่าง' : 'เชื่อมต่อ HOSxP ได้ ยังไม่ได้บันทึก กด "บันทึก" เพื่อใช้ค่านี้');
  }

  async function reset() {
    if (!window.confirm('ลบค่าที่บันทึกในหน้านี้ แล้วกลับไปใช้ค่าจากไฟล์ .env.production ใช่ไหม')) return;
    const result = await callApi<{ hos: HosSettings }>('/api/admin/settings', { method: 'DELETE' });
    if (!result.ok) return setMessage(result.message);
    setHos(result.data.hos);
    setTest(null);
    setMessage('กลับไปใช้ค่าจากไฟล์ .env.production แล้ว');
  }

  if (!hos || !system) return <p aria-live="polite">{message || 'กำลังโหลดการตั้งค่า'}</p>;

  return (
    <>
      <p aria-live="polite" className={message.startsWith('ทดสอบไม่ผ่าน') || message.startsWith('บันทึกไม่สำเร็จ') ? 'notice notice-danger' : undefined}>{message}</p>

      <section aria-labelledby="settings-hos">
        <h2 id="settings-hos">การเชื่อมต่อ HOSxP</h2>
        <p>ระบบอ่านรายชื่อผู้ป่วยที่รับยาและหมู่บ้านจาก HOSxP แบบอ่านอย่างเดียว ควรใช้บัญชีที่มีสิทธิ์ <code>SELECT</code> เท่านั้น สถานะ: <strong>{sourceLabels[hos.source]}</strong></p>
        {hos.problem && <p className="notice notice-danger">{hos.problem}</p>}
        <form key={`${hos.source}-${hos.host}-${hos.user}-${hos.database}-${hos.eligibleItemCodes.join()}`} onSubmit={(event) => void save(event)} aria-label="ตั้งค่า HOSxP">
          <label>Host หรือ IP ของเครื่อง HOSxP <input name="host" required defaultValue={hos.host} placeholder="192.168.1.254" /></label>
          <label>Port <input name="port" required inputMode="numeric" pattern="\d{1,5}" defaultValue={hos.port} /></label>
          <label>ชื่อฐานข้อมูล HOSxP <input name="database" required defaultValue={hos.database} placeholder="hos" /></label>
          <label>ชื่อผู้ใช้ (อ่านอย่างเดียว) <input name="user" required autoComplete="off" defaultValue={hos.user} /></label>
          <label>
            รหัสผ่าน
            <input name="password" type="password" autoComplete="new-password" required={!hos.hasPassword}
              placeholder={hos.hasPassword ? 'เว้นว่างเพื่อใช้รหัสผ่านเดิม' : ''} />
          </label>
          <label>
            รหัสยาที่ส่งถึงบ้านได้ (icode) คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่
            <textarea name="eligibleItemCodes" rows={4} defaultValue={hos.eligibleItemCodes.join('\n')} />
          </label>
          <div className="action-row">
            <button type="button" disabled={busy} onClick={(event) => void runTest(event.currentTarget.form)}>ทดสอบการเชื่อมต่อ</button>
            <button type="submit" disabled={busy}>บันทึก</button>
            {hos.source === 'system' && <button type="button" disabled={busy} onClick={() => void reset()}>กลับไปใช้ค่าจาก .env</button>}
          </div>
        </form>
        {test && (
          <div aria-label="ผลการทดสอบ HOSxP">
            <p>เวอร์ชันเซิร์ฟเวอร์ HOSxP: <code>{test.version}</code></p>
            <table>
              <thead><tr><th>ตารางที่ระบบอ่าน</th><th>ผล</th></tr></thead>
              <tbody>
                {test.tables.map((table) => (
                  <tr key={table.name}><td><code>{table.name}</code></td><td>{table.ok ? 'อ่านได้' : table.message}</td></tr>
                ))}
              </tbody>
            </table>
            {test.items.length > 0 && (
              <table>
                <thead><tr><th>icode</th><th>ชื่อรายการใน HOSxP</th></tr></thead>
                <tbody>
                  {test.items.map((item) => (
                    <tr key={item.code}><td><code>{item.code}</code></td><td>{item.name ?? 'ไม่พบใน drugitems หรือ nondrugitems'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="settings-system">
        <h2 id="settings-system">ค่าตั้งของเซิร์ฟเวอร์</h2>
        <p>ค่าเหล่านี้ตั้งในไฟล์ <code>.env.production</code> บนเครื่องแอป แก้แล้วต้องรัน <code>docker compose ... up -d</code> ใหม่ ส่วน path ของเว็บต้อง build image ใหม่</p>
        <table>
          <tbody>
            <tr><th scope="row">ฐานข้อมูล Health Rider</th><td>
              <code>{system.database.host}/{system.database.name}</code>{' '}
              {system.database.error ?? `MariaDB ${system.database.version} · migration ${system.database.migrations} รายการ`}
            </td></tr>
            <tr><th scope="row">AUTH_SECRET</th><td>{system.authSecret ?? 'ตั้งแล้ว'}</td></tr>
            <tr><th scope="row">Path ของเว็บ</th><td><code>{system.basePath}</code></td></tr>
            <tr><th scope="row">Cookie แบบ Secure (HTTPS)</th><td>{system.secureCookie ? 'เปิด' : 'ปิด (ใช้กับ HTTP ทดสอบเท่านั้น)'}</td></tr>
            <tr><th scope="row">ที่เก็บรูปหลักฐานการส่ง</th><td>
              {system.evidence.path ? <code>{system.evidence.path}</code> : 'ยังไม่ได้ตั้ง EVIDENCE_STORAGE_PATH'}{' '}
              {system.evidence.path && (system.evidence.writable ? 'เขียนได้' : 'เขียนไม่ได้')}
            </td></tr>
            <tr><th scope="row">Node.js</th><td>{system.runtime.node} ({system.runtime.mode})</td></tr>
          </tbody>
        </table>
      </section>
    </>
  );
}

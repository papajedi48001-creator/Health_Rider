'use client';

import { useCallback, useEffect, useState } from 'react';
import { callApi } from '@/lib/api-client';
import { formatThaiDateTime } from '@/lib/labels';

type AuditRow = { id: string; actorName: string; action: string; auditableType: string; auditableId: string; reason: string | null; oldValues: unknown; newValues: unknown; createdAt: string };

export function AuditLog() {
  const [auditableId, setAuditableId] = useState('');
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [message, setMessage] = useState('กำลังโหลด');

  const load = useCallback(async (filter: string, before: string | null) => {
    const query = new URLSearchParams({ ...(filter ? { auditableId: filter } : {}), ...(before ? { before } : {}) });
    const result = await callApi<{ events: AuditRow[]; nextBefore: string | null }>(`/api/audit?${query}`);
    if (!result.ok) return setMessage(result.message);
    setEvents((current) => (before ? [...current, ...result.data.events] : result.data.events));
    setNextBefore(result.data.nextBefore);
    setMessage(result.data.events.length === 0 && !before ? 'ไม่พบเหตุการณ์' : '');
  }, []);

  useEffect(() => {
    void load('', null);
  }, [load]);

  return (
    <div>
      <form onSubmit={(event) => { event.preventDefault(); void load(auditableId.trim(), null); }}>
        <label>รหัสรายการ <input value={auditableId} onChange={(event) => setAuditableId(event.target.value)} /></label>
        <button type="submit">ค้นหา</button>
      </form>
      <p aria-live="polite">{message}</p>
      <table>
        <thead><tr><th>เวลา</th><th>ผู้ทำรายการ</th><th>เหตุการณ์</th><th>รายการ</th><th>ก่อน</th><th>หลัง</th><th>เหตุผล</th></tr></thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{formatThaiDateTime(event.createdAt)}</td>
              <td>{event.actorName}</td>
              <td><code>{event.action}</code></td>
              <td>{event.auditableType} <code>{event.auditableId}</code></td>
              <td><code>{event.oldValues ? JSON.stringify(event.oldValues) : '-'}</code></td>
              <td><code>{event.newValues ? JSON.stringify(event.newValues) : '-'}</code></td>
              <td>{event.reason ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {nextBefore && <button type="button" onClick={() => void load(auditableId.trim(), nextBefore)}>โหลดเพิ่ม</button>}
    </div>
  );
}

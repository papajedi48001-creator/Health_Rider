'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ZonedCandidate } from '@/hos/types';
import { callApi } from '@/lib/api-client';
import { bangkokDateString } from '@/lib/time';

const ALL_ZONES = '';
const NO_ZONE = 'none';

export function PharmacyCandidateList() {
  const [date, setDate] = useState(() => bangkokDateString(new Date()));
  const [candidates, setCandidates] = useState<ZonedCandidate[]>([]);
  const [message, setMessage] = useState('กำลังโหลดรายการจาก HOS');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState(ALL_ZONES);

  const loadCandidates = useCallback(async (on: string) => {
    setMessage('กำลังโหลดรายการจาก HOS');
    const result = await callApi<ZonedCandidate[]>(`/api/pharmacy/candidates?date=${on}`);
    if (!result.ok) {
      setCandidates([]);
      setMessage('ไม่สามารถโหลดรายการจาก HOS ได้');
      return;
    }
    setCandidates(result.data);
    setMessage(result.data.length === 0 ? 'ไม่พบผู้ป่วยที่รอยืนยัน' : '');
  }, []);

  useEffect(() => {
    void loadCandidates(date);
  }, [date, loadCandidates]);

  async function confirm(candidate: ZonedCandidate) {
    setConfirming(candidate.visitNumber);
    setMessage('');
    const result = await callApi('/api/pharmacy/candidates/confirm', { json: { visitNumber: candidate.visitNumber, date } });
    setConfirming(null);
    if (!result.ok) {
      setMessage(`ไม่สามารถสร้างงานส่งยาได้: ${result.message}`);
      return;
    }
    setCandidates((current) => current.filter((item) => item.visitNumber !== candidate.visitNumber));
    setMessage('สร้างงานส่งยาแล้ว');
  }

  async function confirmZone(zone: { id: string; displayName: string }, count: number) {
    if (!window.confirm(`ยืนยันสร้างงานส่งยาทั้ง ${count} รายในโซน ${zone.displayName}?`)) return;
    setConfirming(zone.id);
    setMessage('');
    const result = await callApi<{ confirmed: number; visitNumbers: string[] }>('/api/pharmacy/candidates/confirm-zone', { json: { zoneId: zone.id, date } });
    setConfirming(null);
    if (!result.ok) {
      setMessage(`ไม่สามารถสร้างงานส่งยาทั้งโซนได้: ${result.message}`);
      return;
    }
    const done = new Set(result.data.visitNumbers);
    setCandidates((current) => current.filter((item) => !done.has(item.visitNumber)));
    setZoneFilter(ALL_ZONES);
    setMessage(`สร้างงานส่งยาแล้ว ${result.data.confirmed} รายในโซน ${zone.displayName}`);
  }

  const zones = new Map<string, { zone: { id: string; displayName: string }; count: number }>();
  for (const candidate of candidates) {
    if (!candidate.zone) continue;
    const entry = zones.get(candidate.zone.id) ?? { zone: candidate.zone, count: 0 };
    entry.count += 1;
    zones.set(candidate.zone.id, entry);
  }
  const zoneless = candidates.filter((candidate) => !candidate.zone).length;
  const selectedZone = zones.get(zoneFilter);

  // A day can hold 100–200 visits, so pharmacy narrows the list by zone and by HN, name or address words.
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const shown = candidates.filter((candidate) => {
    if (zoneFilter === NO_ZONE ? candidate.zone !== null : zoneFilter !== ALL_ZONES && candidate.zone?.id !== zoneFilter) return false;
    const haystack = `${candidate.hn} ${candidate.patientName} ${candidate.deliveryAddress}`;
    return terms.every((term) => haystack.includes(term));
  });

  return (
    <section aria-live="polite">
      <label>
        วันที่รับบริการ
        <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
      </label>
      <label>
        โซนจัดส่ง
        <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
          <option value={ALL_ZONES}>ทุกโซน ({candidates.length} ราย)</option>
          {[...zones.values()].map(({ zone, count }) => (
            <option key={zone.id} value={zone.id}>{zone.displayName} ({count} ราย)</option>
          ))}
          {zoneless > 0 && <option value={NO_ZONE}>ยังไม่มีโซน ({zoneless} ราย)</option>}
        </select>
      </label>
      {selectedZone && (
        <button type="button" disabled={confirming !== null} onClick={() => void confirmZone(selectedZone.zone, selectedZone.count)}>
          {confirming === selectedZone.zone.id ? 'กำลังยืนยันทั้งโซน' : `ยืนยันทั้งโซน ${selectedZone.zone.displayName} (${selectedZone.count} ราย)`}
        </button>
      )}
      <label>
        ค้นหา HN / ชื่อ / ที่อยู่
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {candidates.length > 0 && (
        <p>{shown.length === candidates.length ? `ทั้งหมด ${candidates.length} ราย` : `พบ ${shown.length} จาก ${candidates.length} ราย`}</p>
      )}
      {message && <p>{message}</p>}
      <ul>
        {shown.map((candidate) => (
          <li key={candidate.visitNumber}>
            <h2>{candidate.patientName}</h2>
            <p>HN: {candidate.hn} · อายุ {candidate.patientAge ?? '-'} ปี</p>
            <p>{candidate.deliveryAddress}</p>
            <p>{candidate.zone ? `โซน: ${candidate.zone.displayName}` : `ยังไม่มีโซนสำหรับตำบล ${candidate.subdistrictCode} หมู่ ${candidate.villageCode}`}</p>
            <button
              type="button"
              disabled={confirming !== null || !candidate.zone}
              onClick={() => void confirm(candidate)}
            >
              {confirming === candidate.visitNumber ? 'กำลังยืนยัน' : 'ยืนยันสร้างงานส่งยา'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

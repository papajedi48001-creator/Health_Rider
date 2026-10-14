'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HosCandidate } from '@/hos/types';
import { callApi } from '@/lib/api-client';
import { bangkokDateString } from '@/lib/time';

export function PharmacyCandidateList() {
  const [date, setDate] = useState(() => bangkokDateString(new Date()));
  const [candidates, setCandidates] = useState<HosCandidate[]>([]);
  const [message, setMessage] = useState('กำลังโหลดรายการจาก HOS');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const loadCandidates = useCallback(async (on: string) => {
    setMessage('กำลังโหลดรายการจาก HOS');
    const result = await callApi<HosCandidate[]>(`/api/pharmacy/candidates?date=${on}`);
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

  async function confirm(candidate: HosCandidate) {
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

  // A day can hold 100–200 visits, so pharmacy narrows the list by HN, name or address (e.g. "หมู่ 6").
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const shown = candidates.filter((candidate) => {
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
        ค้นหา HN / ชื่อ / ที่อยู่
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {candidates.length > 0 && (
        <p>{terms.length === 0 ? `ทั้งหมด ${candidates.length} ราย` : `พบ ${shown.length} จาก ${candidates.length} ราย`}</p>
      )}
      {message && <p>{message}</p>}
      <ul>
        {shown.map((candidate) => (
          <li key={candidate.visitNumber}>
            <h2>{candidate.patientName}</h2>
            <p>HN: {candidate.hn} · อายุ {candidate.patientAge ?? '-'} ปี</p>
            <p>{candidate.deliveryAddress}</p>
            <button
              type="button"
              disabled={confirming === candidate.visitNumber}
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

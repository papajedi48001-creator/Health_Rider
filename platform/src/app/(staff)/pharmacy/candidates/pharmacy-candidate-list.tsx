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

  return (
    <section aria-live="polite">
      <label>
        วันที่รับบริการ
        <input type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
      </label>
      {message && <p>{message}</p>}
      <ul>
        {candidates.map((candidate) => (
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

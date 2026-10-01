'use client';

import { useEffect, useState } from 'react';
import type { HosCandidate } from '@/hos/types';

export function PharmacyCandidateList() {
  const [candidates, setCandidates] = useState<HosCandidate[]>([]);
  const [message, setMessage] = useState('กำลังโหลดรายการจาก HOS');
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    void loadCandidates();
  }, []);

  async function loadCandidates() {
    const response = await fetch('/api/pharmacy/candidates');
    if (!response.ok) {
      setMessage('ไม่สามารถโหลดรายการจาก HOS ได้');
      return;
    }
    const result = (await response.json()) as HosCandidate[];
    setCandidates(result);
    setMessage(result.length === 0 ? 'ไม่พบผู้ป่วยที่รอยืนยัน' : '');
  }

  async function confirm(candidate: HosCandidate) {
    setConfirming(candidate.visitNumber);
    setMessage('');
    const response = await fetch('/api/pharmacy/candidates/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(candidate),
    });

    if (!response.ok) {
      setMessage('ไม่สามารถสร้างงานส่งยาได้ โปรดตรวจสอบโซนและอัตราค่าบริการ');
      setConfirming(null);
      return;
    }

    setCandidates((current) => current.filter((item) => item.visitNumber !== candidate.visitNumber));
    setMessage('สร้างงานส่งยาแล้ว');
    setConfirming(null);
  }

  return (
    <section aria-live="polite">
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

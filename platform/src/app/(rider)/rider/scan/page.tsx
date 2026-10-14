'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { statusLabels } from '@/lib/labels';

type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type MyAttempt = { id: string; status: DeliveryAttemptStatus; patientName: string; address: string };

export default function RiderScanPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('สแกน QR ที่พัสดุเพื่อรับงาน');
  const [scanning, setScanning] = useState(false);
  const [attempts, setAttempts] = useState<MyAttempt[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const claimingRef = useRef(false);

  useEffect(() => {
    void callApi<{ attempts: MyAttempt[] }>('/api/rider/attempts').then((result) => result.ok && setAttempts(result.data.attempts));
  }, []);

  async function claim(value: string) {
    if (claimingRef.current) return;
    claimingRef.current = true;
    setMessage('กำลังรับงาน');
    const result = await callApi<{ attemptId: string }>('/api/rider/claims', { json: { token: value.trim() } });
    claimingRef.current = false;
    if (!result.ok) return setMessage(result.message);
    setMessage('รับงานสำเร็จ');
    router.push(`/rider/attempts/${result.data.attemptId}`);
  }

  // Uses the browser's built-in QR detector where available (Chrome on Android); otherwise the token can be typed.
  async function startCamera() {
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices) return setMessage('อุปกรณ์นี้สแกนในเบราว์เซอร์ไม่ได้ โปรดกรอกรหัสใต้ QR');
    const detector = new Detector({ formats: ['qr_code'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).catch(() => null);
    if (!stream || !videoRef.current) return setMessage('เปิดกล้องไม่ได้ โปรดอนุญาตการใช้กล้อง');
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    setScanning(true);
    const stop = () => { stream.getTracks().forEach((track) => track.stop()); setScanning(false); };
    const tick = async () => {
      if (!videoRef.current || videoRef.current.srcObject !== stream) return stop();
      const [code] = await detector.detect(videoRef.current).catch(() => []);
      if (code?.rawValue) { stop(); await claim(code.rawValue); return; }
      requestAnimationFrame(() => void tick());
    };
    void tick();
  }

  return (
    <main>
      <h1>รับงานด้วย QR</h1>
      <p aria-live="polite" role="status">{message}</p>
      <video ref={videoRef} hidden={!scanning} muted playsInline width={320} />
      <button type="button" onClick={() => void startCamera()} disabled={scanning}>เปิดกล้องสแกน QR</button>
      <form onSubmit={(event) => { event.preventDefault(); void claim(token); }}>
        <label>
          QR token
          <input value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
        </label>
        <button type="submit">รับงาน</button>
      </form>
      <section>
        <h2>งานของฉัน</h2>
        {attempts.length === 0 ? <p>ยังไม่มีงานที่ค้างอยู่</p> : (
          <ul>
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Link href={`/rider/attempts/${attempt.id}`}>{attempt.patientName}</Link> · {statusLabels[attempt.status]}
                <br />{attempt.address}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

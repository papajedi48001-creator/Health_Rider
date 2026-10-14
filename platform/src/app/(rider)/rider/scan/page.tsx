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

  // Prefers the browser's built-in QR detector (Chrome on Android) and falls back to jsQR elsewhere, such as iPhone Safari.
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return setMessage('อุปกรณ์นี้เปิดกล้องในเบราว์เซอร์ไม่ได้ โปรดกรอกรหัสใต้ QR');
    const readCode = await qrReader().catch(() => null);
    if (!readCode) return setMessage('โหลดตัวอ่าน QR ไม่ได้ โปรดกรอกรหัสใต้ QR');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).catch(() => null);
    if (!stream || !videoRef.current) return setMessage('เปิดกล้องไม่ได้ โปรดอนุญาตการใช้กล้อง');
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    setScanning(true);
    const stop = () => { stream.getTracks().forEach((track) => track.stop()); setScanning(false); };
    const tick = async () => {
      const video = videoRef.current;
      if (!video || video.srcObject !== stream) return stop();
      const value = await readCode(video).catch(() => null);
      if (value) { stop(); await claim(value); return; }
      setTimeout(() => void tick(), 150);
    };
    void tick();
  }

  return (
    <main>
      <h1>รับงานด้วย QR</h1>
      <p aria-live="polite" role="status">{message}</p>
      <section aria-label="รับงานใหม่">
        <video ref={videoRef} hidden={!scanning} muted playsInline className="scanner" />
        {!scanning && (
          <button type="button" onClick={() => void startCamera()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
            </svg>
            เปิดกล้องสแกน QR
          </button>
        )}
        <p className="divider">หรือกรอกรหัสใต้ QR</p>
        <form onSubmit={(event) => { event.preventDefault(); void claim(token); }}>
          <label>
            QR token
            <input value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          <button type="submit" className="secondary">รับงาน</button>
        </form>
      </section>
      <h2>งานของฉัน</h2>
      {attempts.length === 0 ? <section><p className="meta">ยังไม่มีงานที่ค้างอยู่</p></section> : (
        <ul>
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <div className="card-head">
                <h2>{attempt.patientName}</h2>
                <span className="badge">{statusLabels[attempt.status]}</span>
              </div>
              <p className="meta">{attempt.address}</p>
              <Link className="button secondary" href={`/rider/attempts/${attempt.id}`}>เปิดงาน</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

type QrReader = (video: HTMLVideoElement) => Promise<string | null>;

async function qrReader(): Promise<QrReader> {
  const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (Detector) {
    const detector = new Detector({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!context || video.videoWidth === 0) return null;
    // Downscales large camera frames; a package label fills most of the view, so 640px is enough to decode.
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height)?.data || null;
  };
}

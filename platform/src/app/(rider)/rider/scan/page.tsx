'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { statusLabels } from '@/lib/labels';
import { Icon } from '@/rider/icons';
import { statusTone } from '@/lib/status-tone';

type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type MyAttempt = { id: string; status: DeliveryAttemptStatus; patientName: string; address: string };

export default function RiderScanPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('สแกน QR ที่พัสดุเพื่อรับงาน');
  const [scanning, setScanning] = useState(false);
  const [attempts, setAttempts] = useState<MyAttempt[] | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const claimingRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void callApi<{ attempts: MyAttempt[] }>('/api/rider/attempts').then((result) => setAttempts(result.ok ? result.data.attempts : []));
    return () => stopRef.current?.();
  }, []);

  async function claim(value: string) {
    if (claimingRef.current || !value.trim()) return;
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
    setMessage('เล็ง QR บนพัสดุให้อยู่ในกรอบ');
    const stop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
      stopRef.current = null;
      setScanning(false);
    };
    stopRef.current = stop;
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
    <main className="rider-page">
      <h1>รับงาน</h1>
      <p aria-live="polite" role="status">{message}</p>

      <section className="rider-card" aria-label="สแกน QR">
        <div className="scan-frame" hidden={!scanning}>
          <video ref={videoRef} muted playsInline />
        </div>
        {scanning ? (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => stopRef.current?.()}>
            <Icon name="close" /> ปิดกล้อง
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-block btn-large" onClick={() => void startCamera()}>
            <Icon name="scan" size={26} /> สแกน QR รับงาน
          </button>
        )}
        <p className="divider"><span>หรือกรอกรหัสใต้ QR</span></p>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void claim(token); }}>
          <label>
            รหัสใต้ QR
            <input value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          <button type="submit" className="btn btn-secondary btn-block" disabled={!token.trim()}>ยืนยันรหัส</button>
        </form>
      </section>

      <h2>งานของฉัน{attempts && attempts.length > 0 ? ` (${attempts.length})` : ''}</h2>
      {attempts === null ? <p className="muted">กำลังโหลดงาน</p> : attempts.length === 0 ? (
        <div className="empty-state">
          <Icon name="package" size={36} />
          <p>ยังไม่มีงานที่ค้างอยู่ สแกน QR ที่พัสดุเพื่อรับงาน</p>
        </div>
      ) : (
        <ul className="job-list">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <Link href={`/rider/attempts/${attempt.id}`} className="job-link">
                <span className="job-main">
                  <strong>{attempt.patientName}</strong>
                  <span className="muted">{attempt.address}</span>
                  <span className={`chip ${statusTone(attempt.status)}`}>{statusLabels[attempt.status]}</span>
                </span>
                <Icon name="chevron" />
              </Link>
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

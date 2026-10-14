'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { failedDeliveryReasons, recipientRelations, type FailedDeliveryReason, type RecipientRelation } from '@/domain/delivery/offline-event-rules';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { failureReasonLabels, recipientRelationLabels, statusLabels } from '@/lib/labels';
import type { OfflineEvent } from '@/pwa/offline-queue';
import { toEvidenceJpeg } from '@/pwa/photo';
import { deleteAttemptView, loadAttemptView, saveAttemptView } from '@/pwa/indexeddb-store';
import { riderQueue, syncRiderQueue } from '@/pwa/rider-sync';
import { Icon } from '@/rider/icons';
import { statusTone } from '@/rider/status-tone';

type AttemptView = {
  id: string;
  status: DeliveryAttemptStatus;
  deliveryVersion: number;
  patient: { hn: string; name: string; age: number | null; telephone: string | null; address: string };
};

const pendingMessage = 'บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์';
const activeStatuses: DeliveryAttemptStatus[] = ['claimed', 'in_transit'];

export function RiderAttempt({ attemptId }: { attemptId: string }) {
  const [view, setView] = useState<AttemptView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('บันทึกรับยาหรือส่งยาได้แม้ไม่มีสัญญาณ');
  // Event types recorded on this device and not yet acknowledged by the server.
  const [pendingTypes, setPendingTypes] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Shows the rider the photo they just took before they save the delivery.
  function choosePhoto(file: File | undefined) {
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/rider/attempts/${attemptId}`, { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 404) await deleteAttemptView(attemptId).catch(() => undefined);
        setLoadError(response.status === 404 ? 'ไม่พบงานจัดส่งนี้ หรือไม่ใช่งานที่คุณรับไว้' : 'โหลดข้อมูลงานไม่สำเร็จ');
        return;
      }
      const loaded = (await response.json()) as AttemptView;
      setView(loaded);
      setLoadError('');
      if (activeStatuses.includes(loaded.status)) await saveAttemptView(attemptId, loaded).catch(() => undefined);
      else await deleteAttemptView(attemptId).catch(() => undefined);
    } catch {
      const cached = (await loadAttemptView(attemptId).catch(() => null)) as AttemptView | null;
      setView((current) => current ?? cached);
      setLoadError(cached ? 'ออฟไลน์อยู่ แสดงข้อมูลที่บันทึกไว้ในเครื่องตอนรับงาน' : 'ออฟไลน์อยู่ ข้อมูลผู้ป่วยจะแสดงเมื่อกลับมาออนไลน์');
    }
  }, [attemptId]);

  const refreshPending = useCallback(async () => {
    setPendingTypes((await riderQueue.pending()).filter((event) => event.attemptId === attemptId).map((event) => event.eventType));
  }, [attemptId]);

  const sync = useCallback(async (recordedUuid?: string) => {
    const summary = await syncRiderQueue();
    await refreshPending();
    if (recordedUuid) {
      const result = summary.results[recordedUuid];
      if (!result?.acknowledged) setMessage(pendingMessage);
      else if (result.outcome?.kind === 'conflict') setMessage('ส่งข้อมูลแล้ว แต่ต้องรอผู้ประสานงานตรวจสอบก่อน');
      else setMessage('บันทึกและส่งข้อมูลแล้ว');
    } else if (summary.acknowledged > 0) {
      setMessage(`ส่งข้อมูลที่ค้างไว้แล้ว ${summary.acknowledged} รายการ`);
    }
    if (summary.acknowledged > 0) await load();
  }, [load, refreshPending]);

  useEffect(() => {
    void load();
    void refreshPending().then(() => (navigator.onLine ? sync() : undefined));
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load, refreshPending, sync]);

  async function record(eventType: OfflineEvent['eventType'], payload: Record<string, unknown>) {
    if (!view) return;
    setRecording(true);
    const event: OfflineEvent = { eventUuid: crypto.randomUUID(), attemptId, deliveryVersion: view.deliveryVersion, eventType, deviceCapturedAt: new Date().toISOString(), payload };
    try {
      await riderQueue.enqueue(event);
      setMessage(pendingMessage);
      await refreshPending();
      if (navigator.onLine) await sync(event.eventUuid);
    } catch {
      setMessage('บันทึกในเครื่องไม่สำเร็จ โปรดลองอีกครั้ง');
    } finally {
      setRecording(false);
    }
  }

  async function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) return setMessage('ต้องถ่ายรูปหลักฐานการส่งก่อน');
    try {
      const photo = await toEvidenceJpeg(file);
      await record('delivered', { recipientRelation: form.get('recipientRelation') as RecipientRelation, photo });
    } catch {
      setMessage('อ่านรูปไม่ได้ โปรดถ่ายรูปใหม่');
    }
  }

  async function submitFailure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await record('delivery_failed', { reason: form.get('reason') as FailedDeliveryReason });
  }

  const pending = pendingTypes.length;
  // Hides actions already recorded on this device, so a rider without signal cannot record the same
  // step twice and send the job to coordinator review.
  const pickupPending = pendingTypes.includes('picked_up');
  const outcomePending = pendingTypes.includes('delivered') || pendingTypes.includes('delivery_failed');
  const active = view && activeStatuses.includes(view.status) && !outcomePending;
  const statusText = view && (outcomePending ? 'บันทึกผลการส่งแล้ว รอส่งข้อมูล'
    : pickupPending && view.status === 'claimed' ? `${statusLabels.in_transit} (รอส่งข้อมูล)` : statusLabels[view.status]);

  const offline = pending > 0 || loadError.startsWith('ออฟไลน์');

  return (
    <main className="rider-page">
      <Link href="/rider/scan" className="back-link"><Icon name="back" size={18} /> งานของฉัน</Link>
      <h1>บันทึกงานจัดส่ง</h1>
      <p aria-live="polite" role="status" className={offline ? 'status-pending' : undefined}>{message}{pending > 0 ? ` (ค้างส่ง ${pending} รายการ)` : ''}</p>
      {loadError && <p className="notice">{loadError}</p>}
      {view && (
        <section aria-label="ข้อมูลผู้รับ" className="rider-card patient-card">
          <h2>{view.patient.name}</h2>
          <p className="muted">HN <code>{view.patient.hn}</code> · อายุ {view.patient.age ?? '-'} ปี</p>
          <p>{view.patient.address}</p>
          <p className="muted">โทร {view.patient.telephone ?? '-'}</p>
          <p className={`chip ${outcomePending ? 'chip-warning' : statusTone(view.status)}`}>สถานะ: {statusText}</p>
          <div className="action-row">
            {view.patient.telephone ? (
              <a className="btn btn-secondary" href={`tel:${view.patient.telephone}`}><Icon name="phone" /> โทรหาผู้รับ</a>
            ) : <span className="btn btn-secondary" aria-disabled="true"><Icon name="phone" /> ไม่มีเบอร์โทร</span>}
            <a className="btn btn-secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(view.patient.address)}`} target="_blank" rel="noreferrer">
              <Icon name="map" /> นำทาง
            </a>
          </div>
        </section>
      )}
      {active && (
        <>
          {view.status === 'claimed' && !pickupPending && (
            <section className="rider-card step-card" aria-label="รับยา">
              <h2><span className="step">1</span> รับยาจากเภสัชกรรม</h2>
              <button type="button" className="btn btn-primary btn-block btn-large" disabled={recording} onClick={() => void record('picked_up', {})}>
                <Icon name="package" /> บันทึกรับยา
              </button>
            </section>
          )}
          <form onSubmit={(event) => void submitDelivery(event)} aria-label="บันทึกส่งยาสำเร็จ" className="rider-card step-card">
            <h2><span className="step">2</span> ส่งยาสำเร็จ</h2>
            <label className="photo-picker">
              <input name="photo" type="file" accept="image/*" capture="environment" required onChange={(event) => choosePhoto(event.target.files?.[0])} />
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a remote image
                <img src={photoPreview} alt="รูปหลักฐานที่ถ่ายไว้" />
              ) : <Icon name="camera" size={32} />}
              <span>{photoPreview ? 'ถ่ายรูปหลักฐานใหม่' : 'ถ่ายรูปหลักฐาน'}</span>
              <small>ไม่ถ่ายใบหน้าหรือเอกสารของผู้ป่วย</small>
            </label>
            <label>
              ผู้รับยา
              <select name="recipientRelation" defaultValue="self">
                {recipientRelations.map((relation) => <option key={relation} value={relation}>{recipientRelationLabels[relation]}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-success btn-block btn-large" disabled={recording}><Icon name="check" /> บันทึกส่งยา</button>
          </form>
          <form onSubmit={(event) => void submitFailure(event)} aria-label="บันทึกส่งไม่สำเร็จ" className="rider-card step-card">
            <h2>ส่งไม่สำเร็จ</h2>
            <label>
              เหตุผล
              <select name="reason" defaultValue={failedDeliveryReasons[0]}>
                {failedDeliveryReasons.map((reason) => <option key={reason} value={reason}>{failureReasonLabels[reason]}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-danger btn-block" disabled={recording}>บันทึกส่งไม่สำเร็จ</button>
          </form>
        </>
      )}
      {view?.status === 'return_required' && <p className="notice notice-danger">นำยากลับมาคืนเภสัชกรรมภายในวันนี้</p>}
    </main>
  );
}

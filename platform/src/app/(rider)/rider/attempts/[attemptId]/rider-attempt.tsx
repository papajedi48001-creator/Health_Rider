'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { failedDeliveryReasons, recipientRelations, type FailedDeliveryReason, type RecipientRelation } from '@/domain/delivery/offline-event-rules';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { failureReasonLabels, recipientRelationLabels, statusLabels } from '@/lib/labels';
import type { OfflineEvent } from '@/pwa/offline-queue';
import { toEvidenceJpeg } from '@/pwa/photo';
import { riderQueue, syncRiderQueue } from '@/pwa/rider-sync';

type AttemptView = {
  id: string;
  status: DeliveryAttemptStatus;
  deliveryVersion: number;
  patient: { hn: string; name: string; age: number | null; telephone: string | null; address: string };
};

const pendingMessage = 'บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์';

export function RiderAttempt({ attemptId }: { attemptId: string }) {
  const [view, setView] = useState<AttemptView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('บันทึกรับยาหรือส่งยาได้แม้ไม่มีสัญญาณ');
  const [pending, setPending] = useState(0);
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/rider/attempts/${attemptId}`, { cache: 'no-store' });
      if (!response.ok) {
        setLoadError(response.status === 404 ? 'ไม่พบงานจัดส่งนี้ หรือไม่ใช่งานที่คุณรับไว้' : 'โหลดข้อมูลงานไม่สำเร็จ');
        return;
      }
      setView((await response.json()) as AttemptView);
      setLoadError('');
    } catch {
      setLoadError('ออฟไลน์อยู่ ข้อมูลผู้ป่วยจะแสดงเมื่อกลับมาออนไลน์');
    }
  }, [attemptId]);

  const refreshPending = useCallback(async () => {
    setPending((await riderQueue.pending()).filter((event) => event.attemptId === attemptId).length);
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

  const active = view && ['claimed', 'in_transit'].includes(view.status);

  return (
    <main>
      <h1>บันทึกงานจัดส่ง</h1>
      <p aria-live="polite" role="status">{message}{pending > 0 ? ` (ค้างส่ง ${pending} รายการ)` : ''}</p>
      {loadError && <p>{loadError}</p>}
      {view && (
        <section aria-label="ข้อมูลผู้รับ">
          <h2>{view.patient.name}</h2>
          <p>HN <code>{view.patient.hn}</code> · อายุ {view.patient.age ?? '-'} ปี</p>
          <p>โทร {view.patient.telephone ? <a href={`tel:${view.patient.telephone}`}>{view.patient.telephone}</a> : '-'}</p>
          <p>{view.patient.address}</p>
          <p>สถานะ: {statusLabels[view.status]}</p>
        </section>
      )}
      {active && (
        <>
          {view.status === 'claimed' && (
            <button type="button" disabled={recording} onClick={() => void record('picked_up', {})}>บันทึกรับยา</button>
          )}
          <form onSubmit={(event) => void submitDelivery(event)} aria-label="บันทึกส่งยาสำเร็จ">
            <h2>ส่งยาสำเร็จ</h2>
            <label>
              รูปหลักฐาน (ไม่ถ่ายใบหน้าหรือเอกสารของผู้ป่วย)
              <input name="photo" type="file" accept="image/*" capture="environment" required />
            </label>
            <label>
              ผู้รับยา
              <select name="recipientRelation" defaultValue="self">
                {recipientRelations.map((relation) => <option key={relation} value={relation}>{recipientRelationLabels[relation]}</option>)}
              </select>
            </label>
            <button type="submit" disabled={recording}>บันทึกส่งยา</button>
          </form>
          <form onSubmit={(event) => void submitFailure(event)} aria-label="บันทึกส่งไม่สำเร็จ">
            <h2>ส่งไม่สำเร็จ</h2>
            <label>
              เหตุผล
              <select name="reason" defaultValue={failedDeliveryReasons[0]}>
                {failedDeliveryReasons.map((reason) => <option key={reason} value={reason}>{failureReasonLabels[reason]}</option>)}
              </select>
            </label>
            <button type="submit" disabled={recording}>บันทึกส่งไม่สำเร็จ</button>
          </form>
        </>
      )}
      {view?.status === 'return_required' && <p>นำยากลับมาคืนเภสัชกรรมภายในวันนี้</p>}
      <p><Link href="/rider/scan">กลับไปหน้ารับงาน</Link></p>
    </main>
  );
}

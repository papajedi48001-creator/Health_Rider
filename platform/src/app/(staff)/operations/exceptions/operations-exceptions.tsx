'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { conflictReasonLabels, failureReasonLabels, formatThaiDateTime, recipientRelationLabels, shortCode, statusLabels } from '@/lib/labels';

type Exceptions = {
  returns: Array<{ id: string; failedAt: string | null; failureReason: string | null; rider: { displayName: string } | null; deliveryRequest: { hn: string; patientName: string } }>;
  conflicts: Array<{
    id: string; reason: string; previousStatus: DeliveryAttemptStatus; createdAt: string; deliveryAttemptId: string;
    offlineDeliveryEvent: { id: string; eventType: string; deliveryVersion: number; deviceCapturedAt: string; serverReceivedAt: string; payload: Record<string, unknown> };
    deliveryAttempt: { rider: { displayName: string } | null; deliveryRequest: { hn: string; patientName: string; deliveryAddress: string; telephone: string | null; deliveryVersion: number } };
  }>;
};

const eventLabels: Record<string, string> = { picked_up: 'รับยา', delivered: 'ส่งยาสำเร็จ', delivery_failed: 'ส่งไม่สำเร็จ' };

export function OperationsExceptions({ canResolve }: { canResolve: boolean }) {
  const [data, setData] = useState<Exceptions | null>(null);
  const [message, setMessage] = useState('กำลังโหลด');

  const load = useCallback(async () => {
    const result = await callApi<Exceptions>('/api/operations/exceptions');
    if (!result.ok) return setMessage(result.message);
    setData(result.data);
    setMessage('');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(event: FormEvent<HTMLFormElement>, conflictId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await callApi(`/api/operations/conflicts/${conflictId}/resolve`, { json: { outcome: form.get('outcome'), resolution: form.get('resolution') } });
    if (!result.ok) return setMessage(result.message);
    await load();
    setMessage('บันทึกผลการตรวจสอบแล้ว หลักฐานเดิมยังเก็บไว้ครบ');
  }

  return (
    <div>
      <p aria-live="polite">{message}</p>
      <section aria-label="สถานะรายการ">
        <h2>รอรับยาคืน ({data?.returns.length ?? 0})</h2>
        <p>รายการที่ส่งไม่สำเร็จต้องได้รับการยืนยันกลับถึงเภสัชกรรมก่อนสร้าง QR ใหม่</p>
        <ul>
          {data?.returns.map((item) => (
            <li key={item.id}>
              {item.deliveryRequest.patientName} · พัสดุ {shortCode(item.id)} · {item.rider?.displayName ?? '-'} ·{' '}
              {failureReasonLabels[item.failureReason as keyof typeof failureReasonLabels] ?? '-'} · {formatThaiDateTime(item.failedAt)}
            </li>
          ))}
        </ul>
        <h2>หลักฐานที่รอตรวจสอบ ({data?.conflicts.length ?? 0})</h2>
        <p>หลักฐานเดิมถูกเก็บไว้ครบถ้วน แม้ข้อมูลจัดส่งมีการแก้ไขภายหลัง</p>
        <ul>
          {data?.conflicts.map((conflict) => {
            const event = conflict.offlineDeliveryEvent;
            const relation = event.payload.recipientRelation as keyof typeof recipientRelationLabels | undefined;
            return (
              <li key={conflict.id}>
                <h3>{conflict.deliveryAttempt.deliveryRequest.patientName} · พัสดุ {shortCode(conflict.deliveryAttemptId)}</h3>
                <p>{eventLabels[event.eventType] ?? event.eventType} โดย {conflict.deliveryAttempt.rider?.displayName ?? '-'} · {conflictReasonLabels[conflict.reason] ?? conflict.reason}</p>
                <p>บันทึกในเครื่อง {formatThaiDateTime(event.deviceCapturedAt)} · ถึงระบบ {formatThaiDateTime(event.serverReceivedAt)}</p>
                <p>ข้อมูลจัดส่งฉบับที่ {event.deliveryVersion} (ปัจจุบันฉบับที่ {conflict.deliveryAttempt.deliveryRequest.deliveryVersion}) · สถานะก่อนหน้า {statusLabels[conflict.previousStatus]}</p>
                {relation && <p>ผู้รับ: {recipientRelationLabels[relation] ?? relation}</p>}
                {typeof event.payload.photoPath === 'string' && canResolve && (
                  <p><a href={`/api/operations/events/${event.id}/photo`} target="_blank" rel="noreferrer">ดูรูปหลักฐาน</a></p>
                )}
                {canResolve && (
                  <form onSubmit={(formEvent) => void resolve(formEvent, conflict.id)} aria-label="บันทึกผลการตรวจสอบ">
                    <label><input type="radio" name="outcome" value="accept" required /> ยอมรับรายการนี้</label>
                    <label><input type="radio" name="outcome" value="dismiss" /> ไม่ยอมรับ คงสถานะเดิม</label>
                    <label>เหตุผล <input name="resolution" required /></label>
                    <button type="submit">บันทึกผลการตรวจสอบ</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

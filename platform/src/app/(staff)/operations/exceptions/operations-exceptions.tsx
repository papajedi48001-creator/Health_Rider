'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { EmptyState } from '@/brand/empty-state';
import { Icon } from '@/brand/icons';
import { conflictReasonLabels, failureReasonLabels, formatThaiDateTime, recipientRelationLabels, shortCode, statusLabels } from '@/lib/labels';
import { withBasePath } from '@/lib/base-path';

type Exceptions = {
  returns: Array<{ id: string; failedAt: string | null; failureReason: string | null; rider: { displayName: string } | null; deliveryRequest: { hn: string; patientName: string } }>;
  conflicts: Array<{
    id: string; reason: string; previousStatus: DeliveryAttemptStatus; createdAt: string; deliveryAttemptId: string;
    offlineDeliveryEvent: { id: string; eventType: string; deliveryVersion: number; deviceCapturedAt: string; serverReceivedAt: string; payload: Record<string, unknown> };
    deliveryAttempt: { rider: { displayName: string } | null; deliveryRequest: { hn: string; patientName: string; deliveryAddress: string; telephone: string | null; deliveryVersion: number } };
  }>;
};

const eventLabels: Record<string, string> = { picked_up: 'รับยา', delivered: 'ส่งยาสำเร็จ', delivery_failed: 'ส่งไม่สำเร็จ' };

export function OperationsExceptions({ canResolve, canReceiveReturn }: { canResolve: boolean; canReceiveReturn: boolean }) {
  const [data, setData] = useState<Exceptions | null>(null);
  const [message, setMessage] = useState('กำลังโหลด');
  const [busy, setBusy] = useState<string | null>(null);

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

  async function receiveReturn(attemptId: string) {
    setBusy(attemptId);
    const result = await callApi(`/api/pharmacy/attempts/${attemptId}/return`, { json: {} });
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    await load();
    window.dispatchEvent(new Event('health-rider:counts'));
    setMessage('รับยาคืนแล้ว เภสัชกรรมเตรียมพัสดุใหม่ได้เมื่อพร้อมส่งอีกครั้ง');
  }

  const returns = data?.returns ?? [];
  const conflicts = data?.conflicts ?? [];

  return (
    <div>
      <p aria-live="polite">{message}</p>
      <div className="stat-row">
        <a href="#returns" className={`stat stat-link${returns.length ? ' chip-warning' : ''}`}>
          <span className="stat-icon"><Icon name="undo" size={22} /></span>
          <span className="stat-body"><strong>{returns.length}</strong>รอรับยาคืน</span>
        </a>
        <a href="#conflicts" className={`stat stat-link${conflicts.length ? ' chip-danger' : ''}`}>
          <span className="stat-icon"><Icon name="alert" size={22} /></span>
          <span className="stat-body"><strong>{conflicts.length}</strong>หลักฐานรอตรวจสอบ</span>
        </a>
      </div>

      <section id="returns" className="exception-section" aria-label="รอรับยาคืน">
        <header className="exception-head">
          <span className="exception-icon tone-warning"><Icon name="undo" size={22} /></span>
          <div>
            <h2>รอรับยาคืน <span className="count-chip">{returns.length}</span></h2>
            <p className="muted">ส่งไม่สำเร็จแล้ว ต้องนำยากลับมาให้เภสัชกรรมยืนยันรับคืนในวันเดียวกัน ก่อนสร้าง QR ใหม่</p>
            {!canReceiveReturn && returns.length > 0 && (
              <p className="notice">หน้านี้ใช้ติดตาม ผู้ประสานงานหรือเภสัชกรรมเป็นผู้กดยืนยันรับยาคืนเมื่อได้รับยากลับมาแล้ว</p>
            )}
          </div>
        </header>
        {data && returns.length === 0 ? <EmptyState text="ไม่มียาที่รอรับคืน" /> : (
          <table>
            <thead><tr><th>พัสดุ</th><th>ผู้ป่วย</th><th>ไรเดอร์</th><th>สาเหตุ</th><th>ส่งไม่สำเร็จเมื่อ</th>{canReceiveReturn && <th />}</tr></thead>
            <tbody>
              {returns.map((item) => (
                <tr key={item.id}>
                  <td><code>{shortCode(item.id)}</code></td>
                  <td>{item.deliveryRequest.patientName}<br /><code>{item.deliveryRequest.hn}</code></td>
                  <td>{item.rider?.displayName ?? '-'}</td>
                  <td><span className="chip chip-danger">{failureReasonLabels[item.failureReason as keyof typeof failureReasonLabels] ?? '-'}</span></td>
                  <td>{formatThaiDateTime(item.failedAt)}</td>
                  {canReceiveReturn && (
                    <td>
                      <button type="button" className="btn btn-primary btn-small" disabled={busy === item.id} onClick={() => void receiveReturn(item.id)}>
                        {busy === item.id ? 'กำลังบันทึก' : 'ยืนยันรับยาคืน'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section id="conflicts" className="exception-section" aria-label="หลักฐานที่รอตรวจสอบ">
        <header className="exception-head">
          <span className="exception-icon tone-danger"><Icon name="alert" size={22} /></span>
          <div>
            <h2>หลักฐานที่รอตรวจสอบ <span className="count-chip">{conflicts.length}</span></h2>
            <p className="muted">ไรเดอร์บันทึกขณะออฟไลน์แต่ข้อมูลไม่ตรงกับระบบ ตรวจแล้วเลือกยอมรับหรือคงสถานะเดิม หลักฐานเดิมเก็บไว้ครบ</p>
          </div>
        </header>
        {data && conflicts.length === 0 ? <EmptyState text="ไม่มีหลักฐานที่รอตรวจสอบ" /> : (
          <ul className="conflict-list">
            {conflicts.map((conflict) => {
              const event = conflict.offlineDeliveryEvent;
              const relation = event.payload.recipientRelation as keyof typeof recipientRelationLabels | undefined;
              return (
                <li key={conflict.id} className="conflict-card">
                  <div className="conflict-title">
                    <h3>{conflict.deliveryAttempt.deliveryRequest.patientName}</h3>
                    <code>พัสดุ {shortCode(conflict.deliveryAttemptId)}</code>
                  </div>
                  <p className="chip-row">
                    <span className="chip chip-info">{eventLabels[event.eventType] ?? event.eventType}</span>
                    <span className="chip chip-warning">{conflictReasonLabels[conflict.reason] ?? conflict.reason}</span>
                  </p>
                  <dl className="conflict-facts">
                    <dt>ไรเดอร์</dt><dd>{conflict.deliveryAttempt.rider?.displayName ?? '-'}</dd>
                    <dt>บันทึกในเครื่อง</dt><dd>{formatThaiDateTime(event.deviceCapturedAt)}</dd>
                    <dt>ถึงระบบ</dt><dd>{formatThaiDateTime(event.serverReceivedAt)}</dd>
                    <dt>ข้อมูลจัดส่ง</dt><dd>ฉบับที่ {event.deliveryVersion} (ปัจจุบันฉบับที่ {conflict.deliveryAttempt.deliveryRequest.deliveryVersion})</dd>
                    <dt>สถานะก่อนหน้า</dt><dd>{statusLabels[conflict.previousStatus]}</dd>
                    {relation && <><dt>ผู้รับ</dt><dd>{recipientRelationLabels[relation] ?? relation}</dd></>}
                  </dl>
                  {typeof event.payload.photoPath === 'string' && canResolve && (
                    <a className="btn btn-secondary btn-small" href={withBasePath(`/api/operations/events/${event.id}/photo`)} target="_blank" rel="noreferrer"><Icon name="image" size={18} /> ดูรูปหลักฐาน</a>
                  )}
                  {canResolve && (
                    <form className="resolve-form" onSubmit={(formEvent) => void resolve(formEvent, conflict.id)} aria-label="บันทึกผลการตรวจสอบ">
                      <div className="choice-row">
                        <label className="choice"><input type="radio" name="outcome" value="accept" required /> ยอมรับรายการนี้</label>
                        <label className="choice"><input type="radio" name="outcome" value="dismiss" /> ไม่ยอมรับ คงสถานะเดิม</label>
                      </div>
                      <label>เหตุผล <input name="resolution" required placeholder="เช่น โทรยืนยันกับไรเดอร์แล้ว" /></label>
                      <button type="submit">บันทึกผลการตรวจสอบ</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

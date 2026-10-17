'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import type { FailedDeliveryReason, RecipientRelation } from '@/domain/delivery/offline-event-rules';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { withBasePath } from '@/lib/base-path';
import { failureReasonLabels, formatThaiDateTime, recipientRelationLabels, shortCode, statusLabels } from '@/lib/labels';
import { statusTone } from '@/lib/status-tone';
import { PersonName } from '@/account/person-name';

type Details = {
  id: string; status: DeliveryAttemptStatus; attemptNumber: number;
  createdAt: string; claimedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; failedAt: string | null; returnedAt: string | null;
  failureReason: string | null;
  rider: { id: string; displayName: string; avatarUpdatedAt: string | null; phone: string | null; riderProfile: { riderCode: string } | null } | null;
  // The location fields are only sent to admins.
  evidence: { recipientRelation: string; deviceCapturedAt: string; serverReceivedAt: string; latitude?: number | null; longitude?: number | null; locationAccuracyM?: number | null } | null;
  deliveryRequest: {
    hosVisitNumber: string | null; hn: string; patientName: string; patientAge: number | null; telephone: string | null; deliveryAddress: string;
    deliveryVersion: number; rateSatang: number | null; createdAt: string; createdBy: { displayName: string }; deliveryZone: { displayName: string };
  };
  otherAttempts: Array<{ id: string; status: DeliveryAttemptStatus; createdAt: string }>;
  history: Array<{ id: string; action: string; reason: string | null; createdAt: string; actorName: string | null }>;
};

const historyLabels: Record<string, string> = {
  'delivery_request.created_from_hos_candidate': 'เภสัชยืนยันจาก HOSxP',
  'delivery_attempt.prepared': 'เตรียมพัสดุ',
  'package_qr.reissued': 'ออก QR ใหม่',
  'delivery_attempt.claimed': 'ไรเดอร์รับงาน',
  'delivery_request.amended_in_transit': 'แก้ที่อยู่/โทรศัพท์ระหว่างส่ง',
  'delivery_attempt.sync_conflict': 'ข้อมูลจากไรเดอร์ขัดกัน ส่งให้ตรวจสอบ',
  'delivery_attempt.event_rejected': 'ไม่รับข้อมูลจากไรเดอร์',
  'sync_conflict.resolved': 'ผู้ประสานงานตรวจสอบแล้ว',
  'delivery_attempt.medication_returned': 'รับยาคืน',
};

const baht = (satang: number) => `${(satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;

// The ⓘ pop-up behind every delivery record: one delivery from HOSxP confirmation to proof of delivery.
export function DeliveryDetails({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [message, setMessage] = useState('กำลังโหลด');
  const [photoMissing, setPhotoMissing] = useState(false);

  useEffect(() => {
    let current = true;
    void callApi<Details>(`/api/operations/attempts/${attemptId}`).then((result) => {
      if (!current) return;
      if (result.ok) setDetails(result.data);
      else setMessage(result.message);
    });
    return () => { current = false; };
  }, [attemptId]);

  // Listens in the capture phase and stops there, so Escape closes only this pop-up when it opens over another one.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [onClose]);

  const request = details?.deliveryRequest;
  const timeline = details ? [
    ['เตรียมพัสดุ', details.createdAt],
    ['ไรเดอร์รับงาน', details.claimedAt],
    ['รับพัสดุออกไปส่ง', details.pickedUpAt],
    ['ส่งสำเร็จ', details.deliveredAt],
    ['ส่งไม่สำเร็จ', details.failedAt],
    ['รับยาคืน', details.returnedAt],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])) : [];

  // Rendered under <body> so it also opens cleanly over another pop-up, such as a rider's job list.
  return createPortal(
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`รายละเอียดการส่ง ${request?.patientName ?? ''}`} onClick={onClose}>
      <div className="photo-viewer-body detail-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="photo-viewer-head">
          <strong>รายละเอียดการส่ง {details && <code>{shortCode(details.id)}</code>}</strong>
          <button type="button" className="icon-button" aria-label="ปิดรายละเอียด" onClick={onClose} autoFocus><Icon name="close" /></button>
        </div>
        {!details || !request ? <p aria-live="polite">{message}</p> : (
          <>
            <p><span className={`chip ${statusTone(details.status)}`}>{statusLabels[details.status]}</span>{details.attemptNumber > 1 && <> · ส่งครั้งที่ {details.attemptNumber}</>}</p>

            {details.evidence && (
              <section aria-label="หลักฐานการส่ง">
                <h3>หลักฐานการส่ง</h3>
                {photoMissing ? <p className="muted">ไม่พบไฟล์รูป</p> : (
                  // eslint-disable-next-line @next/next/no-img-element -- a private, uncached image served by our own API
                  <img src={withBasePath(`/api/rider/attempts/${details.id}/evidence`)} alt={`รูปหลักฐานการส่ง ${request.patientName}`} onError={() => setPhotoMissing(true)} />
                )}
                <dl className="detail-list">
                  <dt>ผู้รับ</dt><dd>{recipientRelationLabels[details.evidence.recipientRelation as RecipientRelation] ?? details.evidence.recipientRelation}</dd>
                  <dt>ถ่ายรูปเมื่อ</dt><dd>{formatThaiDateTime(details.evidence.deviceCapturedAt)}</dd>
                  <dt>ถึงระบบเมื่อ</dt><dd>{formatThaiDateTime(details.evidence.serverReceivedAt)}</dd>
                  {details.evidence.latitude !== undefined && <><dt>พิกัด GPS</dt><dd><EvidenceLocation evidence={details.evidence} /></dd></>}
                </dl>
              </section>
            )}

            <section aria-label="ผู้ป่วย">
              <h3>ผู้ป่วย</h3>
              <dl className="detail-list">
                <dt>ชื่อ</dt><dd>{request.patientName}{request.patientAge !== null && ` (${request.patientAge} ปี)`}</dd>
                <dt>HN</dt><dd><code>{request.hn}</code>{request.hosVisitNumber && <> · VN <code>{request.hosVisitNumber}</code></>}</dd>
                <dt>โทรศัพท์</dt><dd>{request.telephone ? <a href={`tel:${request.telephone}`}>{request.telephone}</a> : '-'}</dd>
                <dt>ที่อยู่จัดส่ง</dt><dd>{request.deliveryAddress}</dd>
                <dt>โซน</dt><dd>{request.deliveryZone.displayName}</dd>
                <dt>ค่าบริการ</dt><dd>{request.rateSatang === null ? 'ยังไม่ได้ตั้งราคา' : baht(request.rateSatang)}</dd>
                <dt>ยืนยันโดย</dt><dd>{request.createdBy.displayName} · {formatThaiDateTime(request.createdAt)}</dd>
              </dl>
            </section>

            <section aria-label="ไรเดอร์และเวลา">
              <h3>ไรเดอร์และเวลา</h3>
              <dl className="detail-list">
                <dt>ไรเดอร์</dt>
                <dd>
                  {details.rider ? (
                    <PersonName person={details.rider}>
                      {details.rider.riderProfile && <> · <code>{details.rider.riderProfile.riderCode}</code></>}
                      {details.rider.phone && <> · <a href={`tel:${details.rider.phone}`}>{details.rider.phone}</a></>}
                    </PersonName>
                  ) : 'ยังไม่มีไรเดอร์รับงาน'}
                </dd>
                {timeline.map(([label, at]) => <Fragment key={label}><dt>{label}</dt><dd>{formatThaiDateTime(at)}</dd></Fragment>)}
                {details.failureReason && <><dt>เหตุที่ส่งไม่สำเร็จ</dt><dd>{failureReasonLabels[details.failureReason as FailedDeliveryReason] ?? details.failureReason}</dd></>}
              </dl>
            </section>

            {details.otherAttempts.length > 0 && (
              <section aria-label="การส่งครั้งอื่นของรายการนี้">
                <h3>การส่งครั้งอื่นของรายการนี้</h3>
                <ul className="detail-history">
                  {details.otherAttempts.map((other) => (
                    <li key={other.id}><code>{shortCode(other.id)}</code> {statusLabels[other.status]} · {formatThaiDateTime(other.createdAt)}</li>
                  ))}
                </ul>
              </section>
            )}

            {details.history.length > 0 && (
              <section aria-label="ประวัติ">
                <h3>ประวัติ</h3>
                <ul className="detail-history">
                  {details.history.map((event) => (
                    <li key={event.id}>
                      <span className="muted">{formatThaiDateTime(event.createdAt)}</span> {historyLabels[event.action] ?? event.action}
                      {event.actorName && <> โดย {event.actorName}</>}
                      {event.reason && <> · {event.reason}</>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// The ⓘ button that opens the details pop-up for one delivery; drop it into any list of delivery records.
export function DeliveryInfoButton({ attemptId, patientName }: { attemptId: string; patientName: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="icon-button info-button" aria-label={`ดูรายละเอียดการส่ง ${patientName}`} title="ดูรายละเอียด" onClick={() => setOpen(true)}>
        <Icon name="info" size={20} />
      </button>
      {open && <DeliveryDetails attemptId={attemptId} onClose={close} />}
    </>
  );
}

function EvidenceLocation({ evidence }: { evidence: { latitude?: number | null; longitude?: number | null; locationAccuracyM?: number | null } }) {
  if (evidence.latitude == null || evidence.longitude == null) return <span className="muted">ไม่ได้บันทึก (ไรเดอร์ปิด GPS หรือไม่อนุญาตตำแหน่ง)</span>;
  const position = `${evidence.latitude.toFixed(6)},${evidence.longitude.toFixed(6)}`;
  return (
    <>
      <a href={`https://www.google.com/maps?q=${position}`} target="_blank" rel="noopener noreferrer">{position}</a>
      {evidence.locationAccuracyM != null && <span className="muted"> (คลาดเคลื่อน ±{Math.round(evidence.locationAccuracyM)} ม.)</span>}
    </>
  );
}

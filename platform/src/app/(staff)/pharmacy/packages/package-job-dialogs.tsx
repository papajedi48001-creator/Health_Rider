'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';

export type EditableJob = {
  id: string; hn: string; patientName: string; telephone: string | null; deliveryAddress: string; deliveryVersion: number;
  zoneName: string; packageCode: string | null;
  // The package waiting for a rider, if any; deleting it sends the job back to "เตรียมพัสดุ" instead of deleting the job.
  packageId?: string | null;
};

function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
}

function JobSummary({ job }: { job: EditableJob }) {
  return (
    <dl className="detail-list">
      <dt>ผู้ป่วย</dt><dd>{job.patientName}</dd>
      <dt>HN</dt><dd>{job.hn}</dd>
      <dt>โซน</dt><dd>{job.zoneName}</dd>
      {job.packageCode && <><dt>พัสดุ</dt><dd><code>{job.packageCode}</code></dd></>}
    </dl>
  );
}

// Edit the delivery address or telephone, then confirm the old and new values side by side before saving.
// The reason and both values go to the audit log.
export function EditJobDialog({ job, onClose, onSaved }: { job: EditableJob; onClose: () => void; onSaved: (message: string) => void }) {
  const [draft, setDraft] = useState({ deliveryAddress: job.deliveryAddress, telephone: job.telephone ?? '', reason: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useCloseOnEscape(onClose);

  const changes = [
    { label: 'ที่อยู่จัดส่ง', before: job.deliveryAddress, after: draft.deliveryAddress.trim() },
    { label: 'เบอร์โทร', before: job.telephone ?? '', after: draft.telephone.trim() },
  ].filter((change) => change.before !== change.after);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changes.length === 0) return setProblem('ไม่มีข้อมูลที่เปลี่ยนแปลง');
    setProblem('');
    setConfirming(true);
  }

  async function save() {
    setBusy(true);
    const result = await callApi(`/api/pharmacy/requests/${job.id}`, {
      method: 'PATCH', json: { deliveryAddress: draft.deliveryAddress, telephone: draft.telephone, reason: draft.reason, expectedVersion: job.deliveryVersion },
    });
    setBusy(false);
    if (!result.ok) { setConfirming(false); return setProblem(result.message); }
    onSaved(job.packageCode
      ? `แก้ไขข้อมูล ${job.patientName} แล้ว ฉลากที่พิมพ์ไปแล้วยังเป็นข้อมูลเดิม กด "พิมพ์ซ้ำ" หรือ "ออก QR ใหม่" เพื่อพิมพ์ฉลากใหม่`
      : `แก้ไขข้อมูล ${job.patientName} แล้ว`);
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`แก้ไขข้อมูล ${job.patientName}`}>
      <div className="photo-viewer-body detail-dialog">
        <div className="photo-viewer-head">
          <strong>{confirming ? 'ยืนยันการแก้ไข' : 'แก้ไขข้อมูลจัดส่ง'}</strong>
          <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}><Icon name="close" /></button>
        </div>
        {problem && <p className="notice notice-danger" role="alert">{problem}</p>}
        <JobSummary job={job} />
        {confirming ? (
          <>
            <p>ตรวจสอบข้อมูลก่อนบันทึก ระบบจะเก็บค่าเดิม ค่าใหม่ ผู้แก้ไข และเหตุผลไว้ในบันทึกการใช้งาน</p>
            <table className="change-table">
              <thead><tr><th>ข้อมูล</th><th>เดิม</th><th>ใหม่</th></tr></thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.label}><th scope="row">{change.label}</th><td>{change.before || '-'}</td><td><strong>{change.after || '-'}</strong></td></tr>
                ))}
              </tbody>
            </table>
            <p>เหตุผล: {draft.reason.trim()}</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก' : 'ยืนยันแก้ไข'}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>กลับไปแก้</button>
            </div>
          </>
        ) : (
          <form onSubmit={review} aria-label={`ข้อมูลจัดส่งของ ${job.patientName}`}>
            <label>ที่อยู่จัดส่ง
              <textarea name="deliveryAddress" required rows={3} value={draft.deliveryAddress} onChange={(event) => setDraft({ ...draft, deliveryAddress: event.target.value })} autoFocus />
            </label>
            <label>เบอร์โทร
              <input name="telephone" type="tel" inputMode="tel" value={draft.telephone} onChange={(event) => setDraft({ ...draft, telephone: event.target.value })} />
            </label>
            <label>เหตุผลการแก้ไข
              <input name="reason" required value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="เช่น ญาติแจ้งย้ายบ้าน" />
            </label>
            <div className="dialog-actions">
              <button type="submit">ถัดไป</button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Delete a job no rider has had; asks for a reason and an explicit confirmation, and the deletion is logged.
export function DeleteJobDialog({ job, onClose, onDeleted }: { job: EditableJob; onClose: () => void; onDeleted: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useCloseOnEscape(onClose);

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const url = job.packageId ? `/api/pharmacy/attempts/${job.packageId}` : `/api/pharmacy/requests/${job.id}`;
    const result = await callApi(url, { method: 'DELETE', json: { reason } });
    setBusy(false);
    if (!result.ok) return setProblem(result.message);
    onDeleted(job.packageId
      ? `ลบพัสดุของ ${job.patientName} แล้ว งานกลับไปอยู่ที่เมนูเตรียมพัสดุ`
      : `ลบงานของ ${job.patientName} แล้ว หากลบผิด ยืนยันรายการนี้ใหม่ได้จากเมนูรอยืนยันจาก HOSxP`);
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`ลบงานของ ${job.patientName}`}>
      <div className="photo-viewer-body detail-dialog">
        <div className="photo-viewer-head">
          <strong>ยืนยันการลบ</strong>
          <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}><Icon name="close" /></button>
        </div>
        {problem && <p className="notice notice-danger" role="alert">{problem}</p>}
        <JobSummary job={job} />
        <p className="notice notice-danger">
          {job.packageId
            ? 'ต้องการลบพัสดุนี้ออกจากรอไรเดอร์รับงานใช่หรือไม่ งานจะกลับไปอยู่ที่เมนูเตรียมพัสดุ และ QR บนฉลากที่พิมพ์แล้วจะสแกนรับงานไม่ได้อีก'
            : `ต้องการลบงานจัดส่งนี้ใช่หรือไม่${job.packageCode ? ' QR บนฉลากที่พิมพ์แล้วจะสแกนรับงานไม่ได้อีก' : ''}`} ระบบจะเก็บข้อมูลที่ลบ ผู้ลบ และเหตุผลไว้ในบันทึกการใช้งาน
        </p>
        <form onSubmit={(event) => void remove(event)} aria-label="ฟอร์มยืนยันการลบ">
          <label>เหตุผลการลบ
            <input name="reason" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น ผู้ป่วยมารับยาเองที่โรงพยาบาล" autoFocus />
          </label>
          <div className="dialog-actions">
            <button type="submit" className="btn btn-danger" disabled={busy}>{busy ? 'กำลังลบ' : 'ยืนยันลบ'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';

export type EditableJob = {
  id: string; hn: string; patientName: string; telephone: string | null; deliveryAddress: string; deliveryVersion: number;
  zoneId: string; zoneName: string; packageCode: string | null;
  // The package waiting for a rider, if any; deleting it sends the job back to "เตรียมพัสดุ" instead of deleting the job.
  packageId?: string | null;
};

type ZoneOption = { id: string; subdistrictCode: string; subdistrictName: string | null; villageCode: string; displayName: string };

const byThai = (left: string, right: string) => left.localeCompare(right, 'th', { numeric: true });
// "หมู่ 1 บ้านพังฮอ ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร" reads as "หมู่ 1 บ้านพังฮอ" once the subdistrict is chosen.
const villageName = (zone: ZoneOption) => zone.displayName.split(/\s+ต\./)[0] || zone.displayName;

// Zones in use, loaded once for the edit pop-up; while loading or when it fails, the zone stays as it is.
function useZones() {
  const [zones, setZones] = useState<ZoneOption[] | null>(null);
  useEffect(() => {
    let live = true;
    void callApi<{ zones: ZoneOption[] }>('/api/pharmacy/zones').then((result) => { if (live && result.ok) setZones(result.data.zones); });
    return () => { live = false; };
  }, []);
  return zones;
}

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
  const [draft, setDraft] = useState({ deliveryAddress: job.deliveryAddress, telephone: job.telephone ?? '', zoneId: job.zoneId, reason: '' });
  const zones = useZones();
  const currentZone = zones?.find((zone) => zone.id === job.zoneId);
  const chosenZone = zones?.find((zone) => zone.id === draft.zoneId);
  const [subdistrict, setSubdistrict] = useState<string | null>(null);
  const subdistrictCode = subdistrict ?? currentZone?.subdistrictCode ?? '';
  const subdistricts = new Map<string, string>();
  for (const zone of zones ?? []) subdistricts.set(zone.subdistrictCode, zone.subdistrictName ?? `ตำบล ${zone.subdistrictCode}`);
  const villages = (zones ?? []).filter((zone) => zone.subdistrictCode === subdistrictCode)
    .sort((left, right) => byThai(left.villageCode, right.villageCode));
  const zoneChanged = draft.zoneId !== job.zoneId;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useCloseOnEscape(onClose);

  const changes = [
    { label: 'ที่อยู่จัดส่ง', before: job.deliveryAddress, after: draft.deliveryAddress.trim() },
    { label: 'เบอร์โทร', before: job.telephone ?? '', after: draft.telephone.trim() },
    { label: 'โซน', before: job.zoneName, after: zoneChanged ? chosenZone?.displayName ?? '' : job.zoneName },
  ].filter((change) => change.before !== change.after);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.zoneId) return setProblem('ต้องเลือกหมู่บ้านของโซนจัดส่ง');
    if (changes.length === 0) return setProblem('ไม่มีข้อมูลที่เปลี่ยนแปลง');
    setProblem('');
    setConfirming(true);
  }

  async function save() {
    setBusy(true);
    const result = await callApi(`/api/pharmacy/requests/${job.id}`, {
      method: 'PATCH', json: {
        deliveryAddress: draft.deliveryAddress, telephone: draft.telephone, reason: draft.reason, expectedVersion: job.deliveryVersion,
        ...(zoneChanged ? { deliveryZoneId: draft.zoneId } : {}),
      },
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
            {zoneChanged && <p className="notice">ค่าบริการไรเดอร์ของงานนี้จะคิดตามอัตราของโซนใหม่</p>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก' : 'ยืนยันแก้ไข'}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>กลับไปแก้</button>
            </div>
          </>
        ) : (
          <form onSubmit={review} aria-label={`ข้อมูลจัดส่งของ ${job.patientName}`}>
            <fieldset className="zone-picker">
              <legend>โซนจัดส่ง</legend>
              <label>ตำบล
                <select name="subdistrict" value={subdistrictCode} disabled={!zones}
                  onChange={(event) => {
                    const code = event.target.value;
                    setSubdistrict(code);
                    // Back on the job's own subdistrict, its own village comes back; elsewhere the village must be chosen.
                    setDraft({ ...draft, zoneId: code === currentZone?.subdistrictCode ? job.zoneId : '' });
                  }}>
                  {!subdistrictCode && <option value="">เลือกตำบล</option>}
                  {[...subdistricts.entries()].sort(([, left], [, right]) => byThai(left, right)).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </label>
              <label>หมู่บ้าน
                <select name="deliveryZoneId" value={draft.zoneId} disabled={!zones} onChange={(event) => setDraft({ ...draft, zoneId: event.target.value })}>
                  {!draft.zoneId && <option value="">เลือกหมู่บ้าน</option>}
                  {!zones && <option value={job.zoneId}>{job.zoneName}</option>}
                  {villages.map((zone) => <option key={zone.id} value={zone.id}>{villageName(zone)}</option>)}
                </select>
              </label>
              <small>{zoneChanged ? `เดิม: ${job.zoneName}` : zones ? 'เปลี่ยนตำบลหรือหมู่บ้านได้ หากผู้ป่วยย้ายไปอยู่โซนอื่น' : 'กำลังโหลดรายการโซน'}</small>
            </fieldset>
            <label>ที่อยู่จัดส่ง
              <textarea name="deliveryAddress" required rows={3} value={draft.deliveryAddress} onChange={(event) => setDraft({ ...draft, deliveryAddress: event.target.value })} autoFocus />
            </label>
            <label>เบอร์โทร
              <input name="telephone" type="tel" inputMode="tel" value={draft.telephone} onChange={(event) => setDraft({ ...draft, telephone: event.target.value })} />
            </label>
            <label>เหตุผลการแก้ไข
              <input name="reason" required value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="เช่น ญาติแจ้งย้ายบ้าน" />
            </label>
            {zoneChanged && (
              <p className="notice">เปลี่ยนโซนแล้ว ค่าบริการไรเดอร์จะคิดตามอัตราของโซนใหม่{job.packageCode ? ' และต้องพิมพ์ฉลากใหม่' : ''}</p>
            )}
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

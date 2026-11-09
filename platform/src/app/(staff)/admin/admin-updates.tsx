'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { formatThaiDateTime } from '@/lib/labels';
import { compareVersions, type Release } from '@/domain/system-update/releases';
import type { UpdaterJob, UpdaterRequest } from '@/domain/system-update/updater-channel';

type ListedRelease = Release & { relation: 'current' | 'newer' | 'older' };
type UpdateView = {
  current: Release;
  rollbackFloor: string;
  releases: ListedRelease[];
  updater: {
    configured: boolean; writable: boolean; reporting: boolean;
    checkedAt: string | null; fetchedAt: string | null; fetchError: string | null; deployedRef: string | null;
  };
  busy: boolean;
  pending: UpdaterRequest | null;
  job: UpdaterJob | null;
  history: UpdaterJob[];
};

const relationLabels: Record<ListedRelease['relation'], { text: string; chip: string }> = {
  current: { text: 'ใช้อยู่', chip: 'chip chip-success' },
  newer: { text: 'ใหม่กว่า', chip: 'chip chip-warning' },
  older: { text: 'เก่ากว่า', chip: 'chip' },
};
const actionLabels: Record<UpdaterJob['action'], string> = { update: 'อัปเดต', rollback: 'ย้อนกลับ', check: 'ตรวจหาเวอร์ชันใหม่' };
const stateLabels: Record<UpdaterJob['state'], { text: string; chip: string }> = {
  queued: { text: 'รอคิว', chip: 'chip' },
  running: { text: 'กำลังทำ', chip: 'chip chip-warning' },
  succeeded: { text: 'สำเร็จ', chip: 'chip chip-success' },
  failed: { text: 'ไม่สำเร็จ', chip: 'chip chip-danger' },
  rejected: { text: 'ถูกปฏิเสธ', chip: 'chip chip-danger' },
};

// The admin page for patches: what each version changed, and updating or rolling back to one of them.
export function AdminUpdates() {
  const [data, setData] = useState<UpdateView | null>(null);
  const [message, setMessage] = useState('');
  const [choice, setChoice] = useState<ListedRelease | null>(null);
  const [busy, setBusy] = useState(false);
  // The web container restarts during an update, so a failed refresh then is expected, not an error.
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<UpdateView>('/api/admin/system-update');
    if (!result.ok) {
      if (result.status === 0 || result.status >= 500) return setUnreachable(true);
      return setMessage(result.message);
    }
    setUnreachable(false);
    setData(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Follows a running job closely; otherwise refreshes once a minute to pick up new versions.
  const working = Boolean(data?.busy) || unreachable;
  useEffect(() => {
    const timer = window.setInterval(() => void load(), working ? 5_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [load, working]);

  async function checkNow() {
    setBusy(true);
    const result = await callApi<UpdateView>('/api/admin/system-update', { json: { action: 'check' } });
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    setData(result.data);
    setMessage('ส่งคำสั่งตรวจหาเวอร์ชันใหม่แล้ว เซิร์ฟเวอร์จะตรวจภายใน 1 นาที');
  }

  async function cancel() {
    if (!window.confirm('ยกเลิกคำสั่งที่ยังรอเซิร์ฟเวอร์อยู่ใช่ไหม')) return;
    const result = await callApi<UpdateView>('/api/admin/system-update', { method: 'DELETE' });
    if (!result.ok) return setMessage(result.message);
    setData(result.data);
    setMessage('ยกเลิกคำสั่งแล้ว');
  }

  async function submit(release: ListedRelease, reason: string): Promise<string | null> {
    const result = await callApi<UpdateView>('/api/admin/system-update', { json: { action: 'change', version: release.version, reason } });
    if (!result.ok) return result.message;
    setData(result.data);
    setChoice(null);
    setMessage(`ส่งคำสั่ง${release.relation === 'newer' ? 'อัปเดต' : 'ย้อนกลับ'}เป็นเวอร์ชัน ${release.version} แล้ว เซิร์ฟเวอร์จะเริ่มภายใน 1 นาที ระหว่างนั้นระบบอาจใช้งานไม่ได้ประมาณ 3-5 นาที`);
    return null;
  }

  if (!data) return <p aria-live="polite">{message || (unreachable ? 'เชื่อมต่อระบบไม่ได้ กำลังลองใหม่' : 'กำลังโหลดข้อมูลเวอร์ชัน')}</p>;

  const { updater } = data;
  const canChange = updater.configured && updater.writable && updater.reporting && !data.busy;
  const running = data.job && (data.job.state === 'running' || data.job.state === 'queued') ? data.job : null;

  return (
    <>
      <p aria-live="polite">{message}</p>

      {/* Only problems and work in progress show above the list; the version list marks the running one. */}
      <UpdaterProblems view={data} />
      {unreachable && <p className="notice" role="status">ระบบกำลังเริ่มใหม่หรือเชื่อมต่อไม่ได้ หน้านี้จะลองใหม่ทุก 5 วินาที</p>}
      {data.pending && (
        <div className="notice" role="status">
          รอเซิร์ฟเวอร์รับคำสั่ง: {data.pending.action === 'check' ? 'ตรวจหาเวอร์ชันใหม่' : `${actionLabels[data.pending.action]}เป็นเวอร์ชัน ${data.pending.version}`}
          {' '}โดย {data.pending.requestedBy.name} เมื่อ {formatThaiDateTime(data.pending.requestedAt)}{' '}
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void cancel()}>ยกเลิกคำสั่ง</button>
        </div>
      )}
      {running && running.action !== 'check' && (
        <p className="notice" role="status">
          กำลัง{actionLabels[running.action]}จาก {running.from ?? '-'} เป็นเวอร์ชัน {running.version}: {running.step ?? 'กำลังเริ่ม'}
        </p>
      )}

      <section aria-labelledby="updates-list">
        <div className="panel-head">
          <h2 id="updates-list">เวอร์ชันทั้งหมด</h2>
          <button type="button" className="btn btn-secondary btn-small" disabled={busy || !canChange} onClick={() => void checkNow()}>
            <Icon name="history" size={18} /> ตรวจหาเวอร์ชันใหม่ตอนนี้
          </button>
        </div>
        <p className="muted">เรียงจากใหม่ไปเก่า ก่อนเปลี่ยนเวอร์ชันทุกครั้งระบบจะสำรองฐานข้อมูลไว้บนเซิร์ฟเวอร์ และถ้าเวอร์ชันใหม่เปิดไม่ขึ้นจะกลับไปเวอร์ชันเดิมให้อัตโนมัติ ย้อนกลับได้ถึงเวอร์ชัน {data.rollbackFloor} เท่านั้น</p>
        <ol className="release-list">
          {data.releases.map((release) => (
            <li key={release.version} className={release.relation === 'current' ? 'release-current' : undefined} aria-label={`เวอร์ชัน ${release.version}`}>
              <div className="panel-head">
                <h3>เวอร์ชัน {release.version} <span className={relationLabels[release.relation].chip}>{relationLabels[release.relation].text}</span></h3>
                {release.relation !== 'current' && (
                  <button type="button" className={release.relation === 'newer' ? 'btn btn-primary btn-small' : 'btn btn-danger btn-small'}
                    disabled={!canChange} onClick={() => setChoice(release)}>
                    <Icon name={release.relation === 'newer' ? 'download' : 'undo'} size={18} />
                    {release.relation === 'newer' ? 'อัปเดตเป็นเวอร์ชันนี้' : 'ย้อนกลับเป็นเวอร์ชันนี้'}
                  </button>
                )}
              </div>
              <p className="muted"><Icon name="calendar" size={16} /> ออกเมื่อ {formatThaiDateTime(release.releasedAt)}{release.schemaChange && ' · มีการเปลี่ยนโครงสร้างฐานข้อมูล'}</p>
              <p><strong>{release.title}</strong></p>
              <p className="muted">มีอะไรใหม่</p>
              <ul className="bullet-list">{release.whatsNew.map((line) => <li key={line}>{line}</li>)}</ul>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="updates-history">
        <h2 id="updates-history">ประวัติการอัปเดตและย้อนกลับ</h2>
        {data.history.length === 0 ? <p className="muted">ยังไม่มีประวัติ</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>เวลาเริ่ม</th><th>คำสั่ง</th><th>เวอร์ชัน</th><th>ผู้สั่ง</th><th>ผล</th><th>รายละเอียด</th></tr></thead>
              <tbody>
                {data.history.map((job) => (
                  <tr key={job.id}>
                    <td>{formatThaiDateTime(job.startedAt ?? job.requestedAt)}</td>
                    <td>{actionLabels[job.action]}</td>
                    <td>{job.action === 'check' ? '-' : `${job.from ?? '-'} → ${job.version ?? '-'}`}</td>
                    <td>{job.requestedBy ?? '-'}</td>
                    <td><span className={stateLabels[job.state].chip}>{stateLabels[job.state].text}</span></td>
                    <td>{job.message ?? ''}{job.backup && <><br /><span className="muted">สำรองฐานข้อมูล: <code>{job.backup}</code></span></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {choice && <ConfirmChange release={choice} view={data} onSubmit={submit} onClose={() => setChoice(null)} />}
    </>
  );
}

function UpdaterProblems({ view }: { view: UpdateView }) {
  const { updater } = view;
  if (!updater.configured) {
    return <p className="notice notice-danger">ยังไม่ได้ติดตั้งตัวอัปเดตบนเซิร์ฟเวอร์ (ไม่ได้ตั้ง UPDATER_STATE_PATH) ดูวิธีติดตั้งในเอกสาร docs/operations/system-updates.md</p>;
  }
  if (!updater.writable) return <p className="notice notice-danger">แอปเขียนโฟลเดอร์ของตัวอัปเดตไม่ได้ ให้รันสคริปต์ติดตั้งตัวอัปเดตบนเซิร์ฟเวอร์อีกครั้ง</p>;
  if (!updater.reporting) {
    return <p className="notice notice-danger">ตัวอัปเดตบนเซิร์ฟเวอร์ไม่ได้รายงานสถานะเกิน 3 นาที ตรวจด้วย <code>systemctl status health-rider-updater.timer</code></p>;
  }
  if (updater.fetchError) return <p className="notice">ดึงเวอร์ชันใหม่จาก GitHub ไม่ได้: {updater.fetchError} (ยังเลือกเวอร์ชันที่เคยดึงไว้แล้วได้)</p>;
  return null;
}

// Asks for a reason and spells out what happens, including that a rollback does not undo database changes.
function ConfirmChange({ release, view, onSubmit, onClose }: {
  release: ListedRelease; view: UpdateView; onSubmit: (release: ListedRelease, reason: string) => Promise<string | null>; onClose: () => void;
}) {
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const rollback = release.relation === 'older';
  // Same rule the server applies: rolling back past a version that changed the database keeps those changes.
  const crossesSchemaChange = rollback && view.releases.some((entry) => entry.schemaChange
    && compareVersions(entry.version, release.version) > 0 && compareVersions(entry.version, view.current.version) <= 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
    setProblem((await onSubmit(release, reason)) ?? '');
    setBusy(false);
  }

  const verb = rollback ? 'ย้อนกลับ' : 'อัปเดต';
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`${verb}เป็นเวอร์ชัน ${release.version}`}>
      <div className="photo-viewer-body detail-dialog">
        <div className="photo-viewer-head">
          <strong>{verb}จาก {view.current.version} เป็นเวอร์ชัน {release.version}</strong>
          <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}><Icon name="close" /></button>
        </div>
        {problem && <p className="notice notice-danger" role="alert">{problem}</p>}
        <ul className="bullet-list">
          <li>เซิร์ฟเวอร์จะสำรองฐานข้อมูลก่อน แล้วสร้างระบบเวอร์ชัน {release.version} ใหม่ ใช้เวลาประมาณ 3-5 นาที</li>
          <li>ระหว่างนั้นผู้ใช้ทุกคนจะใช้งานไม่ได้ชั่วคราว ไรเดอร์ที่ออฟไลน์อยู่ยังบันทึกงานในเครื่องได้และจะส่งข้อมูลเมื่อระบบกลับมา</li>
          <li>ถ้าเวอร์ชันใหม่เปิดไม่ขึ้น เซิร์ฟเวอร์จะกลับไปเวอร์ชัน {view.current.version} ให้อัตโนมัติ</li>
          {rollback && <li>การย้อนกลับไม่ลบข้อมูลที่บันทึกไว้แล้ว และย้อนกลับได้ถึงเวอร์ชัน {view.rollbackFloor} เท่านั้น</li>}
        </ul>
        {crossesSchemaChange && (
          <p className="notice notice-danger">เวอร์ชันที่ถูกย้อนผ่านมีการเปลี่ยนโครงสร้างฐานข้อมูล ตารางหรือคอลัมน์ใหม่จะยังอยู่ในฐานข้อมูล ข้อมูลที่ใช้เฉพาะฟีเจอร์ใหม่จะไม่แสดงในเวอร์ชันเก่า</p>
        )}
        <form onSubmit={(event) => void submit(event)} aria-label={`ยืนยันการ${verb}`}>
          <label>
            เหตุผล (บันทึกในประวัติการตรวจสอบ)
            <textarea name="reason" rows={3} required maxLength={500} autoFocus
              placeholder={rollback ? 'เช่น เวอร์ชันใหม่พิมพ์ฉลากไม่ได้' : 'เช่น ติดตั้งฟีเจอร์พิมพ์ฉลากใหม่ตามที่ขอ'} />
          </label>
          <div className="dialog-actions">
            <button type="submit" className={rollback ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy}>{busy ? 'กำลังส่งคำสั่ง' : `ยืนยัน${verb}`}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          </div>
        </form>
      </div>
    </div>
  );
}

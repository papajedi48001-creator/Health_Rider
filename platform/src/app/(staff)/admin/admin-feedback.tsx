'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { withBasePath } from '@/lib/base-path';
import { formatThaiDateTime, roleLabels } from '@/lib/labels';
import type { UserRole } from '@/auth/roles';
import {
  feedbackKindLabels, feedbackKinds, feedbackStatusLabels, feedbackStatuses, maximumFeedbackMessage, ratingFaces, ratingTags,
  type FeedbackKind, type FeedbackStatus, type RatingTag,
} from '@/domain/feedback/feedback-rules';

type Item = {
  id: string;
  userName: string;
  role: UserRole;
  kind: FeedbackKind;
  rating: number | null;
  tags: string | null;
  message: string | null;
  pagePath: string | null;
  userAgent: string | null;
  appVersion: string | null;
  deliveryAttemptId: string | null;
  hasPhoto: boolean;
  status: FeedbackStatus;
  reply: string | null;
  repliedByName: string | null;
  repliedAt: string | null;
  createdAt: string;
};
type Stats = { new: number; inProgress: number; resolvedRecently: number; averageRating: number | null; ratingCount: number };
type Inbox = { items: Item[]; nextBefore: string | null; kindCounts: Partial<Record<FeedbackKind, number>>; stats: Stats };

const kindIcons: Record<FeedbackKind, string> = { problem: '🐞', suggestion: '💡', praise: '❤️', rating: '⭐' };
const statusTones: Record<FeedbackStatus, string> = { new: 'fb-status-new', in_progress: 'fb-status-doing', resolved: 'fb-status-done' };
const statusFilters = [
  { value: 'open', label: 'ยังไม่ปิด' },
  { value: 'new', label: feedbackStatusLabels.new },
  { value: 'in_progress', label: feedbackStatusLabels.in_progress },
  { value: 'resolved', label: feedbackStatusLabels.resolved },
  { value: 'all', label: 'ทั้งหมด' },
];

function title(item: Item): string {
  if (item.kind === 'rating') return `${ratingFaces.find((face) => face.value === item.rating)?.label ?? ''} ${ratingFaces.find((face) => face.value === item.rating)?.face ?? ''}`.trim();
  const text = item.message ?? '';
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

// A short name for the sender's device, from the browser's user agent.
function deviceName(userAgent: string): string {
  const os = /Android [\d.]+/.exec(userAgent)?.[0] ?? (/iPhone|iPad/.test(userAgent) ? 'iPhone/iPad' : /Windows/.test(userAgent) ? 'Windows' : /Mac OS X/.test(userAgent) ? 'Mac' : /Linux/.test(userAgent) ? 'Linux' : '');
  const browser = /Edg\/\d+/.exec(userAgent)?.[0].replace('Edg/', 'Edge ') ?? /Chrome\/\d+/.exec(userAgent)?.[0].replace('/', ' ') ?? /Firefox\/\d+/.exec(userAgent)?.[0].replace('/', ' ') ?? (/Safari/.test(userAgent) ? 'Safari' : '');
  return [os, browser].filter(Boolean).join(' · ') || 'ไม่ทราบอุปกรณ์';
}

function StatTile({ icon, tone, label, value }: { icon: IconName; tone: string; label: string; value: string | number }) {
  return (
    <div className={`stat ${tone}`}>
      <span className="stat-icon"><Icon name={icon} size={22} /></span>
      <span className="stat-body"><strong>{value}</strong>{label}</span>
    </div>
  );
}

export function AdminFeedback() {
  const [kind, setKind] = useState<FeedbackKind | ''>('');
  const [status, setStatus] = useState('open');
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, ...(kind ? { kind } : {}) });
    const result = await callApi<Inbox>(`/api/admin/feedback?${params}`, { cache: 'no-store' });
    if (!result.ok) return setError(result.message);
    setError('');
    setInbox(result.data);
    setSelectedId((current) => (current && result.data.items.some((item) => item.id === current) ? current : result.data.items[0]?.id ?? null));
  }, [kind, status]);

  useEffect(() => { void load(); }, [load]);

  async function loadMore() {
    if (!inbox?.nextBefore) return;
    const params = new URLSearchParams({ status, before: inbox.nextBefore, ...(kind ? { kind } : {}) });
    const result = await callApi<Inbox>(`/api/admin/feedback?${params}`, { cache: 'no-store' });
    if (result.ok) setInbox({ ...result.data, items: [...inbox.items, ...result.data.items] });
  }

  function saved(updated: Pick<Item, 'id' | 'status' | 'reply' | 'repliedAt' | 'repliedByName'>) {
    setInbox((current) => current && { ...current, items: current.items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) });
  }

  const stats = inbox?.stats;
  const total = inbox ? Object.values(inbox.kindCounts).reduce((sum, count) => sum + (count ?? 0), 0) : 0;
  const selected = inbox?.items.find((item) => item.id === selectedId) ?? null;

  return (
    <>
      {stats && (
        <div className="stat-row">
          <StatTile icon="message" tone={stats.new ? 'chip-warning' : ''} label="เรื่องใหม่" value={stats.new} />
          <StatTile icon="clock" tone="" label="กำลังดำเนินการ" value={stats.inProgress} />
          <StatTile icon="checkCircle" tone="chip-success" label="แก้ไขแล้ว 30 วันล่าสุด" value={stats.resolvedRecently} />
          <StatTile icon="star" tone="chip-warning" label={`ความพึงพอใจไรเดอร์ (${stats.ratingCount} งาน)`} value={stats.averageRating === null ? '-' : `${stats.averageRating} / 5`} />
        </div>
      )}
      {error && <p className="notice notice-danger">{error}</p>}
      <div className="fb-inbox">
        <section className="fb-list" aria-label="รายการความคิดเห็น">
          <div className="fb-filters">
            <div className="chip-row" role="group" aria-label="กรองตามประเภท">
              <button type="button" className="fb-filter" aria-pressed={kind === ''} onClick={() => setKind('')}>ทั้งหมด {total}</button>
              {feedbackKinds.map((value) => (
                <button key={value} type="button" className="fb-filter" aria-pressed={kind === value} onClick={() => setKind(value)}>
                  {kindIcons[value]} {value === 'rating' ? 'คะแนน' : feedbackKindLabels[value]} {inbox?.kindCounts[value] ?? 0}
                </button>
              ))}
            </div>
            <label className="fb-status-filter">
              สถานะ
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {statusFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
              </select>
            </label>
          </div>
          {inbox && inbox.items.length === 0 && <p className="muted fb-empty">ไม่มีความคิดเห็นในตัวกรองนี้</p>}
          <ul>
            {inbox?.items.map((item) => (
              <li key={item.id}>
                <button type="button" className="fb-row" aria-current={item.id === selectedId ? 'true' : undefined} onClick={() => setSelectedId(item.id)}>
                  <span className="fb-row-head">
                    <strong>{kindIcons[item.kind]} {title(item) || feedbackKindLabels[item.kind]}</strong>
                    <span className={`fb-status ${statusTones[item.status]}`}>{feedbackStatusLabels[item.status]}</span>
                  </span>
                  <span className="muted">{item.userName} · {roleLabels[item.role]} · {formatThaiDateTime(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {inbox?.nextBefore && <button type="button" className="btn btn-secondary btn-block" onClick={() => void loadMore()}>โหลดเพิ่ม</button>}
        </section>
        {selected ? <FeedbackDetail key={selected.id} item={selected} onSaved={saved} onReload={load} /> : (
          <section className="fb-detail fb-detail-empty"><p className="muted">เลือกเรื่องทางซ้ายเพื่ออ่านและตอบกลับ</p></section>
        )}
      </div>
    </>
  );
}

function FeedbackDetail({ item, onSaved, onReload }: { item: Item; onSaved: (item: Pick<Item, 'id' | 'status' | 'reply' | 'repliedAt' | 'repliedByName'>) => void; onReload: () => Promise<void> }) {
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [reply, setReply] = useState(item.reply ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const tags = (item.tags?.split(',') ?? []).filter((tag): tag is RatingTag => tag in ratingTags);
  const changed = status !== item.status || reply.trim() !== (item.reply ?? '');

  async function save(nextStatus: FeedbackStatus) {
    setSaving(true);
    setMessage('');
    const result = await callApi<Pick<Item, 'id' | 'status' | 'reply' | 'repliedAt' | 'repliedByName'>>(`/api/admin/feedback/${item.id}`, {
      method: 'PATCH', json: { status: nextStatus, reply },
    });
    setSaving(false);
    if (!result.ok) return setMessage(result.message);
    setStatus(result.data.status);
    onSaved(result.data);
    setMessage('บันทึกแล้ว');
    void onReload();
  }

  return (
    <section className="fb-detail" aria-label="รายละเอียดความคิดเห็น">
      <div className="fb-detail-head">
        <div>
          <h2>{kindIcons[item.kind]} {feedbackKindLabels[item.kind]}{item.kind === 'rating' ? `: ${title(item)}` : ''}</h2>
          <p className="muted">{item.userName} ({roleLabels[item.role]}) · {formatThaiDateTime(item.createdAt)}</p>
        </div>
        <label className="fb-status-filter">
          สถานะ
          <select value={status} onChange={(event) => setStatus(event.target.value as FeedbackStatus)}>
            {feedbackStatuses.map((value) => <option key={value} value={value}>{feedbackStatusLabels[value]}</option>)}
          </select>
        </label>
      </div>
      <div className="fb-detail-body">
        <div className="fb-detail-text">
          {item.message ? <p className="fb-quote">{item.message}</p> : <p className="muted">ไม่มีข้อความ</p>}
          {tags.length > 0 && <p className="chip-row">{tags.map((tag) => <span key={tag} className="chip chip-warning">{ratingTags[tag]}</span>)}</p>}
          <p className="chip-row fb-meta">
            {item.userAgent && <span className="chip">📱 {deviceName(item.userAgent)}</span>}
            {item.pagePath && <span className="chip">📍 {item.pagePath}</span>}
            {item.appVersion && <span className="chip">{/^\d+\.\d+/.test(item.appVersion) ? `v${item.appVersion}` : item.appVersion}</span>}
            {item.deliveryAttemptId && <span className="chip">งาน {item.deliveryAttemptId.slice(-6)}</span>}
          </p>
        </div>
        {item.hasPhoto && (
          <a className="fb-photo" href={withBasePath(`/api/admin/feedback/${item.id}/photo`)} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- an authenticated API image, not a static asset */}
            <img src={withBasePath(`/api/admin/feedback/${item.id}/photo`)} alt="รูปที่แนบมา" />
          </a>
        )}
      </div>
      <label>
        ตอบกลับผู้ส่ง
        <textarea rows={3} maxLength={maximumFeedbackMessage} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="ผู้ส่งจะเห็นคำตอบนี้ในแท็บ ที่เคยส่ง" />
      </label>
      {item.repliedAt && <p className="muted">ตอบล่าสุดโดย {item.repliedByName ?? '-'} · {formatThaiDateTime(item.repliedAt)}</p>}
      {message && <p className={message === 'บันทึกแล้ว' ? 'notice fb-saved' : 'notice notice-danger'}>{message}</p>}
      <div className="fb-detail-actions">
        {status !== 'resolved' && (
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void save('resolved')}><Icon name="check" size={18} /> ปิดเรื่อง (แก้ไขแล้ว)</button>
        )}
        <button type="button" className="btn btn-primary" disabled={saving || !changed} onClick={() => void save(status === 'new' && reply.trim() ? 'in_progress' : status)}>
          <Icon name="send" size={18} /> {reply.trim() && reply.trim() !== (item.reply ?? '') ? 'ส่งคำตอบ' : 'บันทึก'}
        </button>
      </div>
    </section>
  );
}

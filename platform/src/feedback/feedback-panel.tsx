'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon, type IconName } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { formatThaiDateTime } from '@/lib/labels';
import { toEvidenceJpeg } from '@/pwa/photo';
import { withoutBasePath } from '@/lib/base-path';
import {
  feedbackKindLabels, feedbackStatusLabels, maximumFeedbackMessage, ratingFaces, writtenFeedbackKinds,
  type FeedbackKind, type FeedbackStatus,
} from '@/domain/feedback/feedback-rules';

export type MyFeedback = {
  id: string;
  kind: FeedbackKind;
  message: string | null;
  rating?: number | null;
  status: FeedbackStatus;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

const kindIcons: Record<(typeof writtenFeedbackKinds)[number], IconName> = { problem: 'alert', suggestion: 'bulb', praise: 'heart' };
const statusTones: Record<FeedbackStatus, string> = { new: 'fb-status-new', in_progress: 'fb-status-doing', resolved: 'fb-status-done' };
const seenKey = 'health-rider.feedback-seen-at';

function readSeen(): number {
  try {
    return Number(window.localStorage.getItem(seenKey) ?? 0);
  } catch {
    return 0;
  }
}

export function markRepliesSeen(items: MyFeedback[]) {
  const latest = Math.max(0, ...items.map((item) => (item.repliedAt ? new Date(item.repliedAt).getTime() : 0)));
  try {
    if (latest > readSeen()) window.localStorage.setItem(seenKey, String(latest));
  } catch {
    // Private windows may refuse storage; the dot then simply shows again next time.
  }
}

export function hasUnseenReply(items: MyFeedback[]): boolean {
  const seen = readSeen();
  return items.some((item) => item.repliedAt && new Date(item.repliedAt).getTime() > seen);
}

export function useMyFeedback() {
  const [items, setItems] = useState<MyFeedback[] | null>(null);
  const reload = useCallback(async () => {
    const result = await callApi<{ items: MyFeedback[] }>('/api/feedback', { cache: 'no-store' });
    if (result.ok) setItems(result.data.items);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { items, reload };
}

// Picks a kind, takes a few words and, if the user wants, a screenshot and the page they are on.
export function FeedbackForm({ onSent }: { onSent: () => void }) {
  const [kind, setKind] = useState<(typeof writtenFeedbackKinds)[number]>('problem');
  const [message, setMessage] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function choosePhoto(file: File | undefined) {
    setError('');
    if (!file) return setPhoto(null);
    try {
      setPhoto(await toEvidenceJpeg(file));
    } catch {
      setError('อ่านรูปไม่ได้ ลองเลือกรูปอื่น');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return setError('พิมพ์ความคิดเห็นก่อนส่ง');
    setSending(true);
    setError('');
    const result = await callApi<{ id: string }>('/api/feedback', {
      json: {
        kind, message, photo,
        ...(includeContext ? { pagePath: withoutBasePath(window.location.pathname), userAgent: navigator.userAgent } : {}),
      },
    });
    setSending(false);
    if (!result.ok) return setError(result.message);
    setSent(true);
    setMessage('');
    setPhoto(null);
    onSent();
  }

  if (sent) {
    return (
      <div className="fb-thanks">
        <span className="fb-thanks-icon"><Icon name="check" size={28} /></span>
        <strong>ได้รับแล้ว ขอบคุณครับ</strong>
        <span className="muted">ผู้ดูแลระบบจะอ่านและตอบกลับในแท็บ &quot;ที่เคยส่ง&quot;</span>
        <button type="button" className="btn btn-secondary" onClick={() => setSent(false)}>ส่งเรื่องอื่นอีก</button>
      </div>
    );
  }

  return (
    <form className="fb-form" onSubmit={(event) => void submit(event)} aria-label="ส่งความคิดเห็น">
      <div className="fb-kinds" role="radiogroup" aria-label="ประเภท">
        {writtenFeedbackKinds.map((value) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value} className="fb-kind" onClick={() => setKind(value)}>
            <Icon name={kindIcons[value]} size={16} /> {feedbackKindLabels[value]}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="fb-message">รายละเอียด</label>
      <textarea
        id="fb-message"
        rows={4}
        maxLength={maximumFeedbackMessage}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={kind === 'problem' ? 'เกิดอะไรขึ้น ทำอะไรอยู่ตอนนั้น' : kind === 'suggestion' ? 'อยากให้มีหรือปรับอะไร' : 'ชอบอะไร บอกทีมได้เลย'}
      />
      <label className="fb-check">
        <input type="checkbox" checked={includeContext} onChange={(event) => setIncludeContext(event.target.checked)} />
        แนบชื่อหน้าที่เปิดอยู่และรุ่นอุปกรณ์ให้อัตโนมัติ
      </label>
      {error && <p className="notice notice-danger fb-error">{error}</p>}
      <div className="fb-actions">
        <label className="fb-attach">
          <input type="file" accept="image/*" onChange={(event) => void choosePhoto(event.target.files?.[0])} />
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local data URL the user just picked
            <img src={photo} alt="รูปที่แนบ" />
          ) : <Icon name="camera" size={18} />}
          <span>{photo ? 'เปลี่ยนรูป' : 'แนบรูปหน้าจอ'}</span>
        </label>
        {photo && <button type="button" className="link-button" onClick={() => setPhoto(null)}>เอารูปออก</button>}
        <button type="submit" className="btn btn-primary fb-send" disabled={sending}><Icon name="send" size={18} /> {sending ? 'กำลังส่ง…' : 'ส่งความคิดเห็น'}</button>
      </div>
    </form>
  );
}

export function MyFeedbackList({ items }: { items: MyFeedback[] | null }) {
  if (items === null) return <p className="muted">กำลังโหลด…</p>;
  if (items.length === 0) return <p className="muted fb-empty">ยังไม่เคยส่งความคิดเห็น</p>;
  return (
    <ul className="fb-mine">
      {items.map((item) => (
        <li key={item.id}>
          <div className="fb-mine-head">
            <strong>{item.kind === 'rating' ? `${feedbackKindLabels.rating} ${ratingFaces.find((face) => face.value === item.rating)?.face ?? ''}` : feedbackKindLabels[item.kind]}</strong>
            <span className={`fb-status ${statusTones[item.status]}`}>{feedbackStatusLabels[item.status]}</span>
          </div>
          {item.message && <p className="fb-mine-text">{item.message}</p>}
          <p className="muted">{formatThaiDateTime(item.createdAt)}</p>
          {item.reply && <p className="fb-reply"><Icon name="message" size={16} /> <span><strong>ผู้ดูแลระบบ:</strong> {item.reply}</span></p>}
        </li>
      ))}
    </ul>
  );
}

// The form and the user's earlier feedback, as two tabs.
export function FeedbackPanel({ items, reload }: { items: MyFeedback[] | null; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<'send' | 'mine'>('send');
  const unseen = items ? hasUnseenReply(items) : false;

  function show(next: 'send' | 'mine') {
    setTab(next);
    if (next === 'mine' && items) markRepliesSeen(items);
  }

  return (
    <div className="fb-panel">
      <div className="fb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'send'} onClick={() => show('send')}>ส่งความคิดเห็น</button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => show('mine')}>
          ที่เคยส่ง{items && items.length > 0 ? ` (${items.length})` : ''}{unseen && <span className="fb-dot" aria-label="มีคำตอบใหม่" />}
        </button>
      </div>
      {tab === 'send' ? <FeedbackForm onSent={() => void reload()} /> : <MyFeedbackList items={items} />}
    </div>
  );
}

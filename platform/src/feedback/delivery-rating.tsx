'use client';

import { useEffect, useState } from 'react';
import { Mascot } from '@/brand/mascot';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { maximumFeedbackMessage, ratingFaces, ratingTags, type RatingTag } from '@/domain/feedback/feedback-rules';

const skippedKey = (attemptId: string) => `health-rider.rating-skipped.${attemptId}`;

function wasSkipped(attemptId: string): boolean {
  try {
    return window.localStorage.getItem(skippedKey(attemptId)) === '1';
  } catch {
    return false;
  }
}

// After a delivery is confirmed, asks the rider once how it went: a face, a few taps on what got in the way, and an optional note.
export function DeliveryRating({ attemptId }: { attemptId: string }) {
  const [ask, setAsk] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (wasSkipped(attemptId)) return;
    void callApi<{ ask: boolean }>(`/api/rider/attempts/${attemptId}/rating`, { cache: 'no-store' }).then((result) => {
      if (result.ok) setAsk(result.data.ask);
    });
  }, [attemptId]);

  function skip() {
    try {
      window.localStorage.setItem(skippedKey(attemptId), '1');
    } catch {
      // Without storage the question comes back next time the job is opened, which does no harm.
    }
    setAsk(false);
  }

  function toggle(tag: RatingTag) {
    setTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  }

  async function send() {
    if (rating === null) return setError('เลือกหน้ายิ้มก่อนส่ง');
    setSending(true);
    setError('');
    const result = await callApi('/api/feedback', { json: { kind: 'rating', attemptId, rating, tags, message } });
    setSending(false);
    if (!result.ok && result.status !== 409) return setError(result.message);
    setDone(true);
  }

  if (done) {
    return (
      <section className="rider-card fb-rating fb-rating-done" aria-label="ขอบคุณสำหรับคะแนน">
        <Icon name="check" size={22} /> <strong>ขอบคุณครับ น้องภูไทจะนำไปปรับปรุงแอป</strong>
      </section>
    );
  }
  if (!ask) return null;

  // Ticks are asked for only when something could have gone better; a happy face just sends.
  const showTags = rating !== null && rating <= 4;

  return (
    <section className="rider-card fb-rating" aria-label="ให้คะแนนงานนี้">
      <div className="fb-rating-head">
        <Mascot width={40} variant="face" />
        <div>
          <strong>งานนี้เป็นยังไงบ้างครับ?</strong>
          <span className="muted">ช่วยให้น้องภูไทปรับปรุงแอปได้</span>
        </div>
      </div>
      <div className="fb-faces" role="radiogroup" aria-label="คะแนน">
        {ratingFaces.map((face) => (
          <button key={face.value} type="button" role="radio" aria-checked={rating === face.value} className="fb-face" onClick={() => setRating(face.value)}>
            <span aria-hidden="true">{face.face}</span>
            <small>{face.label}</small>
          </button>
        ))}
      </div>
      {showTags && (
        <>
          <p className="fb-rating-ask">ติดตรงไหนบ้าง? <span className="muted">(เลือกได้หลายข้อ)</span></p>
          <div className="fb-tags">
            {(Object.keys(ratingTags) as RatingTag[]).filter((tag) => tag !== 'smooth').map((tag) => (
              <button key={tag} type="button" aria-pressed={tags.includes(tag)} className="fb-tag" onClick={() => toggle(tag)}>{ratingTags[tag]}</button>
            ))}
          </div>
        </>
      )}
      {rating !== null && (
        <textarea
          aria-label="เพิ่มเติม"
          rows={2}
          maxLength={maximumFeedbackMessage}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="พิมพ์เพิ่มเติม (ไม่บังคับ)"
        />
      )}
      {error && <p className="notice notice-danger">{error}</p>}
      <button type="button" className="btn btn-primary btn-block" disabled={sending || rating === null} onClick={() => void send()}>{sending ? 'กำลังส่ง…' : 'ส่ง'}</button>
      <button type="button" className="link-button fb-skip" onClick={skip}>ข้ามไปก่อน</button>
    </section>
  );
}

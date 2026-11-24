'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/brand/icons';
import { Mascot } from '@/brand/mascot';
import { FeedbackPanel, hasUnseenReply, useMyFeedback } from '@/feedback/feedback-panel';
import { riderQuickTopics } from '@/domain/feedback/feedback-rules';

// The orange button in the corner of every page. On staff pages it opens a small card above itself; in the rider app,
// a round button above the tab bar opens a sheet from the bottom of the screen with one-tap common troubles.
export function FeedbackButton({ rider = false }: { rider?: boolean }) {
  const [open, setOpen] = useState(false);
  const { items, reload } = useMyFeedback();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unseen = items ? hasUnseenReply(items) : false;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {open && rider && <div className="fb-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
      {open && (
        <div className={rider ? 'fb-popover fb-sheet' : 'fb-popover'} role="dialog" aria-label="ความคิดเห็น">
          {rider && <span className="fb-grab" aria-hidden="true" />}
          <div className="fb-popover-head">
            <Mascot width={44} variant="face" />
            <div>
              <strong>บอกน้องภูไทหน่อยครับ</strong>
              <span>{rider ? 'เรื่องอะไรก็ได้ ไม่ต้องเกี่ยวกับงานไหน' : 'แจ้งปัญหา เสนอแนะ หรือชมทีมงาน'}</span>
            </div>
            <button type="button" className="fb-close" aria-label="ปิด" onClick={() => setOpen(false)}><Icon name="close" size={20} /></button>
          </div>
          <FeedbackPanel items={items} reload={reload} quickTopics={rider ? riderQuickTopics : undefined} />
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={rider ? 'fb-fab fb-fab-rider' : 'fb-fab'}
        aria-expanded={open}
        aria-label="ความคิดเห็น"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void reload();
        }}
      >
        <Icon name={open ? 'close' : 'message'} size={22} />
        <span className="fb-fab-label">ความคิดเห็น</span>
        {unseen && !open && <span className="fb-dot" aria-label="มีคำตอบใหม่" />}
      </button>
    </>
  );
}

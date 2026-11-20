'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/brand/icons';
import { Mascot } from '@/brand/mascot';
import { FeedbackPanel, hasUnseenReply, useMyFeedback } from '@/feedback/feedback-panel';

// The orange button in the corner of every staff page; it opens a small feedback card above itself.
export function FeedbackButton() {
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
      {open && (
        <div className="fb-popover" role="dialog" aria-label="ความคิดเห็น">
          <div className="fb-popover-head">
            <Mascot width={44} variant="face" />
            <div>
              <strong>บอกน้องภูไทหน่อยครับ</strong>
              <span>แจ้งปัญหา เสนอแนะ หรือชมทีมงาน</span>
            </div>
            <button type="button" className="fb-close" aria-label="ปิด" onClick={() => setOpen(false)}><Icon name="close" size={20} /></button>
          </div>
          <FeedbackPanel items={items} reload={reload} />
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className="fb-fab"
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

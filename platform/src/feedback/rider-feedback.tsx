'use client';

import { FeedbackPanel, useMyFeedback } from '@/feedback/feedback-panel';

// On the rider's profile: send the team a note at any time, and read their answers.
export function RiderFeedback() {
  const { items, reload } = useMyFeedback();
  return (
    <section className="rider-card fb-rider" aria-label="ความคิดเห็น">
      <h2>ส่งความคิดเห็นถึงทีมงาน</h2>
      <FeedbackPanel items={items} reload={reload} />
    </section>
  );
}

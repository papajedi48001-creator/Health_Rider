import { DomainError } from '@/domain/errors';

export const feedbackKinds = ['problem', 'suggestion', 'praise', 'rating'] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];
// The kinds a user picks on the feedback button; ratings come only from a finished delivery.
export const writtenFeedbackKinds = ['problem', 'suggestion', 'praise'] as const satisfies readonly FeedbackKind[];

export const feedbackStatuses = ['new', 'in_progress', 'resolved'] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export const feedbackKindLabels: Record<FeedbackKind, string> = {
  problem: 'แจ้งปัญหา',
  suggestion: 'เสนอแนะ',
  praise: 'ชมเชย',
  rating: 'คะแนนหลังส่งงาน',
};

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  new: 'ใหม่',
  in_progress: 'กำลังดำเนินการ',
  resolved: 'แก้ไขแล้ว',
};

export const ratingFaces = [
  { value: 1, face: '😫', label: 'แย่มาก' },
  { value: 2, face: '🙁', label: 'ไม่ดี' },
  { value: 3, face: '😐', label: 'พอใช้' },
  { value: 4, face: '🙂', label: 'ดี' },
  { value: 5, face: '😍', label: 'ดีมาก' },
] as const;

// What may have got in the rider's way on a delivery, picked with one tap each.
export const ratingTags = {
  hard_to_find: '📍 หาบ้านยาก',
  no_answer: '📞 โทรไม่ติด',
  slow_photo: '📷 ถ่ายรูปช้า',
  weak_signal: '📶 สัญญาณหลุด',
  hard_scan: '🔍 สแกน QR ยาก',
  smooth: '👍 ราบรื่นดี',
} as const;
export type RatingTag = keyof typeof ratingTags;

export const maximumFeedbackMessage = 2000;

export type FeedbackInput = {
  kind: FeedbackKind;
  message: string | null;
  rating: number | null;
  tags: RatingTag[];
  pagePath: string | null;
  userAgent: string | null;
  attemptId: string | null;
  photo: string | null;
};

const text = (value: unknown, limit: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
};

// Checks what the browser sent. A written note needs a message; a delivery rating needs a face and the delivery.
export function parseFeedbackInput(body: unknown): FeedbackInput {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const kind = input.kind as FeedbackKind;
  if (!feedbackKinds.includes(kind)) throw new DomainError('เลือกประเภทความคิดเห็นก่อนส่ง');
  if (typeof input.message === 'string' && input.message.trim().length > maximumFeedbackMessage) {
    throw new DomainError(`ข้อความยาวได้ไม่เกิน ${maximumFeedbackMessage} ตัวอักษร`);
  }
  const message = text(input.message, maximumFeedbackMessage);
  const pagePath = text(input.pagePath, 255);
  const userAgent = text(input.userAgent, 300);
  const photo = typeof input.photo === 'string' && input.photo ? input.photo : null;

  if (kind === 'rating') {
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new DomainError('เลือกหน้ายิ้มก่อนส่ง');
    const attemptId = typeof input.attemptId === 'string' && /^[0-9A-Za-z]{26}$/.test(input.attemptId) ? input.attemptId : null;
    if (!attemptId) throw new DomainError('ไม่พบงานจัดส่งที่ให้คะแนน');
    const tags = Array.isArray(input.tags) ? [...new Set(input.tags.filter((tag): tag is RatingTag => typeof tag === 'string' && tag in ratingTags))] : [];
    return { kind, message, rating, tags, pagePath, userAgent, attemptId, photo: null };
  }

  if (!message) throw new DomainError('พิมพ์ความคิดเห็นก่อนส่ง');
  return { kind, message, rating: null, tags: [], pagePath, userAgent, attemptId: null, photo };
}

// A rating with nothing to act on (no ticks and no words) is filed as already handled, so the inbox shows only what needs a look.
export function initialStatus(input: Pick<FeedbackInput, 'kind' | 'message' | 'tags'>): FeedbackStatus {
  if (input.kind !== 'rating') return 'new';
  const actionable = input.message !== null || input.tags.some((tag) => tag !== 'smooth');
  return actionable ? 'new' : 'resolved';
}

export function parseFeedbackUpdate(body: unknown): { status?: FeedbackStatus; reply?: string | null } {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const update: { status?: FeedbackStatus; reply?: string | null } = {};
  if (input.status !== undefined) {
    if (!feedbackStatuses.includes(input.status as FeedbackStatus)) throw new DomainError('สถานะไม่ถูกต้อง');
    update.status = input.status as FeedbackStatus;
  }
  if (input.reply !== undefined) {
    if (typeof input.reply === 'string' && input.reply.trim().length > maximumFeedbackMessage) {
      throw new DomainError(`คำตอบยาวได้ไม่เกิน ${maximumFeedbackMessage} ตัวอักษร`);
    }
    update.reply = text(input.reply, maximumFeedbackMessage);
  }
  if (update.status === undefined && update.reply === undefined) throw new DomainError('ไม่มีสิ่งที่ต้องบันทึก');
  return update;
}

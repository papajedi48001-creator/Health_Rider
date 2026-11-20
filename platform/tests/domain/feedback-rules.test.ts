import { expect, test } from 'vitest';
import { initialStatus, parseFeedbackInput, parseFeedbackUpdate } from '@/domain/feedback/feedback-rules';

const attemptId = '01JTESTATTEMPT0000000000AA';

test('a written note needs a kind and some words; extra fields are trimmed', () => {
  expect(() => parseFeedbackInput({ kind: 'problem', message: '   ' })).toThrow('พิมพ์ความคิดเห็นก่อนส่ง');
  expect(() => parseFeedbackInput({ kind: 'complaint', message: 'x' })).toThrow('เลือกประเภท');
  expect(() => parseFeedbackInput({ kind: 'problem', message: 'x'.repeat(2001) })).toThrow('2000');
  const input = parseFeedbackInput({ kind: 'suggestion', message: ' ค้นหาด้วย HN ได้ไหม ', pagePath: '/dashboard', rating: 5, attemptId });
  expect(input).toMatchObject({ kind: 'suggestion', message: 'ค้นหาด้วย HN ได้ไหม', pagePath: '/dashboard', rating: null, attemptId: null, tags: [] });
});

test('a rating needs a face from 1 to 5 and the delivery; unknown ticks are dropped', () => {
  expect(() => parseFeedbackInput({ kind: 'rating', attemptId })).toThrow('เลือกหน้ายิ้ม');
  expect(() => parseFeedbackInput({ kind: 'rating', rating: 6, attemptId })).toThrow('เลือกหน้ายิ้ม');
  expect(() => parseFeedbackInput({ kind: 'rating', rating: 3 })).toThrow('ไม่พบงาน');
  const input = parseFeedbackInput({ kind: 'rating', rating: 3, attemptId, tags: ['hard_to_find', 'nonsense', 'hard_to_find'], photo: 'abc' });
  expect(input).toMatchObject({ rating: 3, attemptId, tags: ['hard_to_find'], message: null, photo: null });
});

test('only ratings with nothing to act on start as already handled', () => {
  expect(initialStatus({ kind: 'praise', message: 'ดีมาก', tags: [] })).toBe('new');
  expect(initialStatus({ kind: 'rating', message: null, tags: [] })).toBe('resolved');
  expect(initialStatus({ kind: 'rating', message: null, tags: ['smooth'] })).toBe('resolved');
  expect(initialStatus({ kind: 'rating', message: null, tags: ['no_answer'] })).toBe('new');
  expect(initialStatus({ kind: 'rating', message: 'โทรไม่ติดสามรอบ', tags: [] })).toBe('new');
});

test('an admin update changes the status, the reply or both', () => {
  expect(parseFeedbackUpdate({ status: 'resolved' })).toEqual({ status: 'resolved' });
  expect(parseFeedbackUpdate({ reply: '  ขอบคุณครับ ' })).toEqual({ reply: 'ขอบคุณครับ' });
  expect(parseFeedbackUpdate({ reply: '' })).toEqual({ reply: null });
  expect(() => parseFeedbackUpdate({ status: 'closed' })).toThrow('สถานะ');
  expect(() => parseFeedbackUpdate({})).toThrow('ไม่มีสิ่งที่ต้องบันทึก');
});

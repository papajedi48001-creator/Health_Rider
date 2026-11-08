import { expect, test } from 'vitest';
import { userRoles } from '@/auth/roles';
import { parseApproval, parseRegistration } from '@/domain/admin/registration-rules';

const application = { username: 'New.Rider', displayName: 'สมชาย ใจดี', phone: '081-234-5678', healthCenter: 'รพ.สต.หนองท่ม', role: 'rider', password: 'long-enough-password' };

test('accepts an application for a working role with a phone to call back', () => {
  expect(parseRegistration(application)).toEqual({ username: 'new.rider', displayName: 'สมชาย ใจดี', phone: '0812345678', healthCenter: 'รพ.สต.หนองท่ม', role: 'rider', password: 'long-enough-password' });
  expect(() => parseRegistration({ ...application, phone: '' })).toThrow('เบอร์โทร');
  expect(() => parseRegistration({ ...application, healthCenter: '' })).toThrow('ต้องเลือก รพ.สต.');
  expect(() => parseRegistration({ ...application, password: 'short' })).toThrow('อย่างน้อย 12');
});

test('never lets an applicant ask for admin or auditor', () => {
  expect(() => parseRegistration({ ...application, role: 'admin' })).toThrow('หน้าที่');
  expect(() => parseRegistration({ ...application, role: 'auditor' })).toThrow('หน้าที่');
});

test('approving a rider needs a category, and an empty rider code is generated later', () => {
  expect(parseApproval({ decision: 'reject' }, userRoles)).toEqual({ decision: 'reject' });
  const healthCenter = 'รพ.สต.คำบิด';
  expect(parseApproval({ decision: 'approve', role: 'pharmacy', healthCenter }, userRoles)).toEqual({ decision: 'approve', role: 'pharmacy', healthCenter });
  expect(() => parseApproval({ decision: 'approve', role: 'pharmacy' }, userRoles)).toThrow('ต้องเลือก รพ.สต.');
  expect(() => parseApproval({ decision: 'approve', role: 'rider', healthCenter }, userRoles)).toThrow('ประเภทไรเดอร์');
  expect(parseApproval({ decision: 'approve', role: 'rider', healthCenter, riderCode: '', employmentCategory: 'internal' }, userRoles))
    .toEqual({ decision: 'approve', role: 'rider', healthCenter, rider: { employmentCategory: 'internal' } });
  expect(parseApproval({ decision: 'approve', role: 'rider', healthCenter, riderCode: ' R-12 ', employmentCategory: 'external' }, userRoles))
    .toEqual({ decision: 'approve', role: 'rider', healthCenter, rider: { employmentCategory: 'external' } });
  expect(() => parseApproval({ decision: 'maybe' }, userRoles)).toThrow();
});

'use client';

import { useState, type FormEvent } from 'react';
import { HealthCenterSelect } from '@/account/health-center-select';
import { registrableRoles } from '@/domain/admin/registration-rules';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { callApi } from '@/lib/api-client';
import { roleLabels } from '@/lib/labels';

export function RegisterForm() {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirmPassword')) return setMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    form.delete('confirmPassword');
    setSubmitting(true);
    setMessage('');
    const result = await callApi('/api/auth/register', { json: Object.fromEntries(form) });
    setSubmitting(false);
    if (!result.ok) return setMessage(result.message);
    setDone(true);
  }

  if (done) {
    return (
      <div className="register-done" role="status">
        <strong>สมัครเสร็จแล้ว รอผู้ดูแลระบบอนุมัติ</strong>
        <p>เมื่อได้รับอนุมัติ เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ตั้งไว้ได้เลย</p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-label="สมัครเข้าใช้งาน">
      <p aria-live="polite">{message}</p>
      <label>ชื่อ-นามสกุล <input name="displayName" required maxLength={255} autoComplete="name" /></label>
      <label>เบอร์โทร <input name="phone" type="tel" required inputMode="tel" pattern="0[0-9\s\-]{8,12}" autoComplete="tel" /></label>
      <label>
        หน้าที่ที่ต้องการใช้งาน
        <select name="role" required defaultValue="">
          <option value="" disabled>เลือกหน้าที่</option>
          {registrableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </select>
      </label>
      <HealthCenterSelect />
      <label>ชื่อผู้ใช้ (a-z, 0-9, จุด, ขีด) <input name="username" required pattern="[a-zA-Z0-9._\-]{3,100}" autoComplete="username" autoCapitalize="none" /></label>
      <label>รหัสผ่าน <input name="password" type="password" required minLength={minimumPasswordLength} maxLength={200} autoComplete="new-password" /></label>
      <label>ยืนยันรหัสผ่าน <input name="confirmPassword" type="password" required minLength={minimumPasswordLength} autoComplete="new-password" /></label>
      <button type="submit" disabled={submitting}>{submitting ? 'กำลังส่งคำขอ' : 'สมัครเข้าใช้งาน'}</button>
    </form>
  );
}

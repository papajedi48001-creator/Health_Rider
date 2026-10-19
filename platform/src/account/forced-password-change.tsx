'use client';

import { useState, type FormEvent } from 'react';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { callApi } from '@/lib/api-client';

// Stands in for every page until someone whose password an admin set chooses their own.
export function ForcedPasswordChange() {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('newPassword') !== form.get('confirmPassword')) return setMessage('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    setSaving(true);
    const result = await callApi('/api/me/password', { json: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') } });
    setSaving(false);
    if (!result.ok) return setMessage(result.message);
    window.location.reload();
  }

  return (
    <main className="account">
      <form className="rider-card" aria-label="ตั้งรหัสผ่านใหม่" onSubmit={(event) => void submit(event)}>
        <h1>ตั้งรหัสผ่านใหม่ก่อนใช้งาน</h1>
        <p className="notice notice-danger" role="alert">ผู้ดูแลระบบตั้งรหัสผ่านให้บัญชีนี้ โปรดตั้งรหัสผ่านใหม่ของท่านเองก่อนใช้งานต่อ</p>
        <label>
          รหัสผ่านที่ได้รับจากผู้ดูแลระบบ
          <input name="currentPassword" type="password" required autoComplete="current-password" autoFocus />
        </label>
        <label>
          รหัสผ่านใหม่ (อย่างน้อย {minimumPasswordLength} ตัวอักษร)
          <input name="newPassword" type="password" required minLength={minimumPasswordLength} autoComplete="new-password" />
        </label>
        <label>
          ยืนยันรหัสผ่านใหม่
          <input name="confirmPassword" type="password" required minLength={minimumPasswordLength} autoComplete="new-password" />
        </label>
        {message && <p className="notice" aria-live="polite">{message}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>{saving ? 'กำลังบันทึก' : 'ตั้งรหัสผ่านใหม่'}</button>
      </form>
    </main>
  );
}

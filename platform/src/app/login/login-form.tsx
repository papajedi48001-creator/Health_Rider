'use client';

import { useState, type FormEvent } from 'react';
import { withBasePath } from '@/lib/base-path';

export function LoginForm({ next, initialMessage }: { next: string | null; initialMessage: string }) {
  const [message, setMessage] = useState(initialMessage);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(withBasePath('/api/auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const body = (await response.json()) as { message?: string; redirectTo?: string };
      if (!response.ok || !body.redirectTo) {
        setMessage(body.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      window.location.assign(withBasePath(next ?? body.redirectTo));
    } catch {
      setMessage('เชื่อมต่อระบบไม่ได้ โปรดตรวจสอบสัญญาณแล้วลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form method="post" action={withBasePath('/api/auth/login')} onSubmit={(event) => void submit(event)}>
      {next && <input type="hidden" name="next" value={next} />}
      <p aria-live="polite">{message}</p>
      <label>
        ชื่อผู้ใช้
        <input name="username" autoComplete="username" required />
      </label>
      <label>
        รหัสผ่าน
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button type="submit" disabled={submitting}>{submitting ? 'กำลังเข้าสู่ระบบ' : 'เข้าสู่ระบบ'}</button>
    </form>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { withBasePath } from '@/lib/base-path';

type Props = { installationId: string | null; message: string | null; contact: string };

// Sits over the faded login page until a token key for this installation is entered.
export function LicenseLock({ installationId, message, contact }: Props) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    if (!installationId) return;
    try {
      await navigator.clipboard.writeText(installationId);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/license'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const body = (await response.json()) as { message?: string; locked?: boolean };
      if (!response.ok) return setError(body.message ?? 'เปิดใช้งานไม่สำเร็จ');
      if (body.locked) return setError(body.message ?? 'ระบบยังล็อกอยู่');
      window.location.reload();
    } catch {
      setError('เชื่อมต่อระบบไม่ได้ โปรดลองใหม่');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="license-lock" role="dialog" aria-modal="true" aria-labelledby="license-lock-title">
      <form className="license-lock-card" onSubmit={activate}>
        <h1 id="license-lock-title">เปิดใช้งานระบบ</h1>
        {message && <p className="notice notice-danger">{message}</p>}
        {installationId && (
          <div className="license-installation">
            <span>รหัสเครื่อง (ส่งให้ผู้พัฒนาเพื่อขอ token key)</span>
            <div><code>{installationId}</code><button type="button" className="secondary" onClick={copy}>{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button></div>
          </div>
        )}
        <label>
          Token key
          <textarea name="token" rows={4} value={token} onChange={(event) => setToken(event.target.value)} placeholder="HR1...." required spellCheck={false} autoComplete="off" />
        </label>
        {error && <p className="notice notice-danger" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !token.trim()}>{busy ? 'กำลังตรวจสอบ' : 'เปิดใช้งาน'}</button>
        <p className="license-contact">{contact}</p>
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { UserRole } from '@/auth/roles';
import { callApi } from '@/lib/api-client';
import { withBasePath } from '@/lib/base-path';
import { roleLabels } from '@/lib/labels';

const roleHints: Record<UserRole, string> = {
  pharmacy: 'ยืนยันรายการจาก HOSxP เตรียมพัสดุ รับยาคืน',
  coordinator: 'ติดตามการจัดส่งและงานที่ต้องตรวจสอบ',
  rider: 'สแกนรับงานและบันทึกการส่งยา',
  admin: 'จัดการบัญชีผู้ใช้และตั้งค่าระบบ',
  auditor: 'ดูประวัติการตรวจสอบ',
};

export function RoleChoice({ roles, current, next }: { roles: UserRole[]; current: UserRole | null; next: string | null }) {
  const [busy, setBusy] = useState<UserRole | null>(null);
  const [message, setMessage] = useState('');

  async function choose(role: UserRole) {
    setBusy(role);
    setMessage('');
    const result = await callApi<{ home: string }>('/api/me/role', { json: { role } });
    if (!result.ok) {
      setBusy(null);
      return setMessage(result.message);
    }
    // A full load, so every frame and menu is drawn again for the new role.
    window.location.assign(withBasePath(next ?? result.data.home));
  }

  return (
    <div className="role-choice" role="group" aria-label="บทบาทที่ใช้งานได้">
      <p aria-live="polite">{message}</p>
      {roles.map((role) => (
        <button key={role} type="button" className={role === current ? 'role-option current' : 'role-option'} disabled={busy !== null} onClick={() => void choose(role)}>
          <strong>{roleLabels[role]}{role === current ? ' (ใช้งานอยู่)' : ''}</strong>
          <small>{busy === role ? 'กำลังเข้าสู่ระบบ' : roleHints[role]}</small>
        </button>
      ))}
    </div>
  );
}

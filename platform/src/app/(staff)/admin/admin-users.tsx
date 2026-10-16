'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { userRoles, type UserRole } from '@/auth/roles';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { callApi } from '@/lib/api-client';
import { roleLabels } from '@/lib/labels';
import { PersonName } from '@/account/person-name';

type User = {
  id: string; username: string; displayName: string; avatarUpdatedAt: string | null; phone: string | null; role: UserRole; active: boolean; pendingApproval: boolean; createdAt: string;
  riderProfile: { riderCode: string; employmentCategory: string } | null;
};


export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<UserRole>('rider');
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const result = await callApi<{ users: User[] }>('/api/admin/users');
    if (result.ok) setUsers(result.data.users);
    else setMessage(result.message);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const result = await callApi('/api/admin/users', { json: Object.fromEntries(new FormData(formElement)) });
    if (!result.ok) return setMessage(result.message);
    formElement.reset();
    await load();
    setMessage('สร้างบัญชีแล้ว');
  }

  async function update(user: User, changes: Record<string, unknown>, done: string) {
    const result = await callApi(`/api/admin/users/${user.id}`, { method: 'PATCH', json: changes });
    if (!result.ok) return setMessage(result.message);
    await load();
    setMessage(done);
  }

  async function decide(user: User, json: Record<string, unknown>, done: string) {
    const result = await callApi(`/api/admin/users/${user.id}/approval`, { json });
    if (!result.ok) return setMessage(result.message);
    await load();
    setMessage(done);
  }

  function reject(user: User) {
    if (window.confirm(`ไม่อนุมัติคำขอของ ${user.displayName}?`)) {
      void decide(user, { decision: 'reject' }, `ไม่อนุมัติ ${user.displayName} แล้ว`);
    }
  }

  const pending = users.filter((user) => user.pendingApproval);
  const accounts = users.filter((user) => !user.pendingApproval);
  const inactiveCount = accounts.filter((user) => !user.active).length;
  const shownAccounts = showInactive ? accounts : accounts.filter((user) => user.active);

  function resetPassword(user: User) {
    const password = window.prompt(`รหัสผ่านใหม่ของ ${user.displayName} (อย่างน้อย ${minimumPasswordLength} ตัวอักษร)`);
    if (password) void update(user, { password }, `ตั้งรหัสผ่านใหม่ให้ ${user.displayName} แล้ว และออกจากระบบทุกเครื่อง`);
  }

  return (
    <section aria-labelledby="admin-users">
      <h2 id="admin-users">บัญชีผู้ใช้</h2>
      <p aria-live="polite">{message}</p>
      {pending.length > 0 && (
        <section aria-labelledby="pending-registrations">
          <h3 id="pending-registrations">คำขอสมัครรออนุมัติ ({pending.length})</h3>
          <p>ตรวจสอบตัวตนทางโทรศัพท์ก่อนอนุมัติ เลือกบทบาทที่จะให้ใช้งานได้ ไรเดอร์ต้องกำหนดรหัสไรเดอร์และประเภท</p>
          {pending.map((user) => <PendingRegistration key={user.id} user={user} onApprove={(json) => void decide(user, { decision: 'approve', ...json }, `อนุมัติ ${user.displayName} แล้ว`)} onReject={() => reject(user)} />)}
        </section>
      )}
      <form onSubmit={(event) => void create(event)} aria-label="สร้างบัญชี">
        <label>ชื่อผู้ใช้ <input name="username" required pattern="[a-z0-9._\-]{3,100}" /></label>
        <label>ชื่อที่แสดง <input name="displayName" required /></label>
        <label>
          บทบาท
          <select name="role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            {userRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
          </select>
        </label>
        {role === 'rider' && (
          <>
            <label>รหัสไรเดอร์ <input name="riderCode" required /></label>
            <label>
              ประเภทไรเดอร์
              <select name="employmentCategory" defaultValue="internal">
                <option value="internal">เจ้าหน้าที่โรงพยาบาล</option>
                <option value="external">ผู้รับจ้างภายนอก</option>
              </select>
            </label>
          </>
        )}
        <label>รหัสผ่านเริ่มต้น <input name="password" type="password" required minLength={minimumPasswordLength} autoComplete="new-password" /></label>
        <button type="submit">สร้างบัญชี</button>
      </form>
      <label className="switch-toggle">
        <input type="checkbox" role="switch" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
        แสดงบัญชีที่ปิดใช้งาน ({inactiveCount})
      </label>
      <table>
        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>ไรเดอร์</th><th>สถานะ</th><th /></tr></thead>
        <tbody>
          {shownAccounts.map((user) => (
            <tr key={user.id}>
              <td><PersonName person={user} /></td>
              <td>{roleLabels[user.role]}</td>
              <td>{user.riderProfile ? `${user.riderProfile.riderCode} (${user.riderProfile.employmentCategory === 'external' ? 'ภายนอก' : 'ภายใน'})` : '-'}</td>
              <td>{user.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
              <td>
                <button type="button" onClick={() => void update(user, { active: !user.active }, user.active ? `ปิดบัญชี ${user.displayName} แล้ว` : `เปิดบัญชี ${user.displayName} แล้ว`)}>
                  {user.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </button>
                <button type="button" onClick={() => resetPassword(user)}>ตั้งรหัสผ่านใหม่</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PendingRegistration({ user, onApprove, onReject }: { user: User; onApprove: (json: Record<string, unknown>) => void; onReject: () => void }) {
  const [role, setRole] = useState<UserRole>(user.role);

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApprove(Object.fromEntries(new FormData(event.currentTarget)));
  }

  return (
    <form onSubmit={approve} aria-label={`คำขอของ ${user.displayName}`}>
      <p>
        <strong><PersonName person={user} /></strong> โทร {user.phone ?? '-'} · ขอใช้งานเป็น {roleLabels[user.role]}
        {' '}· สมัครเมื่อ {new Date(user.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
      </p>
      <label>
        บทบาทที่อนุมัติ
        <select name="role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
          {userRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
        </select>
      </label>
      {role === 'rider' && (
        <>
          <label>รหัสไรเดอร์ <input name="riderCode" required /></label>
          <label>
            ประเภทไรเดอร์
            <select name="employmentCategory" defaultValue="internal">
              <option value="internal">เจ้าหน้าที่โรงพยาบาล</option>
              <option value="external">ผู้รับจ้างภายนอก</option>
            </select>
          </label>
        </>
      )}
      <button type="submit">อนุมัติ</button>
      <button type="button" onClick={onReject}>ไม่อนุมัติ</button>
    </form>
  );
}

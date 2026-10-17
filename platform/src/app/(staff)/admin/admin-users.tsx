'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { userRoles, type UserRole } from '@/auth/roles';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { callApi } from '@/lib/api-client';
import { roleLabels } from '@/lib/labels';
import { PersonName } from '@/account/person-name';
import { Icon } from '@/brand/icons';

type User = {
  id: string; username: string; displayName: string; avatarUpdatedAt: string | null; phone: string | null; role: UserRole; active: boolean; pendingApproval: boolean; createdAt: string;
  riderProfile: { riderCode: string; employmentCategory: string } | null;
};


export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<UserRole>('rider');
  const [showInactive, setShowInactive] = useState(false);
  const [reviewing, setReviewing] = useState<User | null>(null);
  // Bumped after every reload so suggested rider codes skip codes that were just taken.
  const [usersVersion, setUsersVersion] = useState(0);

  const load = useCallback(async () => {
    const result = await callApi<{ users: User[] }>('/api/admin/users');
    if (result.ok) {
      setUsers(result.data.users);
      setUsersVersion((version) => version + 1);
    } else setMessage(result.message);
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
    setReviewing(null);
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
          <ul className="pending-list">
            {pending.map((user) => (
              <li key={user.id}>
                <span className="pending-who">
                  <strong><PersonName person={user} /></strong>
                  <span className="muted">ขอใช้งานเป็น {roleLabels[user.role]} · โทร {user.phone ?? '-'} · สมัครเมื่อ {formatApplied(user.createdAt)}</span>
                </span>
                <button type="button" onClick={() => setReviewing(user)}>พิจารณา</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {reviewing && (
        <PendingRegistration
          user={reviewing} refreshKey={usersVersion} onClose={() => setReviewing(null)}
          onApprove={(json) => void decide(reviewing, { decision: 'approve', ...json }, `อนุมัติ ${reviewing.displayName} แล้ว`)}
          onReject={() => reject(reviewing)}
        />
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
        {role === 'rider' && <RiderFields key={usersVersion} refreshKey={usersVersion} />}
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

function formatApplied(createdAt: string) {
  return new Date(createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
}

// A pop-up where the admin checks one application and approves it with a role, or rejects it.
function PendingRegistration({ user, refreshKey, onApprove, onReject, onClose }: {
  user: User; refreshKey: number; onApprove: (json: Record<string, unknown>) => void; onReject: () => void; onClose: () => void;
}) {
  const [role, setRole] = useState<UserRole>(user.role);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApprove(Object.fromEntries(new FormData(event.currentTarget)));
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`คำขอของ ${user.displayName}`} onClick={onClose}>
      <div className="photo-viewer-body detail-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="photo-viewer-head">
          <strong>พิจารณาคำขอสมัคร</strong>
          <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}><Icon name="close" /></button>
        </div>
        <dl className="detail-list">
          <dt>ชื่อ</dt><dd><PersonName person={user} /></dd>
          <dt>โทร</dt><dd>{user.phone ?? '-'}</dd>
          <dt>ขอใช้งานเป็น</dt><dd>{roleLabels[user.role]}</dd>
          <dt>สมัครเมื่อ</dt><dd>{formatApplied(user.createdAt)}</dd>
        </dl>
        <p className="muted">ตรวจสอบตัวตนทางโทรศัพท์ก่อนอนุมัติ</p>
        <form onSubmit={approve} aria-label={`อนุมัติ ${user.displayName}`}>
          <label>
            บทบาทที่อนุมัติ
            <select name="role" value={role} onChange={(event) => setRole(event.target.value as UserRole)} autoFocus>
              {userRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
            </select>
          </label>
          {role === 'rider' && <RiderFields refreshKey={refreshKey} />}
          <div className="dialog-actions">
            <button type="submit">อนุมัติ</button>
            <button type="button" className="secondary" onClick={onReject}>ไม่อนุมัติ</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Shows the code the server will give for the chosen category; it cannot be edited.
function RiderFields({ refreshKey }: { refreshKey: number }) {
  const [category, setCategory] = useState<'internal' | 'external'>('internal');
  const [riderCode, setRiderCode] = useState('');

  useEffect(() => {
    let current = true;
    void callApi<{ riderCode: string }>(`/api/admin/users/next-rider-code?category=${category}`).then((result) => {
      if (current && result.ok) setRiderCode(result.data.riderCode);
    });
    return () => { current = false; };
  }, [category, refreshKey]);

  return (
    <>
      <label>
        รหัสไรเดอร์
        <input value={riderCode} readOnly aria-readonly="true" className="readonly-field" title="ระบบออกรหัสให้อัตโนมัติ" />
      </label>
      <label>
        ประเภทไรเดอร์
        <select name="employmentCategory" value={category} onChange={(event) => setCategory(event.target.value as 'internal' | 'external')}>
          <option value="internal">เจ้าหน้าที่โรงพยาบาล</option>
          <option value="external">ผู้รับจ้างภายนอก</option>
        </select>
      </label>
    </>
  );
}

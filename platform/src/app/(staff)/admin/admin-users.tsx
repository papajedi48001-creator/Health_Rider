'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { userRoles, type UserRole } from '@/auth/roles';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { callApi } from '@/lib/api-client';
import { roleLabels } from '@/lib/labels';
import { PersonName } from '@/account/person-name';
import { Icon } from '@/brand/icons';

type User = {
  id: string; username: string; displayName: string; avatarUpdatedAt: string | null; phone: string | null; healthCenter: string | null; role: UserRole; active: boolean; pendingApproval: boolean; createdAt: string;
  riderProfile: { riderCode: string; employmentCategory: string } | null;
};


export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [reviewing, setReviewing] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  // Bumped after every reload so suggested rider codes skip codes that were just taken. It only refetches the
  // code: remounting the rider fields would throw away a category the admin picked while the list was loading.
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

  // Returns the reason when the account could not be created, so the pop-up stays open to fix it.
  async function create(json: Record<string, unknown>): Promise<string | null> {
    const result = await callApi('/api/admin/users', { json });
    if (!result.ok) return result.message;
    setCreating(false);
    await load();
    setMessage(`สร้างบัญชี ${String(json.displayName)} แล้ว`);
    return null;
  }

  async function update(user: User, changes: Record<string, unknown>, done: string) {
    const result = await callApi(`/api/admin/users/${user.id}`, { method: 'PATCH', json: changes });
    if (!result.ok) return setMessage(result.message);
    await load();
    setMessage(done);
  }

  // Returns the reason when the changes could not be saved, so the pop-up stays open to fix them.
  async function saveEdit(user: User, changes: Record<string, unknown>): Promise<string | null> {
    const result = await callApi(`/api/admin/users/${user.id}`, { method: 'PATCH', json: changes });
    if (!result.ok) return result.message;
    setEditing(null);
    await load();
    setMessage(`บันทึกข้อมูลของ ${String(changes.displayName ?? user.displayName)} แล้ว`);
    return null;
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
  const healthCenters = [...new Set(users.map((user) => user.healthCenter).filter((name): name is string => Boolean(name)))].sort();

  function resetPassword(user: User) {
    const password = window.prompt(`รหัสผ่านใหม่ของ ${user.displayName} (อย่างน้อย ${minimumPasswordLength} ตัวอักษร)`);
    if (password) void update(user, { password }, `ตั้งรหัสผ่านใหม่ให้ ${user.displayName} แล้ว และออกจากระบบทุกเครื่อง`);
  }

  return (
    <section aria-labelledby="admin-users">
      <div className="section-head">
        <h2 id="admin-users">บัญชีผู้ใช้</h2>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> สร้างบัญชี</button>
      </div>
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
      {creating && <CreateAccount refreshKey={usersVersion} onCreate={create} onClose={() => setCreating(false)} />}
      {editing && <EditAccount user={editing} onSave={(changes) => saveEdit(editing, changes)} onClose={() => setEditing(null)} />}
      <datalist id="health-centers">{healthCenters.map((name) => <option key={name} value={name} />)}</datalist>
      <label className="switch-toggle">
        <input type="checkbox" role="switch" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
        แสดงบัญชีที่ปิดใช้งาน ({inactiveCount})
      </label>
      <table>
        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>รพ.สต. / ไรเดอร์</th><th>สถานะ</th><th /></tr></thead>
        <tbody>
          {shownAccounts.map((user) => (
            <tr key={user.id}>
              <td><PersonName person={user} /></td>
              <td>{roleLabels[user.role]}</td>
              <td>{user.riderProfile ? `${user.riderProfile.riderCode} (${user.riderProfile.employmentCategory === 'external' ? 'ภายนอก' : 'ภายใน'})` : user.healthCenter ?? '-'}</td>
              <td>{user.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
              <td>
                <button type="button" onClick={() => setEditing(user)}>แก้ไข</button>
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

// A pop-up for adding an account; for a rider, the code is suggested by the server and locked.
function CreateAccount({ refreshKey, onCreate, onClose }: {
  refreshKey: number; onCreate: (json: Record<string, unknown>) => Promise<string | null>; onClose: () => void;
}) {
  const [role, setRole] = useState<UserRole>('rider');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem((await onCreate(Object.fromEntries(new FormData(event.currentTarget)))) ?? '');
    setBusy(false);
  }

  // Closes only from its buttons or Escape, so a click outside does not throw away what was typed.
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label="สร้างบัญชี">
      <div className="photo-viewer-body detail-dialog">
        <div className="photo-viewer-head">
          <strong>สร้างบัญชีผู้ใช้</strong>
          <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}><Icon name="close" /></button>
        </div>
        {problem && <p className="notice notice-danger" role="alert">{problem}</p>}
        <form onSubmit={(event) => void submit(event)} aria-label="ข้อมูลบัญชีใหม่">
          <label>ชื่อผู้ใช้ <input name="username" required pattern="[a-z0-9._\-]{3,100}" autoFocus /></label>
          <label>ชื่อที่แสดง <input name="displayName" required /></label>
          <label>เบอร์โทร <input name="phone" type="tel" inputMode="tel" pattern="0[0-9 \-]{8,11}" /></label>
          <label>
            บทบาท
            <select name="role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              {userRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
            </select>
          </label>
          {role === 'rider' ? <RiderFields refreshKey={refreshKey} /> : <HealthCenterField />}
          <label>รหัสผ่านเริ่มต้น <input name="password" type="password" required minLength={minimumPasswordLength} autoComplete="new-password" /></label>
          <div className="dialog-actions">
            <button type="submit" disabled={busy}>{busy ? 'กำลังสร้าง' : 'สร้างบัญชี'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Staff only: riders are not attached to a รพ.สต. Earlier names are offered as the admin types.
function HealthCenterField({ value }: { value?: string | null }) {
  return <label>รพ.สต. <input name="healthCenter" list="health-centers" defaultValue={value ?? ''} placeholder="เว้นว่างได้" /></label>;
}

// A pop-up for changing an account's name, phone and รพ.สต.; the username, role and rider code stay as they are.
function EditAccount({ user, onSave, onClose }: {
  user: User; onSave: (changes: Record<string, unknown>) => Promise<string | null>; onClose: () => void;
}) {
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem((await onSave(Object.fromEntries(new FormData(event.currentTarget)))) ?? '');
    setBusy(false);
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`แก้ไขข้อมูล ${user.displayName}`}>
      <div className="photo-viewer-body detail-dialog">
        <div className="photo-viewer-head">
          <strong>แก้ไขข้อมูลบัญชี</strong>
          <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}><Icon name="close" /></button>
        </div>
        {problem && <p className="notice notice-danger" role="alert">{problem}</p>}
        <dl className="detail-list">
          <dt>ชื่อผู้ใช้</dt><dd><code>{user.username}</code></dd>
          <dt>บทบาท</dt><dd>{roleLabels[user.role]}{user.riderProfile && ` · ${user.riderProfile.riderCode}`}</dd>
        </dl>
        <form onSubmit={(event) => void submit(event)} aria-label={`ข้อมูลของ ${user.displayName}`}>
          <label>ชื่อที่แสดง <input name="displayName" required defaultValue={user.displayName} autoFocus /></label>
          <label>เบอร์โทร <input name="phone" type="tel" inputMode="tel" pattern="0[0-9 \-]{8,11}" defaultValue={user.phone ?? ''} /></label>
          {user.role !== 'rider' && <HealthCenterField value={user.healthCenter} />}
          <div className="dialog-actions">
            <button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก' : 'บันทึก'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          </div>
        </form>
      </div>
    </div>
  );
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

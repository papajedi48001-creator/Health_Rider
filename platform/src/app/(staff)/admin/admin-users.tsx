'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { userRoles, type UserRole } from '@/auth/roles';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { filterUsers, noHealthCenterFilter, type UserFilters } from '@/domain/admin/user-filters';
import { callApi } from '@/lib/api-client';
import { withBasePath } from '@/lib/base-path';
import { roleLabels } from '@/lib/labels';
import { HealthCenterSelect } from '@/account/health-center-select';
import { PersonName } from '@/account/person-name';
import { Icon } from '@/brand/icons';

type RoleRequest = { id: string; role: UserRole; reason: string | null; createdAt: string };

type User = {
  id: string; username: string; displayName: string; avatarUpdatedAt: string | null; phone: string | null; healthCenter: string | null; role: UserRole; active: boolean; pendingApproval: boolean; createdAt: string;
  riderProfile: { riderCode: string; employmentCategory: string } | null;
  roles: UserRole[];
  roleRequests: RoleRequest[];
};


export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [reviewing, setReviewing] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [deciding, setDeciding] = useState<{ user: User; request: RoleRequest } | null>(null);
  const [filters, setFilters] = useState<UserFilters>({ healthCenter: '', role: '', q: '' });
  const [healthCenters, setHealthCenters] = useState<string[]>([]);
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
    void callApi<{ names: string[] }>('/api/health-centers').then((result) => result.ok && setHealthCenters(result.data.names));
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
  async function saveEdit(user: User, changes: Record<string, unknown>, roles: { roles: UserRole[]; employmentCategory?: string } | null): Promise<string | null> {
    const result = await callApi(`/api/admin/users/${user.id}`, { method: 'PATCH', json: changes });
    if (!result.ok) return result.message;
    if (roles) {
      const saved = await callApi(`/api/admin/users/${user.id}/roles`, { method: 'PUT', json: roles });
      if (!saved.ok) {
        await load();
        return `บันทึกข้อมูลแล้ว แต่เปลี่ยนบทบาทไม่สำเร็จ: ${saved.message}`;
      }
    }
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

  // Returns the reason when the decision could not be saved, so the pop-up stays open.
  async function decideRole(user: User, request: RoleRequest, json: Record<string, unknown>): Promise<string | null> {
    const result = await callApi(`/api/admin/role-requests/${request.id}`, { json });
    if (!result.ok) return result.message;
    setDeciding(null);
    await load();
    setMessage(json.decision === 'approve'
      ? `เพิ่มบทบาท${roleLabels[request.role]}ให้ ${user.displayName} แล้ว`
      : `ไม่อนุมัติคำขอบทบาท${roleLabels[request.role]}ของ ${user.displayName} แล้ว`);
    return null;
  }

  function reject(user: User) {
    if (window.confirm(`ไม่อนุมัติคำขอของ ${user.displayName}?`)) {
      void decide(user, { decision: 'reject' }, `ไม่อนุมัติ ${user.displayName} แล้ว`);
    }
  }

  const pending = users.filter((user) => user.pendingApproval);
  const accounts = users.filter((user) => !user.pendingApproval);
  const roleRequests = users.flatMap((user) => user.roleRequests.map((request) => ({ user, request })))
    .sort((left, right) => left.request.createdAt.localeCompare(right.request.createdAt));
  const filtered = filterUsers(accounts, filters);
  const inactiveCount = filtered.filter((user) => !user.active).length;
  const shownAccounts = showInactive ? filtered : filtered.filter((user) => user.active);
  const exportParams = new URLSearchParams({ format: 'csv', ...filters, ...(showInactive ? { inactive: '1' } : {}) });

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
                  <span className="muted">ขอใช้งานเป็น {roleLabels[user.role]} · {user.healthCenter ?? 'ยังไม่ระบุ รพ.สต.'} · โทร {user.phone ?? '-'} · สมัครเมื่อ {formatApplied(user.createdAt)}</span>
                </span>
                <button type="button" onClick={() => setReviewing(user)}>พิจารณา</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {roleRequests.length > 0 && (
        <section aria-labelledby="pending-role-requests">
          <h3 id="pending-role-requests">คำขอเพิ่มบทบาทรออนุมัติ ({roleRequests.length})</h3>
          <ul className="pending-list">
            {roleRequests.map(({ user, request }) => (
              <li key={request.id}>
                <span className="pending-who">
                  <strong><PersonName person={user} /></strong>
                  <span className="muted">
                    ขอเพิ่มบทบาท {roleLabels[request.role]} · มีอยู่แล้ว: {user.roles.map((role) => roleLabels[role]).join(', ') || '-'} · {user.healthCenter ?? 'ยังไม่ระบุ รพ.สต.'}
                    {request.reason ? ` · เหตุผล: ${request.reason}` : ''} · ขอเมื่อ {formatApplied(request.createdAt)}
                  </span>
                </span>
                <button type="button" onClick={() => setDeciding({ user, request })}>พิจารณา</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {deciding && (
        <RoleRequestReview
          user={deciding.user} request={deciding.request} refreshKey={usersVersion} onClose={() => setDeciding(null)}
          onDecide={(json) => decideRole(deciding.user, deciding.request, json)}
        />
      )}
      {reviewing && (
        <PendingRegistration
          user={reviewing} refreshKey={usersVersion} onClose={() => setReviewing(null)}
          onApprove={(json) => void decide(reviewing, { decision: 'approve', ...json }, `อนุมัติ ${reviewing.displayName} แล้ว`)}
          onReject={() => reject(reviewing)}
        />
      )}
      {creating && <CreateAccount refreshKey={usersVersion} onCreate={create} onClose={() => setCreating(false)} />}
      {editing && <EditAccount user={editing} refreshKey={usersVersion} onSave={(changes, roles) => saveEdit(editing, changes, roles)} onClose={() => setEditing(null)} />}
      <form className="user-filters" role="search" aria-label="กรองบัญชีผู้ใช้" onSubmit={(event) => event.preventDefault()}>
        <label>
          ค้นหาชื่อ
          <input type="search" value={filters.q} placeholder="ชื่อ ชื่อผู้ใช้ เบอร์โทร หรือรหัสไรเดอร์" onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
        </label>
        <label>
          สถานบริการ
          <select value={filters.healthCenter} onChange={(event) => setFilters({ ...filters, healthCenter: event.target.value })}>
            <option value="">ทุกแห่ง</option>
            {healthCenters.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value={noHealthCenterFilter}>ยังไม่ระบุ</option>
          </select>
        </label>
        <label>
          บทบาท
          <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
            <option value="">ทุกบทบาท</option>
            {userRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
        </label>
        <a className="btn btn-secondary" href={withBasePath(`/api/admin/users?${exportParams}`)} download><Icon name="download" size={18} /> Export</a>
      </form>
      <label className="switch-toggle">
        <input type="checkbox" role="switch" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
        แสดงบัญชีที่ปิดใช้งาน ({inactiveCount})
      </label>
      <table>
        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>รพ.สต.</th><th>สถานะ</th><th /></tr></thead>
        <tbody>
          {shownAccounts.length === 0 && <tr><td colSpan={5} className="muted">ไม่พบบัญชีที่ตรงกับเงื่อนไข</td></tr>}
          {shownAccounts.map((user) => (
            <tr key={user.id}>
              <td><PersonName person={user} /></td>
              <td>
                <span className="role-tags">{user.roles.map((role) => <span key={role} className="role-tag">{roleLabels[role]}</span>)}</span>
                {user.riderProfile && user.roles.includes('rider') && <small className="muted">{user.riderProfile.riderCode} ({user.riderProfile.employmentCategory === 'external' ? 'ภายนอก' : 'ภายใน'})</small>}
              </td>
              <td>{user.healthCenter ?? 'ยังไม่ระบุ'}</td>
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
          <HealthCenterSelect />
          {role === 'rider' && <RiderFields refreshKey={refreshKey} />}
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

// A pop-up for changing an account's name, phone, รพ.สต. and roles; the username and rider code stay as they are.
function EditAccount({ user, refreshKey, onSave, onClose }: {
  user: User; refreshKey: number;
  onSave: (changes: Record<string, unknown>, roles: { roles: UserRole[]; employmentCategory?: string } | null) => Promise<string | null>; onClose: () => void;
}) {
  const [roles, setRoles] = useState<UserRole[]>(user.roles);
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
    const { employmentCategory, ...changes } = Object.fromEntries(new FormData(event.currentTarget));
    const rolesChanged = roles.length !== user.roles.length || roles.some((role) => !user.roles.includes(role));
    if (roles.length === 0) {
      setBusy(false);
      return setProblem('ต้องมีอย่างน้อยหนึ่งบทบาท');
    }
    setProblem((await onSave(changes, rolesChanged ? { roles, ...(employmentCategory ? { employmentCategory: String(employmentCategory) } : {}) } : null)) ?? '');
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
          {user.riderProfile && <><dt>รหัสไรเดอร์</dt><dd><code>{user.riderProfile.riderCode}</code></dd></>}
        </dl>
        <form onSubmit={(event) => void submit(event)} aria-label={`ข้อมูลของ ${user.displayName}`}>
          <label>ชื่อที่แสดง <input name="displayName" required defaultValue={user.displayName} autoFocus /></label>
          <label>เบอร์โทร <input name="phone" type="tel" inputMode="tel" pattern="0[0-9 \-]{8,11}" defaultValue={user.phone ?? ''} /></label>
          <HealthCenterSelect value={user.healthCenter} />
          <fieldset className="role-checks">
            <legend>บทบาท (เลือกได้หลายบทบาท)</legend>
            {userRoles.map((role) => (
              <label key={role}>
                <input
                  type="checkbox" checked={roles.includes(role)}
                  onChange={(event) => setRoles(event.target.checked ? userRoles.filter((item) => item === role || roles.includes(item)) : roles.filter((item) => item !== role))}
                />
                {roleLabels[role]}
              </label>
            ))}
          </fieldset>
          {roles.includes('rider') && !user.riderProfile && <RiderFields refreshKey={refreshKey} />}
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
          <dt>รพ.สต.</dt><dd>{user.healthCenter ?? '-'}</dd>
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
          <HealthCenterSelect value={user.healthCenter} />
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

// A pop-up where the admin approves or rejects one request for another role.
function RoleRequestReview({ user, request, refreshKey, onDecide, onClose }: {
  user: User; request: RoleRequest; refreshKey: number; onDecide: (json: Record<string, unknown>) => Promise<string | null>; onClose: () => void;
}) {
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const needsRiderCode = request.role === 'rider' && !user.riderProfile;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function decide(json: Record<string, unknown>) {
    setBusy(true);
    setProblem((await onDecide(json)) ?? '');
    setBusy(false);
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void decide({ decision: 'approve', ...Object.fromEntries(new FormData(event.currentTarget)) });
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`คำขอบทบาทของ ${user.displayName}`}>
      <div className="photo-viewer-body detail-dialog">
        <div className="photo-viewer-head">
          <strong>พิจารณาคำขอเพิ่มบทบาท</strong>
          <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose}><Icon name="close" /></button>
        </div>
        {problem && <p className="notice notice-danger" role="alert">{problem}</p>}
        <dl className="detail-list">
          <dt>ชื่อ</dt><dd><PersonName person={user} /></dd>
          <dt>บทบาทที่มี</dt><dd>{user.roles.map((role) => roleLabels[role]).join(', ') || '-'}</dd>
          <dt>ขอเพิ่ม</dt><dd><strong>{roleLabels[request.role]}</strong></dd>
          <dt>เหตุผล</dt><dd>{request.reason ?? '-'}</dd>
          <dt>รพ.สต.</dt><dd>{user.healthCenter ?? '-'}</dd>
          <dt>ขอเมื่อ</dt><dd>{formatApplied(request.createdAt)}</dd>
        </dl>
        <form onSubmit={approve} aria-label={`อนุมัติบทบาท ${roleLabels[request.role]}`}>
          {needsRiderCode && <RiderFields refreshKey={refreshKey} />}
          <div className="dialog-actions">
            <button type="submit" disabled={busy}>อนุมัติ</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void decide({ decision: 'reject' })}>ไม่อนุมัติ</button>
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

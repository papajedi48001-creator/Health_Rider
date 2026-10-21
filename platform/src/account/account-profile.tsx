'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { UserAvatar } from '@/account/user-avatar';
import { toAvatarJpeg } from '@/account/avatar-image';
import Link from 'next/link';
import { userRoles, type UserRole } from '@/auth/roles';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { callApi } from '@/lib/api-client';
import { HealthCenterSelect } from '@/account/health-center-select';
import { employmentLabels, formatThaiDateTime, roleLabels } from '@/lib/labels';

type Profile = {
  id: string;
  avatarUpdatedAt: string | null;
  username: string;
  displayName: string;
  phone: string | null;
  healthCenter: string | null;
  role: UserRole;
  roles: UserRole[];
  activeRole: UserRole;
  riderProfile: { riderCode: string; employmentCategory: string } | null;
};

type RoleRequest = { id: string; role: UserRole; reason: string | null; status: 'pending' | 'approved' | 'rejected'; createdAt: string; decidedAt: string | null };

const requestStatusLabels: Record<RoleRequest['status'], string> = { pending: 'รอผู้ดูแลระบบพิจารณา', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' };

type Change = { id: string; action: string; at: string; byMe: boolean; oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null };

const fieldLabels: Record<string, string> = { displayName: 'ชื่อที่แสดง', phone: 'เบอร์โทร', healthCenter: 'รพ.สต.', role: 'บทบาท', roles: 'บทบาท', requestedRole: 'บทบาทที่ขอ', active: 'สถานะบัญชี' };
const actionLabels: Record<string, string> = {
  'user.avatar_updated': 'เปลี่ยนรูปโปรไฟล์', 'user.avatar_removed': 'ลบรูปโปรไฟล์',
  'user.created': 'สร้างบัญชี', 'user.updated': 'ผู้ดูแลระบบแก้ไขบัญชี', 'user.profile_updated': 'แก้ไขข้อมูลส่วนตัว', 'user.password_changed': 'เปลี่ยนรหัสผ่าน',
  'user.roles_changed': 'ผู้ดูแลระบบเปลี่ยนบทบาท', 'user.role_requested': 'ขอเพิ่มบทบาท',
  'user.role_request_approved': 'อนุมัติคำขอเพิ่มบทบาท', 'user.role_request_rejected': 'ไม่อนุมัติคำขอเพิ่มบทบาท',
};

function shown(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if ((field === 'role' || field === 'requestedRole') && typeof value === 'string') return roleLabels[value as UserRole] ?? value;
  if (field === 'roles' && Array.isArray(value)) return value.map((role) => roleLabels[role as UserRole] ?? String(role)).join(', ') || '-';
  if (field === 'active') return value ? 'ใช้งาน' : 'ปิดใช้งาน';
  return String(value);
}

// The signed-in user's own account: details the admin set, plus a name, phone, รพ.สต. and password they can change.
export function AccountProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('กำลังโหลดข้อมูลผู้ใช้');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [changes, setChanges] = useState<Change[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [roleMessage, setRoleMessage] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);

  const loadChanges = () => void callApi<{ changes: Change[] }>('/api/me/changes').then((result) => result.ok && setChanges(result.data.changes));
  const loadRoleRequests = () => void callApi<{ requests: RoleRequest[] }>('/api/me/role-requests').then((result) => result.ok && setRoleRequests(result.data.requests));

  useEffect(() => {
    void callApi<Profile>('/api/me').then((result) => {
      if (!result.ok) return setMessage(result.message);
      setProfile(result.data);
      setMessage('');
      if (!result.data.healthCenter) setEditing(true);
    });
    loadChanges();
    loadRoleRequests();
  }, []);

  async function requestRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setSaving(true);
    const result = await callApi('/api/me/role-requests', { json: { role: form.get('role'), reason: form.get('reason') } });
    setSaving(false);
    if (!result.ok) return setRoleMessage(result.message);
    target.reset();
    setRoleMessage('ส่งคำขอแล้ว เมื่อผู้ดูแลระบบอนุมัติ จะเลือกบทบาทนี้ได้ตอนเข้าสู่ระบบ');
    loadRoleRequests();
    loadChanges();
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await callApi<Profile>('/api/me', { method: 'PATCH', json: { displayName: form.get('displayName'), phone: form.get('phone'), healthCenter: form.get('healthCenter') } });
    setSaving(false);
    if (!result.ok) return setMessage(result.message);
    setProfile(result.data);
    setEditing(false);
    setMessage('บันทึกข้อมูลส่วนตัวแล้ว');
    loadChanges();
    router.refresh();
  }

  async function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profile) return;
    setSaving(true);
    setMessage('กำลังอัปโหลดรูปโปรไฟล์');
    let photo: string;
    try {
      photo = await toAvatarJpeg(file);
    } catch {
      setSaving(false);
      return setMessage('เปิดไฟล์รูปนี้ไม่ได้ โปรดเลือกไฟล์รูปภาพ (JPG หรือ PNG)');
    }
    const result = await callApi<{ avatarVersion: number }>('/api/me/avatar', { method: 'PUT', json: { photo } });
    setSaving(false);
    if (!result.ok) return setMessage(result.message);
    setProfile({ ...profile, avatarUpdatedAt: new Date(result.data.avatarVersion).toISOString() });
    setMessage('เปลี่ยนรูปโปรไฟล์แล้ว');
    loadChanges();
    router.refresh();
  }

  async function removePhoto() {
    if (!profile || !window.confirm('ลบรูปโปรไฟล์ใช่ไหม')) return;
    setSaving(true);
    const result = await callApi('/api/me/avatar', { method: 'DELETE' });
    setSaving(false);
    if (!result.ok) return setMessage(result.message);
    setProfile({ ...profile, avatarUpdatedAt: null });
    setMessage('ลบรูปโปรไฟล์แล้ว');
    loadChanges();
    router.refresh();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    if (form.get('newPassword') !== form.get('confirmPassword')) return setPasswordMessage('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    setSaving(true);
    const result = await callApi('/api/me/password', { json: { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') } });
    setSaving(false);
    if (!result.ok) return setPasswordMessage(result.message);
    target.reset();
    loadChanges();
    setPasswordMessage('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่เคยเข้าสู่ระบบจะต้องเข้าสู่ระบบใหม่');
  }

  const pendingRoles = roleRequests.filter((request) => request.status === 'pending').map((request) => request.role);
  const requestableRoles = profile ? userRoles.filter((role) => !profile.roles.includes(role) && !pendingRoles.includes(role)) : [];

  return (
    <div className="account">
      <h1>ข้อมูลผู้ใช้</h1>
      <p aria-live="polite" role="status">{message}</p>
      {profile && (
        <>
          <section className="rider-card profile-head" aria-label="บัญชีของฉัน">
            <div className="avatar-edit">
              <UserAvatar userId={profile.id} name={profile.displayName} version={profile.avatarUpdatedAt ? Date.parse(profile.avatarUpdatedAt) : null} />
              <input ref={photoInput} type="file" accept="image/*" hidden aria-label="เลือกรูปโปรไฟล์" onChange={(event) => void changePhoto(event)} />
              <button type="button" className="link-button" disabled={saving} onClick={() => photoInput.current?.click()}>
                {profile.avatarUpdatedAt ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}
              </button>
              {profile.avatarUpdatedAt && <button type="button" className="link-button" disabled={saving} onClick={() => void removePhoto()}>ลบรูป</button>}
            </div>
            <div>
              <h2>{profile.displayName}</h2>
              <p className="muted">
                {roleLabels[profile.activeRole]}
                {profile.riderProfile ? ` · ${employmentLabels[profile.riderProfile.employmentCategory] ?? profile.riderProfile.employmentCategory}` : ''}
              </p>
            </div>
          </section>

          <section className="rider-card" aria-label="ข้อมูลส่วนตัว">
            <h2>ข้อมูลส่วนตัว</h2>
            {editing ? (
              <form className="inline-form" onSubmit={(event) => void saveProfile(event)}>
                <label>
                  ชื่อที่แสดง
                  <input name="displayName" defaultValue={profile.displayName} required maxLength={255} autoComplete="name" />
                </label>
                <label>
                  เบอร์โทร
                  <input name="phone" type="tel" inputMode="tel" defaultValue={profile.phone ?? ''} placeholder="08xxxxxxxx" autoComplete="tel" />
                </label>
                {!profile.healthCenter && <p className="notice notice-danger" role="alert">ยังไม่ได้ระบุ รพ.สต. โปรดเลือกก่อนใช้งาน</p>}
                <HealthCenterSelect value={profile.healthCenter} />
                <div className="button-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>ยกเลิก</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>บันทึก</button>
                </div>
              </form>
            ) : (
              <>
                <dl className="details">
                  <dt>ชื่อที่แสดง</dt><dd>{profile.displayName}</dd>
                  <dt>เบอร์โทร</dt><dd>{profile.phone ?? '-'}</dd>
                  <dt>ชื่อผู้ใช้</dt><dd><code>{profile.username}</code></dd>
                  <dt>บทบาท</dt><dd>{profile.roles.map((role) => roleLabels[role]).join(', ')}</dd>
                  <dt>รพ.สต.</dt><dd>{profile.healthCenter ?? '-'}</dd>
                  {profile.riderProfile && <><dt>รหัสไรเดอร์</dt><dd><code>{profile.riderProfile.riderCode}</code></dd></>}
                </dl>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => { setEditing(true); setMessage(''); }}>แก้ไขข้อมูล</button>
                <p className="muted">ชื่อผู้ใช้และรหัสไรเดอร์ แก้ได้โดยผู้ดูแลระบบ ส่วนบทบาทขอเพิ่มได้ด้านล่าง</p>
              </>
            )}
          </section>

          <section className="rider-card" aria-label="บทบาท">
            <h2>บทบาท</h2>
            <div className="role-tags">
              {profile.roles.map((role) => <span key={role} className="role-tag">{roleLabels[role]}{role === profile.activeRole ? ' (ใช้งานอยู่)' : ''}</span>)}
            </div>
            {profile.roles.length > 1 && <Link href="/select-role" className="btn btn-secondary btn-block">เปลี่ยนบทบาทที่ใช้งาน</Link>}
            {requestableRoles.length > 0 && (
              <form className="inline-form" aria-label="ขอเพิ่มบทบาท" onSubmit={(event) => void requestRole(event)}>
                <label>
                  บทบาทที่ต้องการ
                  <select name="role" required defaultValue="">
                    <option value="" disabled>เลือกบทบาท</option>
                    {requestableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                  </select>
                </label>
                <label>
                  เหตุผล (ถ้ามี)
                  <input name="reason" maxLength={500} placeholder="เช่น ได้รับมอบหมายให้ช่วยงานเภสัชกรรม" />
                </label>
                <button type="submit" className="btn btn-primary btn-block" disabled={saving}>ส่งคำขอ</button>
              </form>
            )}
            {roleMessage && <p className="notice" role="status">{roleMessage}</p>}
            {roleRequests.length > 0 && (
              <ol className="change-log" aria-label="คำขอเพิ่มบทบาท">
                {roleRequests.map((request) => (
                  <li key={request.id}>
                    <strong>{roleLabels[request.role]} · {requestStatusLabels[request.status]}</strong>
                    <span className="muted">ขอเมื่อ {formatThaiDateTime(request.createdAt)}{request.decidedAt ? ` · พิจารณาเมื่อ ${formatThaiDateTime(request.decidedAt)}` : ''}</span>
                    {request.reason && <span>เหตุผล: {request.reason}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <form className="rider-card" aria-label="เปลี่ยนรหัสผ่าน" onSubmit={(event) => void changePassword(event)}>
            <h2>เปลี่ยนรหัสผ่าน</h2>
            <label>
              รหัสผ่านปัจจุบัน
              <input name="currentPassword" type="password" required autoComplete="current-password" />
            </label>
            <label>
              รหัสผ่านใหม่ (อย่างน้อย {minimumPasswordLength} ตัวอักษร)
              <input name="newPassword" type="password" required minLength={minimumPasswordLength} autoComplete="new-password" />
            </label>
            <label>
              ยืนยันรหัสผ่านใหม่
              <input name="confirmPassword" type="password" required minLength={minimumPasswordLength} autoComplete="new-password" />
            </label>
            {passwordMessage && <p className="notice">{passwordMessage}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={saving}>เปลี่ยนรหัสผ่าน</button>
          </form>

          <section className="rider-card" aria-label="ประวัติการแก้ไขบัญชี">
            <h2>ประวัติการแก้ไขบัญชี</h2>
            {changes.length === 0 ? <p className="muted">ยังไม่มีการแก้ไข</p> : (
              <ol className="change-log">
                {changes.map((change) => {
                  const fields = Object.keys(change.newValues ?? {}).filter((field) => field in fieldLabels);
                  return (
                    <li key={change.id}>
                      <strong>{actionLabels[change.action] ?? change.action}</strong>
                      <span className="muted">{formatThaiDateTime(change.at)}{change.byMe ? '' : ' · โดยผู้ดูแลระบบ'}</span>
                      {fields.map((field) => (
                        <span key={field}>{fieldLabels[field]}: {shown(field, change.oldValues?.[field])} → {shown(field, change.newValues?.[field])}</span>
                      ))}
                      {change.newValues?.passwordReset === true && <span>ผู้ดูแลระบบตั้งรหัสผ่านใหม่</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

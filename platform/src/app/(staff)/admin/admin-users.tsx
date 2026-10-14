'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { userRoles, type UserRole } from '@/auth/roles';
import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { callApi } from '@/lib/api-client';

type User = { id: string; username: string; displayName: string; role: UserRole; active: boolean; riderProfile: { riderCode: string; employmentCategory: string } | null };

export const roleLabels: Record<UserRole, string> = {
  pharmacy: 'เภสัชกรรม', coordinator: 'ผู้ประสานงาน', rider: 'ไรเดอร์', admin: 'ผู้ดูแลระบบ', auditor: 'ผู้ตรวจสอบ',
};

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<UserRole>('rider');

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

  function resetPassword(user: User) {
    const password = window.prompt(`รหัสผ่านใหม่ของ ${user.username} (อย่างน้อย ${minimumPasswordLength} ตัวอักษร)`);
    if (password) void update(user, { password }, `ตั้งรหัสผ่านใหม่ให้ ${user.username} แล้ว และออกจากระบบทุกเครื่อง`);
  }

  return (
    <section aria-labelledby="admin-users">
      <h2 id="admin-users">บัญชีผู้ใช้</h2>
      <p aria-live="polite">{message}</p>
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
      <table>
        <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>บทบาท</th><th>ไรเดอร์</th><th>สถานะ</th><th /></tr></thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td><code>{user.username}</code></td>
              <td>{user.displayName}</td>
              <td>{roleLabels[user.role]}</td>
              <td>{user.riderProfile ? `${user.riderProfile.riderCode} (${user.riderProfile.employmentCategory === 'external' ? 'ภายนอก' : 'ภายใน'})` : '-'}</td>
              <td>{user.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
              <td>
                <button type="button" onClick={() => void update(user, { active: !user.active }, user.active ? `ปิดบัญชี ${user.username} แล้ว` : `เปิดบัญชี ${user.username} แล้ว`)}>
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

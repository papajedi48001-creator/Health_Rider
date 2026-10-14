import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import type { UserRole } from '@/auth/roles';

export async function RoleGate({ roles, children }: { roles: readonly UserRole[]; children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');

  return (
    <>
      <header>
        <span>{session.displayName}</span>
        <form action="/api/auth/logout" method="post">
          <button type="submit">ออกจากระบบ</button>
        </form>
      </header>
      {roles.includes(session.role) ? children : (
        <main>
          <h1>ไม่มีสิทธิ์เข้าหน้านี้</h1>
          <p>บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้ โปรดติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
        </main>
      )}
    </>
  );
}

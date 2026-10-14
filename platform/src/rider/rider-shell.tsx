import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import { Icon } from '@/rider/icons';
import { RiderTabBar } from '@/rider/rider-tab-bar';

// The rider app frame: a slim top bar, a single mobile column and bottom tabs.
export async function RiderShell({ children }: { children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');

  return (
    <div className="rider-app">
      <header className="rider-topbar">
        <span className="rider-brand">Health Rider</span>
        <span className="rider-user">{session.displayName}</span>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="rider-logout" aria-label="ออกจากระบบ">
            <Icon name="logout" />
          </button>
        </form>
      </header>
      {session.role === 'rider' ? (
        <>
          {children}
          <RiderTabBar />
        </>
      ) : (
        <main>
          <h1>ไม่มีสิทธิ์เข้าหน้านี้</h1>
          <p>บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้ โปรดติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
        </main>
      )}
    </div>
  );
}

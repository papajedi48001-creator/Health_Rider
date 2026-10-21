import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ForcedPasswordChange } from '@/account/forced-password-change';
import { getSessionFromCookies, loginRedirectPath } from '@/auth/current-session';
import { UserAvatar } from '@/account/user-avatar';
import { chooseRolePath } from '@/auth/role-home';
import { isAdminView, viewCookieName } from '@/auth/view-as';
import { ViewSwitcher } from '@/auth/view-switcher';
import { RiderLogout } from '@/rider/rider-logout';
import { RiderTabBar } from '@/rider/rider-tab-bar';
import { LogoMark } from '@/brand/logo';
import { Mascot } from '@/brand/mascot';

// The rider app frame: a slim top bar, a single mobile column and bottom tabs. An admin may open it to see the
// rider's screens, with the view switcher to get back; the rider-only actions still answer them with no permission.
export async function RiderShell({ children }: { children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect(await loginRedirectPath());
  if (session.roleChoicePending) redirect(chooseRolePath());
  const view = (await cookies()).get(viewCookieName)?.value;

  return (
    <div className="rider-app">
      <header className="rider-topbar">
        <span className="rider-brand"><LogoMark size={30} /> Health Rider</span>
        <Link href="/rider/profile" className="rider-user" aria-label={`ข้อมูลผู้ใช้ ${session.displayName}`}>
          <UserAvatar userId={session.id} name={session.displayName} version={session.avatarVersion} small />
          <span className="rider-user-name">{session.displayName}</span>
        </Link>
        <RiderLogout />
      </header>
      {session.role === 'admin' && <div className="rider-view-switcher"><ViewSwitcher view={isAdminView(view) ? view : 'admin'} /></div>}
      {session.mustChangePassword ? <ForcedPasswordChange /> : session.role === 'rider' || session.role === 'admin' ? (
        <>
          {children}
          <RiderTabBar />
        </>
      ) : (
        <main className="no-access">
          <Mascot width={180} variant="small" />
          <h1>ไม่มีสิทธิ์เข้าหน้านี้</h1>
          <p>บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้ โปรดติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
        </main>
      )}
    </div>
  );
}

import { redirect } from 'next/navigation';
import { getSessionFromCookies, loginRedirectPath } from '@/auth/current-session';
import { roleHome, safeNextPath } from '@/auth/role-home';
import { RoleChoice } from '@/app/select-role/role-choice';
import { Brand } from '@/brand/logo';
import { Mascot, mascotName } from '@/brand/mascot';
import { withBasePath } from '@/lib/base-path';

export const dynamic = 'force-dynamic';

// After signing in, an account with several roles picks the one to work in; it can come back here to switch.
export default async function SelectRolePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) redirect(await loginRedirectPath());
  const next = safeNextPath((await searchParams).next);
  if (!session.roles) redirect(next ?? roleHome(session.role));

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-hero">
          <Mascot width={260} variant="full" alt={`${mascotName} มาสคอต ภูไทไรเดอร์`} />
          <h2>สวัสดีครับ คุณ{session.displayName}</h2>
          <p>บัญชีนี้มีหลายบทบาท เลือกบทบาทที่จะใช้งานตอนนี้ เปลี่ยนได้ภายหลังจากเมนูผู้ใช้</p>
        </div>
        <div className="login-card">
          <div className="brand"><Brand size={40} /></div>
          <h1>เลือกบทบาท</h1>
          <p className="login-tagline">สิทธิ์และเมนูจะเป็นไปตามบทบาทที่เลือก</p>
          <RoleChoice roles={session.roles} current={session.roleChoicePending ? null : session.role} next={next} />
          <form action={withBasePath('/api/auth/logout')} method="post" className="role-choice-logout">
            <button type="submit" className="link-button">ออกจากระบบ</button>
          </form>
        </div>
      </div>
    </main>
  );
}

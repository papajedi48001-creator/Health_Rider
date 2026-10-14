import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import { roleHome, safeNextPath } from '@/auth/role-home';
import { LoginForm } from '@/app/login/login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSessionFromCookies();
  const next = safeNextPath((await searchParams).next);
  if (session) redirect(next ?? roleHome(session.role));

  return (
    <main>
      <h1>เข้าสู่ระบบ Health Rider</h1>
      <LoginForm next={next} />
    </main>
  );
}

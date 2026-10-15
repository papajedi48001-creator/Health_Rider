import { redirect } from 'next/navigation';
import { getSessionFromCookies, loginRedirectPath } from '@/auth/current-session';
import { roleHome } from '@/auth/role-home';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSessionFromCookies();
  redirect(session ? roleHome(session.role) : await loginRedirectPath());
}

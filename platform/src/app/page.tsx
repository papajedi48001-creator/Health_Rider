import { redirect } from 'next/navigation';
import { getSessionFromCookies, loginRedirectPath } from '@/auth/current-session';
import { chooseRolePath, roleHome } from '@/auth/role-home';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSessionFromCookies();
  if (!session) redirect(await loginRedirectPath());
  redirect(session.roleChoicePending ? chooseRolePath() : roleHome(session.role));
}

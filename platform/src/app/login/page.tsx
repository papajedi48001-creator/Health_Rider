import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import { roleHome, safeNextPath } from '@/auth/role-home';
import { LoginForm } from '@/app/login/login-form';
import { Icon } from '@/rider/icons';

export const dynamic = 'force-dynamic';

const errorMessages: Record<string, string> = {
  '401': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  '422': 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
  '429': 'เข้าสู่ระบบผิดหลายครั้ง โปรดรอ 15 นาทีแล้วลองใหม่',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const session = await getSessionFromCookies();
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (session) redirect(next ?? roleHome(session.role));

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="package" size={20} /></span>
          <span className="brand-text"><strong>Health Rider</strong><small>โรงพยาบาลวาริชภูมิ</small></span>
        </div>
        <h1>เข้าสู่ระบบ Health Rider</h1>
        <LoginForm next={next} initialMessage={errorMessages[params.error ?? ''] ?? ''} />
      </div>
    </main>
  );
}

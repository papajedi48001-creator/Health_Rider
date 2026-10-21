import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import { chooseRolePath, roleHome } from '@/auth/role-home';
import { RegisterForm } from '@/app/register/register-form';
import { Brand } from '@/brand/logo';
import { Mascot, mascotName } from '@/brand/mascot';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const session = await getSessionFromCookies();
  if (session) redirect(session.roleChoicePending ? chooseRolePath() : roleHome(session.role));

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-hero">
          <Mascot width={260} variant="full" alt={`${mascotName} มาสคอต ภูไทไรเดอร์`} />
          <h2>สมัครเข้าใช้งาน</h2>
          <p>กรอกข้อมูลให้ครบ ผู้ดูแลระบบจะตรวจสอบและอนุมัติก่อนเข้าใช้งานได้</p>
        </div>
        <div className="login-card">
          <div className="brand"><Brand size={40} /></div>
          <h1>สมัครเข้าใช้งาน</h1>
          <p className="login-tagline">บัญชีใหม่ต้องรอผู้ดูแลระบบอนุมัติก่อน</p>
          <RegisterForm />
          <p className="login-switch">มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></p>
        </div>
      </div>
    </main>
  );
}

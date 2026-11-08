import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import { chooseRolePath, roleHome, safeNextPath } from '@/auth/role-home';
import { LoginForm } from '@/app/login/login-form';
import { Brand } from '@/brand/logo';
import { LicenseLock } from '@/app/login/license-lock';
import { currentLicense } from '@/license/license-store';
import { vendorContact } from '@/license/vendor';
import { Mascot, mascotName } from '@/brand/mascot';

export const dynamic = 'force-dynamic';

const errorMessages: Record<string, string> = {
  '401': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  '422': 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
  '403': 'บัญชีนี้รอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วจะเข้าสู่ระบบได้',
  '429': 'เข้าสู่ระบบผิดหลายครั้ง โปรดรอ 15 นาทีแล้วลองใหม่',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reason?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const license = await currentLicense();
  // A locked app stops here even for someone still signed in, or the redirect below would loop back.
  const session = license.locked ? null : await getSessionFromCookies();
  if (session) redirect(session.roleChoicePending ? chooseRolePath(next) : next ?? roleHome(session.role));

  return (
    <main className={license.locked ? 'login-page login-locked' : 'login-page'}>
      {license.locked && <LicenseLock installationId={license.installationId} message={license.message} contact={vendorContact} />}
      <div className="login-shell" aria-hidden={license.locked || undefined} inert={license.locked || undefined}>
        <div className="login-hero">
          <Mascot width={260} variant="full" alt={`${mascotName} มาสคอต ภูไทไรเดอร์`} />
          <h2>สวัสดีครับ ผม<span className="nowrap">{mascotName}</span></h2>
          <p>พร้อมพายาจากโรงพยาบาลไปถึงบ้านผู้ป่วยอย่างปลอดภัย</p>
        </div>
        <div className="login-card">
          <div className="brand"><Brand size={40} hospitalName={license.license?.licensee.name} /></div>
          <h1>เข้าสู่ระบบ</h1>
          <p className="login-tagline">ระบบส่งยาถึงบ้าน ปลอดภัย ตรวจสอบได้ทุกขั้นตอน</p>
          <LoginForm next={next} initialMessage={errorMessages[params.error ?? ''] ?? (params.reason === 'expired' ? 'หมดเวลาใช้งานหรือออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่' : '')} />
          <p className="login-switch">ยังไม่มีบัญชี? <Link href="/register">สมัครเข้าใช้งาน</Link></p>
        </div>
      </div>
    </main>
  );
}

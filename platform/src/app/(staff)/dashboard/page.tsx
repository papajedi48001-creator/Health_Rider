import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionFromCookies, loginRedirectPath } from '@/auth/current-session';
import { scoped } from '@/auth/coordinator-scope';
import { menuRole, viewCookieName } from '@/auth/view-as';
import { HeroBanner } from '@/brand/hero-banner';
import { Icon, type IconName } from '@/brand/icons';
import { dashboardTab, dashboardTabs, inTab, summarize } from '@/domain/delivery/dashboard-summary';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { shortCode, statusLabels } from '@/lib/labels';
import { statusTone } from '@/lib/status-tone';
import { bangkokDateString, startOfBangkokDay } from '@/lib/time';

// Still moving, so work from an earlier day stays on the home page until it is closed.
const openStatuses: DeliveryAttemptStatus[] = ['prepared', 'claimed', 'in_transit', 'sync_review', 'return_required'];
const shownRows = 50;

const timeOfDay = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
const longDate = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
const baht = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

// The home page for pharmacy, coordinators and admins: a greeting, today's counts and today's deliveries.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) redirect(await loginRedirectPath());
  const shownRole = menuRole(session.role, (await cookies()).get(viewCookieName)?.value);
  const tab = dashboardTab((await searchParams).tab);

  const now = new Date();
  const dayStart = startOfBangkokDay(bangkokDateString(now))!;
  const today = { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) };
  const attempts = await db.deliveryAttempt.findMany({
    where: scoped(session, { OR: [{ createdAt: today }, { status: { in: openStatuses } }, { deliveredAt: today }, { failedAt: today }] }),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, status: true, createdAt: true, claimedAt: true, deliveredAt: true, failedAt: true,
      rider: { select: { displayName: true } },
      deliveryRequest: { select: { hn: true, patientName: true, deliveryAddress: true, rateSatang: true, deliveryZone: { select: { displayName: true } } } },
    },
  });

  const summary = summarize(attempts.map((attempt) => ({ ...attempt, rateSatang: attempt.deliveryRequest.rateSatang })), dayStart);
  const rows = attempts.filter((attempt) => inTab(attempt.status, tab.key));
  const showFees = session.role === 'admin' && shownRole === 'admin';
  const canPrepare = shownRole === 'pharmacy' || shownRole === 'admin';

  const cards: Array<{ label: string; value: string; unit: string; note: string; icon: IconName; tone: string; share: number }> = [
    { label: 'งานวันนี้', value: String(summary.total), unit: 'งาน', note: `รอไรเดอร์รับงาน ${summary.tabs.waiting} งาน`, icon: 'package', tone: 'tone-teal', share: 1 },
    { label: 'กำลังจัดส่ง', value: String(summary.tabs.moving), unit: 'งาน', note: 'ไรเดอร์รับงานแล้วหรือกำลังนำส่ง', icon: 'clipboard', tone: 'tone-blue', share: ratio(summary.tabs.moving, summary.total) },
    { label: 'ส่งสำเร็จวันนี้', value: String(summary.deliveredToday), unit: 'งาน', note: 'ผู้รับได้รับยาแล้ว', icon: 'checkCircle', tone: 'tone-green', share: ratio(summary.deliveredToday, summary.total) },
    showFees
      ? { label: 'ค่าบริการวันนี้', value: baht.format(summary.feesSatang / 100), unit: 'บาท', note: `จาก ${summary.deliveredToday} งานที่ส่งสำเร็จ`, icon: 'coins', tone: 'tone-orange', share: ratio(summary.deliveredToday, summary.total) }
      : { label: 'ต้องติดตาม', value: String(summary.tabs.attention), unit: 'งาน', note: 'ส่งไม่สำเร็จหรือรอตรวจสอบ', icon: 'alert', tone: 'tone-orange', share: ratio(summary.tabs.attention, summary.total) },
  ];

  return (
    <main className="dashboard">
      <header className="page-greeting">
        <h1>สวัสดี, {session.displayName} <span aria-hidden="true">👋</span></h1>
        <p>ยินดีต้อนรับเข้าสู่ระบบ ภูไทไรเดอร์ · {longDate.format(now)}</p>
      </header>

      <HeroBanner
        large
        title="ส่งยาถึงบ้าน ส่งด้วยใจ"
        accent="ใส่ใจทุกการจัดส่ง"
        text="ภูไทไรเดอร์ โรงพยาบาลวาริชภูมิ เคียงข้างผู้ป่วยทุกการเดินทาง"
      />

      <div className="dash-cards">
        {cards.map((card) => (
          <div key={card.label} className={`dash-card ${card.tone}`}>
            <span className="dash-card-icon"><Icon name={card.icon} size={26} /></span>
            <div className="dash-card-body">
              <span className="dash-card-label">{card.label}</span>
              <span className="dash-card-value"><strong>{card.value}</strong> {card.unit}</span>
              <span className="dash-card-note">{card.note}</span>
              <span className="dash-card-bar" aria-hidden="true"><span style={{ width: `${Math.round(card.share * 100)}%` }} /></span>
            </div>
          </div>
        ))}
      </div>

      <section className="dash-table" aria-labelledby="today-heading">
        <div className="dash-table-head">
          <h2 id="today-heading">รายการจัดส่งวันนี้</h2>
          <div className="dash-table-actions">
            <Link href="/operations" className="btn btn-secondary btn-small"><Icon name="dashboard" size={18} /> ตัวกรองเพิ่มเติม</Link>
            {canPrepare && <Link href="/pharmacy/candidates" className="btn btn-primary btn-small"><Icon name="plus" size={18} /> รับงานจาก HOSxP</Link>}
          </div>
        </div>
        <nav className="dash-tabs" aria-label="กรองตามสถานะ">
          {dashboardTabs.map((item) => (
            <Link key={item.key} href={item.key === 'all' ? '/dashboard' : `/dashboard?tab=${item.key}`} aria-current={item.key === tab.key ? 'page' : undefined}>
              {item.label} <span>{summary.tabs[item.key]}</span>
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="dash-empty">ยังไม่มีงานในหมวดนี้วันนี้</p>
        ) : (
          <div className="dash-table-scroll">
            <table>
              <thead>
                <tr><th className="num">ลำดับ</th><th>รหัสงาน</th><th>ผู้รับ</th><th>ที่อยู่จัดส่ง</th><th>ไรเดอร์</th><th>เวลา</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, shownRows).map((attempt, index) => (
                  <tr key={attempt.id}>
                    <td className="num">{index + 1}</td>
                    <td><code>{shortCode(attempt.id)}</code></td>
                    <td><strong>{attempt.deliveryRequest.patientName}</strong><br /><span className="muted">HN {attempt.deliveryRequest.hn}</span></td>
                    <td>{attempt.deliveryRequest.deliveryAddress}<br /><span className="muted">{attempt.deliveryRequest.deliveryZone.displayName}</span></td>
                    <td>{attempt.rider?.displayName ?? '-'}</td>
                    <td className="nowrap">{timeOfDay.format(attempt.deliveredAt ?? attempt.failedAt ?? attempt.claimedAt ?? attempt.createdAt)} น.</td>
                    <td><span className={`chip ${statusTone(attempt.status)}`}>{statusLabels[attempt.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shownRows && <p className="dash-more">แสดง {shownRows} จาก {rows.length} งาน · <Link href="/operations">ดูทั้งหมดในภาพรวมการจัดส่ง</Link></p>}
      </section>
    </main>
  );
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

'use client';

import Link from 'next/link';
import { PersonName } from '@/account/person-name';
import { employmentLabels } from '@/lib/labels';
import { baht, NoActivity, ReportFilters, ReportSection, StatTile, useReport } from '@/reports/report-kit';

type FeeReportData = {
  totals: { deliveries: number; totalSatang: number; unpriced: number; backfilled: number };
  byRider: Array<{ riderId: string; displayName: string; avatarUpdatedAt: string | null; riderCode: string | null; employmentCategory: string | null; deliveries: number; totalSatang: number; unpriced: number }>;
};

export function FeeReport() {
  const { range, setRange, data, message, csvHref } = useReport<FeeReportData>('/api/reports/fees');

  return (
    <div>
      <ReportFilters range={range} onChange={setRange} csvHref={csvHref} />
      <p aria-live="polite">{message}</p>
      {data && (
        <>
          <div className="stat-row">
            <StatTile icon="checkCircle" value={data.totals.deliveries} label="งานส่งสำเร็จ" tone="success" />
            <StatTile icon="coins" value={`${baht(data.totals.totalSatang)} บาท`} label="ค่าบริการรวม" tone="info" />
            <StatTile icon="alert" value={data.totals.unpriced} label="งานที่ยังไม่มีราคา" tone={data.totals.unpriced > 0 ? 'warning' : undefined} />
          </div>
          {data.totals.unpriced > 0 && (
            <p className="notice">มีงานที่ส่งสำเร็จแต่ทั้งโซนและตำบลยังไม่ได้ตั้งราคา {data.totals.unpriced} งาน ยอดรวมยังไม่รวมงานเหล่านี้ ตั้งราคาได้ที่ <Link href="/admin/rates">ค่าบริการ</Link></p>
          )}
          {data.totals.backfilled > 0 && (
            <p className="muted">{data.totals.backfilled} งานยืนยันก่อนตั้งราคา จึงคิดตามราคาโซนหรือราคาตำบลที่ตั้งไว้ภายหลัง (ระบุไว้ในไฟล์ CSV)</p>
          )}
          {data.byRider.length === 0 ? <NoActivity /> : (
            <ReportSection title="สรุปตามไรเดอร์">
              <table>
                <thead><tr><th>ไรเดอร์</th><th>ประเภท</th><th className="num">งานส่งสำเร็จ</th><th className="num">ค่าบริการ (บาท)</th><th className="num">ยังไม่มีราคา</th></tr></thead>
                <tbody>
                  {data.byRider.map((row) => (
                    <tr key={row.riderId}>
                      <td>
                        <PersonName person={{ id: row.riderId, displayName: row.displayName, avatarUpdatedAt: row.avatarUpdatedAt }}>
                          {row.riderCode && <><br /><code>{row.riderCode}</code></>}
                        </PersonName>
                      </td>
                      <td>{row.employmentCategory ? employmentLabels[row.employmentCategory] : '-'}</td>
                      <td className="num">{row.deliveries}</td>
                      <td className="num"><strong>{baht(row.totalSatang)}</strong></td>
                      <td className="num">{row.unpriced || '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th>รวม</th><th /><th className="num">{data.totals.deliveries}</th><th className="num">{baht(data.totals.totalSatang)}</th><th className="num">{data.totals.unpriced || '-'}</th></tr></tfoot>
              </table>
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}

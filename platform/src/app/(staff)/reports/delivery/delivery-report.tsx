'use client';

import { useState } from 'react';
import { employmentLabels } from '@/lib/labels';
import { RiderJobsPanel } from '@/app/(staff)/reports/delivery/rider-jobs';
import { FailureReasons, minutes, NoActivity, percent, ReportFilters, ReportSection, StatTile, useReport } from '@/reports/report-kit';

type DeliveryReportData = {
  totals: { claimed: number; delivered: number; failed: number; successRate: number | null; averageMinutes: number | null };
  byRider: Array<{ riderId: string; displayName: string; riderCode: string | null; employmentCategory: string | null; claimed: number; delivered: number; failed: number; successRate: number | null; averageMinutes: number | null }>;
  byZone: Array<{ zone: string; subdistrictCode: string; delivered: number; failed: number; successRate: number | null }>;
  failureReasons: Array<{ reason: string; count: number }>;
};

export function DeliveryReport() {
  const { range, setRange, data, message, csvHref } = useReport<DeliveryReportData>('/api/reports/delivery');
  const [riderId, setRiderId] = useState<string | null>(null);

  return (
    <div>
      <ReportFilters range={range} onChange={setRange} csvHref={csvHref} />
      <p aria-live="polite">{message}</p>
      {data && (
        <>
          <div className="stat-row">
            <StatTile icon="scooter" value={data.totals.claimed} label="ไรเดอร์รับงาน" />
            <StatTile icon="checkCircle" value={data.totals.delivered} label="ส่งสำเร็จ" tone="success" />
            <StatTile icon="xCircle" value={data.totals.failed} label="ส่งไม่สำเร็จ" tone="danger" />
            <StatTile icon="chart" value={percent(data.totals.successRate)} label="อัตราส่งสำเร็จ" tone="success" />
            <StatTile icon="timer" value={minutes(data.totals.averageMinutes)} label="เวลาเฉลี่ยตั้งแต่รับยาถึงส่งสำเร็จ" />
          </div>
          {data.byRider.length === 0 ? <NoActivity /> : (
            <>
              <ReportSection title="ผลงานไรเดอร์">
                <table>
                  <thead><tr><th>ไรเดอร์</th><th>ประเภท</th><th className="num">รับงาน</th><th className="num">ส่งสำเร็จ</th><th className="num">ส่งไม่สำเร็จ</th><th className="num">อัตราสำเร็จ</th><th className="num">เวลาส่งเฉลี่ย</th></tr></thead>
                  <tbody>
                    {data.byRider.map((row) => (
                      <tr key={row.riderId}>
                        <td>
                          <button type="button" className="link-button" aria-pressed={riderId === row.riderId} onClick={() => setRiderId(riderId === row.riderId ? null : row.riderId)}>
                            {row.displayName}
                          </button>
                          {row.riderCode && <><br /><code>{row.riderCode}</code></>}
                        </td>
                        <td>{row.employmentCategory ? employmentLabels[row.employmentCategory] : '-'}</td>
                        <td className="num">{row.claimed}</td>
                        <td className={`num${row.delivered ? " outcome-delivered" : ""}`}>{row.delivered}</td>
                        <td className={`num${row.failed ? " outcome-failed" : ""}`}>{row.failed}</td>
                        <td className="num">{percent(row.successRate)}</td>
                        <td className="num">{minutes(row.averageMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">กดชื่อไรเดอร์เพื่อดูรายการงานในช่วงวันที่นี้</p>
              </ReportSection>
              {riderId && <RiderJobsPanel riderId={riderId} range={range} onClose={() => setRiderId(null)} />}
              <ReportSection title="แยกตามโซน">
                {data.byZone.length === 0 ? <p className="muted">ยังไม่มีงานที่ส่งเสร็จในช่วงนี้</p> : (
                  <table>
                    <thead><tr><th>ตำบล</th><th>โซน</th><th className="num">ส่งสำเร็จ</th><th className="num">ส่งไม่สำเร็จ</th><th className="num">อัตราสำเร็จ</th></tr></thead>
                    <tbody>
                      {data.byZone.map((row) => (
                        <tr key={`${row.subdistrictCode}-${row.zone}`}>
                          <td><code>{row.subdistrictCode}</code></td>
                          <td>{row.zone}</td>
                          <td className="num">{row.delivered}</td>
                          <td className="num">{row.failed}</td>
                          <td className="num">{percent(row.successRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ReportSection>
              <ReportSection title="สาเหตุที่ส่งไม่สำเร็จ">
                <FailureReasons reasons={data.failureReasons} />
              </ReportSection>
            </>
          )}
        </>
      )}
    </div>
  );
}

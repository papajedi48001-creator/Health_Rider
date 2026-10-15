'use client';

import { FailureReasons, NoActivity, percent, ReportFilters, ReportSection, StatTile, thaiDate, useReport } from '@/reports/report-kit';

type Counts = { confirmed: number; delivered: number; failed: number; returned: number };
type PharmacyReportData = {
  totals: Counts & { successRate: number | null };
  byDay: Array<Counts & { date: string }>;
  bySubdistrict: Array<Counts & { subdistrictCode: string; subdistrictName: string | null }>;
  failureReasons: Array<{ reason: string; count: number }>;
  backlog: { prepared: number; claimed: number; in_transit: number; return_required: number; sync_review: number };
};

export function PharmacyReport() {
  const { range, setRange, data, message, csvHref } = useReport<PharmacyReportData>('/api/reports/pharmacy');
  const active = data && data.totals.confirmed + data.totals.delivered + data.totals.failed + data.totals.returned > 0;

  return (
    <div>
      <ReportFilters range={range} onChange={setRange} csvHref={csvHref} />
      <p aria-live="polite">{message}</p>
      {data && (
        <>
          <ReportSection title="งานค้างตอนนี้">
            <div className="stat-row">
              <StatTile icon="package" value={data.backlog.prepared} label="เตรียมพัสดุแล้ว รอไรเดอร์" tone="info" />
              <StatTile icon="truck" value={data.backlog.claimed + data.backlog.in_transit} label="อยู่ระหว่างนำส่ง" tone="info" />
              <StatTile icon="undo" value={data.backlog.return_required} label="รอรับยาคืน" tone="warning" />
              <StatTile icon="alert" value={data.backlog.sync_review} label="รอผู้ประสานงานตรวจสอบ" tone="warning" />
            </div>
          </ReportSection>
          <ReportSection title="สรุปช่วงวันที่ที่เลือก">
            <div className="stat-row">
              <StatTile icon="clipboard" value={data.totals.confirmed} label="ยืนยันจาก HOSxP" />
              <StatTile icon="checkCircle" value={data.totals.delivered} label="ส่งสำเร็จ" tone="success" />
              <StatTile icon="xCircle" value={data.totals.failed} label="ส่งไม่สำเร็จ" tone="danger" />
              <StatTile icon="undo" value={data.totals.returned} label="รับยาคืนแล้ว" />
              <StatTile icon="chart" value={percent(data.totals.successRate)} label="อัตราส่งสำเร็จ" tone="success" />
            </div>
          </ReportSection>
          {!active ? <NoActivity /> : (
            <>
              <ReportSection title="รายวัน">
                <table>
                  <thead><tr><th>วันที่</th><th className="num">ยืนยันจาก HOSxP</th><th className="num">ส่งสำเร็จ</th><th className="num">ส่งไม่สำเร็จ</th><th className="num">รับยาคืน</th></tr></thead>
                  <tbody>
                    {data.byDay.map((day) => (
                      <tr key={day.date} className={day.confirmed + day.delivered + day.failed + day.returned === 0 ? 'row-quiet' : undefined}>
                        <td>{thaiDate(day.date)}</td>
                        <td className="num">{day.confirmed}</td>
                        <td className={`num${day.delivered ? " outcome-delivered" : ""}`}>{day.delivered}</td>
                        <td className={`num${day.failed ? " outcome-failed" : ""}`}>{day.failed}</td>
                        <td className="num">{day.returned}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th>รวม</th><th className="num">{data.totals.confirmed}</th><th className="num">{data.totals.delivered}</th><th className="num">{data.totals.failed}</th><th className="num">{data.totals.returned}</th></tr></tfoot>
                </table>
              </ReportSection>
              <ReportSection title="แยกตามตำบล">
                <table>
                  <thead><tr><th>ตำบล</th><th className="num">ยืนยันจาก HOSxP</th><th className="num">ส่งสำเร็จ</th><th className="num">ส่งไม่สำเร็จ</th><th className="num">รับยาคืน</th></tr></thead>
                  <tbody>
                    {data.bySubdistrict.map((row) => (
                      <tr key={row.subdistrictCode}>
                        <td>{row.subdistrictName ?? row.subdistrictCode}</td>
                        <td className="num">{row.confirmed}</td>
                        <td className="num">{row.delivered}</td>
                        <td className="num">{row.failed}</td>
                        <td className="num">{row.returned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

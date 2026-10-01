type PayoutExportLine = { riderCode: string; riderName: string; attemptId: string; zoneName: string; rateSatang: number };
export async function exportPayoutCsv(lines: PayoutExportLine[]): Promise<string> {
  const header = 'rider_code,rider_name,attempt_id,zone_name,rate_satang';
  return [header, ...lines.map((line) => [line.riderCode, line.riderName, line.attemptId, line.zoneName, line.rateSatang].map(escape).join(','))].join('\n');
}
function escape(value: string | number): string { const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

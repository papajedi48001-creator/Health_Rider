'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { resolveRate, type ServiceRateRecord } from '@/domain/delivery/service-rate';
import { callApi } from '@/lib/api-client';
import { bangkokDateString } from '@/lib/time';

type Zone = { id: string; subdistrictCode: string; subdistrictName: string | null; villageCode: string; displayName: string; active: boolean };
type Rate = { id: string; subdistrictCode: string; deliveryZoneId: string | null; rateSatang: number; effectiveFrom: string };

const baht = (satang: number) => (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (value: string) => new Date(value).toLocaleDateString('th-TH', { timeZone: 'UTC', dateStyle: 'medium' });

export function AdminRates() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [message, setMessage] = useState('');
  const [subdistrictCode, setSubdistrictCode] = useState('');

  const load = useCallback(async () => {
    const [zoneResult, rateResult] = await Promise.all([
      callApi<{ zones: Zone[] }>('/api/admin/zones'),
      callApi<{ rates: Rate[] }>('/api/admin/rates'),
    ]);
    if (!zoneResult.ok) return setMessage(zoneResult.message);
    if (!rateResult.ok) return setMessage(rateResult.message);
    setZones(zoneResult.data.zones);
    setRates(rateResult.data.rates);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const result = await callApi('/api/admin/rates', { json: Object.fromEntries(new FormData(formElement)) });
    if (!result.ok) return setMessage(result.message);
    await load();
    setMessage('บันทึกค่าบริการแล้ว งานที่ยืนยันก่อนหน้านี้ยังใช้อัตราเดิม');
  }

  const subdistricts = new Map<string, string>();
  for (const zone of zones) {
    if (!subdistricts.has(zone.subdistrictCode) || zone.subdistrictName) subdistricts.set(zone.subdistrictCode, zone.subdistrictName ?? `ตำบล ${zone.subdistrictCode}`);
  }
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const records: ServiceRateRecord[] = rates.map((rate) => ({ ...rate, effectiveFrom: new Date(rate.effectiveFrom) }));
  const today = new Date(`${bangkokDateString(new Date())}T00:00:00.000Z`);
  const shownZones = zones.filter((zone) => zone.active && (!subdistrictCode || zone.subdistrictCode === subdistrictCode));
  const shownRates = rates.filter((rate) => !subdistrictCode || rate.subdistrictCode === subdistrictCode);

  return (
    <section aria-labelledby="admin-rates">
      <h2 id="admin-rates">ค่าบริการต่อการส่ง</h2>
      <p>ตั้งได้ทั้งตำบลหรือรายโซน ถ้ามีทั้งสองแบบ ระบบจะใช้อัตราของโซนก่อน งานส่งยาจำอัตราที่ใช้อยู่ ณ วันที่เภสัชยืนยัน การแก้อัตราให้เพิ่มอัตราใหม่พร้อมวันเริ่มใช้</p>
      <p aria-live="polite">{message}</p>
      <form onSubmit={(event) => void create(event)} aria-label="เพิ่มค่าบริการ">
        <label>
          ตำบล
          <select name="subdistrictCode" required value={subdistrictCode} onChange={(event) => setSubdistrictCode(event.target.value)}>
            <option value="">เลือกตำบล</option>
            {[...subdistricts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          ใช้กับ
          <select name="deliveryZoneId" disabled={!subdistrictCode}>
            <option value="">ทั้งตำบล</option>
            {shownZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.displayName}</option>)}
          </select>
        </label>
        <label>ค่าบริการ (บาท) <input name="baht" required inputMode="decimal" pattern="\d{1,6}(\.\d{1,2})?" /></label>
        <label>วันเริ่มใช้ <input name="effectiveFrom" type="date" required defaultValue={bangkokDateString(new Date())} /></label>
        <button type="submit">บันทึกค่าบริการ</button>
      </form>
      {subdistrictCode && (
        <table>
          <caption>ค่าบริการที่ใช้วันนี้ ({subdistricts.get(subdistrictCode)})</caption>
          <thead><tr><th>โซน</th><th>บาท</th><th>มาจาก</th></tr></thead>
          <tbody>
            {shownZones.map((zone) => {
              const applied = resolveRate(records, zone, today);
              const fromZone = applied && records.some((rate) => rate.deliveryZoneId === zone.id && rate.effectiveFrom.getTime() === applied.rateEffectiveFrom.getTime());
              return (
                <tr key={zone.id}>
                  <td>{zone.displayName}</td>
                  <td>{applied ? baht(applied.rateSatang) : 'ยังไม่ได้ตั้ง'}</td>
                  <td>{applied ? `${fromZone ? 'อัตราโซน' : 'อัตราทั้งตำบล'} ตั้งแต่ ${thaiDate(applied.rateEffectiveFrom.toISOString())}` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <table>
        <caption>ประวัติค่าบริการ</caption>
        <thead><tr><th>ตำบล</th><th>ใช้กับ</th><th>บาท</th><th>เริ่มใช้</th></tr></thead>
        <tbody>
          {shownRates.map((rate) => (
            <tr key={rate.id}>
              <td>{subdistricts.get(rate.subdistrictCode) ?? rate.subdistrictCode}</td>
              <td>{rate.deliveryZoneId ? zoneById.get(rate.deliveryZoneId)?.displayName ?? '-' : 'ทั้งตำบล'}</td>
              <td>{baht(rate.rateSatang)}</td>
              <td>{thaiDate(rate.effectiveFrom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

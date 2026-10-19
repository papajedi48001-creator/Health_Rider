// HOSxP addresses read "154 หมู่ 2 ต.ปลาโหล ..."; the village name from hosp_moo_control goes right after the
// village number so riders know the place by name: "154 หมู่ 2 บ้านจิ๋ว ต.ปลาโหล ...". An address that already
// reads "บ้าน<name>" is left alone (a village often shares the subdistrict's name, so the bare name is not enough),
// and one without a village number gets the name at the end.
const villageNumber = /(หมู่(?:ที่)?|ม\.)\s*\d+/;

export function withVillageName(address: string, villageName: string | null | undefined): string {
  const name = villageName?.trim();
  if (!name || address.includes(`บ้าน${name}`)) return address;
  const match = villageNumber.exec(address);
  if (!match) return address.trim() ? `${address.trim()} บ้าน${name}` : address;
  const end = match.index + match[0].length;
  return `${address.slice(0, end)} บ้าน${name}${address.slice(end)}`;
}

export const villageKey = (subdistrictCode: string, villageCode: string) => `${subdistrictCode}/${villageCode}`;

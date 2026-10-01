import { PharmacyCandidateList } from '@/app/(staff)/pharmacy/candidates/pharmacy-candidate-list';

export default function PharmacyCandidatesPage() {
  return (
    <main>
      <h1>ผู้ป่วยที่รอยืนยันการส่งยาถึงบ้าน</h1>
      <p>รายการนี้อ่านจาก HOS แบบอ่านอย่างเดียว เภสัชกรต้องตรวจสอบยาและกดยืนยันก่อนสร้างงานจัดส่ง</p>
      <p>การยืนยันจะบันทึกโซนและอัตราค่าบริการ ณ วันที่สร้างงาน</p>
      <PharmacyCandidateList />
    </main>
  );
}

import { healthCenters } from '@/domain/admin/health-centers';

// Every account must name its รพ.สต., so the area of responsibility is always known.
export function HealthCenterSelect({ value }: { value?: string | null }) {
  return (
    <label>
      รพ.สต.
      <select name="healthCenter" required defaultValue={value ?? ''}>
        <option value="" disabled>เลือก รพ.สต.</option>
        {healthCenters.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
  );
}

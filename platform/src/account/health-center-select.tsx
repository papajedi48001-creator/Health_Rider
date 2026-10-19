'use client';

import { useEffect, useState } from 'react';
import { callApi } from '@/lib/api-client';

// Every account must name its รพ.สต., so the area of responsibility is always known; the list is kept on the settings page.
export function HealthCenterSelect({ value }: { value?: string | null }) {
  const [names, setNames] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState(value ?? '');

  useEffect(() => {
    let current = true;
    void callApi<{ names: string[] }>('/api/health-centers').then((result) => {
      if (!current) return;
      const loaded = result.ok ? result.data.names : [];
      setNames(loaded);
      setChosen((previous) => (loaded.includes(previous) ? previous : ''));
    });
    return () => { current = false; };
  }, []);

  // A name since removed from the list is not offered, so the form asks for a current one.
  const options = names ?? [];
  return (
    <label>
      รพ.สต.
      <select name="healthCenter" required value={chosen} onChange={(event) => setChosen(event.target.value)} disabled={names === null}>
        <option value="" disabled>{names === null ? 'กำลังโหลดรายชื่อ' : 'เลือก รพ.สต.'}</option>
        {options.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
  );
}

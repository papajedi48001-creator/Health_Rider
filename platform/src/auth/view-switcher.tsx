'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminViews, viewLabels, type AdminView } from '@/auth/view-as';
import { callApi } from '@/lib/api-client';

// Shown to admins only: picks whose menu to show and opens that role's first page.
export function ViewSwitcher({ view }: { view: AdminView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchTo(next: string) {
    setBusy(true);
    const result = await callApi<{ home: string }>('/api/me/view', { json: { view: next } });
    setBusy(false);
    if (!result.ok) return window.alert(result.message);
    router.push(result.data.home);
    router.refresh();
  }

  return (
    <label className="view-switcher">
      มุมมองเมนู
      <select value={view} disabled={busy} onChange={(event) => void switchTo(event.target.value)}>
        {adminViews.map((option) => <option key={option} value={option}>{viewLabels[option]}</option>)}
      </select>
    </label>
  );
}

'use client';

import { useState } from 'react';

export default function RiderScanPage() {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('สแกน QR ที่พัสดุเพื่อรับงาน');

  async function claim() {
    const response = await fetch('/api/rider/claims', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
    });
    setMessage(response.ok ? 'รับงานสำเร็จ' : (await response.json() as { message: string }).message);
  }

  return <main><h1>รับงานด้วย QR</h1><p>{message}</p><input aria-label="QR token" value={token} onChange={(event) => setToken(event.target.value)} /><button type="button" onClick={() => void claim()}>รับงาน</button></main>;
}

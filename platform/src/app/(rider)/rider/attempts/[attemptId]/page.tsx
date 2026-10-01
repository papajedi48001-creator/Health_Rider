'use client';

import { useEffect, useState } from 'react';
import { OfflineQueue, type OfflineEvent } from '@/pwa/offline-queue';
import { deleteOfflineEvent, loadOfflineEvents, saveOfflineEvent } from '@/pwa/indexeddb-store';

const queue = new OfflineQueue();

export default function RiderAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const [message, setMessage] = useState('บันทึกรับยาหรือส่งยาได้แม้ไม่มีสัญญาณ');

  useEffect(() => {
    void loadOfflineEvents().then(async (events) => {
      for (const event of events) await queue.enqueue(event);
    });
  }, []);

  async function record(eventType: 'picked_up' | 'delivered') {
    const { attemptId } = await params;
    const event: OfflineEvent = { eventUuid: crypto.randomUUID(), attemptId, deliveryVersion: 1, eventType, deviceCapturedAt: new Date().toISOString(), payload: {} };
    await queue.enqueue(event);
    await saveOfflineEvent(event);
    if (navigator.onLine) {
      const summary = await queue.sync({ send: async (queued) => {
        const response = await fetch('/api/rider/sync-events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(queued) });
        return { acknowledged: response.ok };
      } });
      await Promise.all(summary.acknowledgedEventUuids.map((eventUuid) => deleteOfflineEvent(eventUuid)));
    }
    setMessage(navigator.onLine ? 'บันทึกและส่งข้อมูลแล้ว' : 'บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์');
  }

  return <main><h1>บันทึกงานจัดส่ง</h1><p aria-live="polite">{message}</p><button type="button" onClick={() => void record('picked_up')}>บันทึกรับยา</button><button type="button" onClick={() => void record('delivered')}>บันทึกส่งยา</button></main>;
}

import type { OfflineEvent } from '@/pwa/offline-queue';
import { createOfflineKey, decryptOfflinePayload, encryptOfflinePayload } from '@/pwa/crypto';

const databaseName = 'health-rider-offline';
const storeName = 'events';

export async function saveOfflineEvent(event: OfflineEvent): Promise<void> {
  const key = await getOfflineKey();
  const encrypted = await encryptOfflinePayload(event.payload, key);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({ ...event, payload: { encrypted } });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadOfflineEvents(): Promise<OfflineEvent[]> {
  const key = await getOfflineKey();
  const database = await openDatabase();
  const records = await new Promise<Array<OfflineEvent & { payload: { encrypted: { iv: string; ciphertext: string } } }>>((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return Promise.all(records.map(async (record) => ({ ...record, payload: await decryptOfflinePayload(record.payload.encrypted, key) })));
}

async function getOfflineKey(): Promise<CryptoKey> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('keys', 'readwrite');
    const store = transaction.objectStore('keys');
    const request = store.get('device');
    request.onsuccess = async () => {
      if (request.result) return resolve(request.result as CryptoKey);
      const key = await createOfflineKey(); store.put(key, 'device'); resolve(key);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteOfflineEvent(eventUuid: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(eventUuid);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName, { keyPath: 'eventUuid' }); request.result.createObjectStore('keys'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

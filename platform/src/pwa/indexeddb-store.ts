import type { OfflineEvent, OfflineEventStore } from '@/pwa/offline-queue';
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

// The key is generated outside the IndexedDB transaction: awaiting WebCrypto inside one lets it
// auto-commit before the key is written.
async function getOfflineKey(): Promise<CryptoKey> {
  const database = await openDatabase();
  const existing = await readKey(database);
  if (existing) return existing;
  const key = await createOfflineKey();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('keys', 'readwrite');
    transaction.objectStore('keys').add(key, 'device');
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => {
      // Another tab stored a key first; use that one.
      if (transaction.error?.name === 'ConstraintError') { event.preventDefault(); resolve(); } else reject(transaction.error);
    };
  });
  return (await readKey(database)) ?? key;
}

function readKey(database: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const request = database.transaction('keys').objectStore('keys').get('device');
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
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

const viewStoreName = 'attemptViews';

// Keeps the Rider Delivery View of a claimed attempt, encrypted, so the rider can still read the
// address and record events without signal. It is removed once the attempt is no longer active.
export async function saveAttemptView(attemptId: string, view: Record<string, unknown>): Promise<void> {
  const key = await getOfflineKey();
  const encrypted = await encryptOfflinePayload(view, key);
  await writeStore(viewStoreName, (store) => store.put({ attemptId, encrypted }));
}

export async function loadAttemptView(attemptId: string): Promise<Record<string, unknown> | null> {
  const key = await getOfflineKey();
  const database = await openDatabase();
  const record = await new Promise<{ encrypted: { iv: string; ciphertext: string } } | undefined>((resolve, reject) => {
    const request = database.transaction(viewStoreName).objectStore(viewStoreName).get(attemptId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return record ? decryptOfflinePayload(record.encrypted, key) : null;
}

export async function deleteAttemptView(attemptId: string): Promise<void> {
  await writeStore(viewStoreName, (store) => store.delete(attemptId));
}

async function writeStore(name: string, write: (store: IDBObjectStore) => void): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(name, 'readwrite');
    write(transaction.objectStore(name));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'eventUuid' });
      if (!database.objectStoreNames.contains('keys')) database.createObjectStore('keys');
      if (!database.objectStoreNames.contains(viewStoreName)) database.createObjectStore(viewStoreName, { keyPath: 'attemptId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const indexedDbOfflineEventStore: OfflineEventStore = {
  load: loadOfflineEvents,
  save: saveOfflineEvent,
  remove: deleteOfflineEvent,
};

// Removes every offline record, its encryption key and the cached rider pages from this device.
export async function clearOfflineData(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Another tab still has the database open; it is deleted once that tab closes.
    request.onblocked = () => resolve();
  });
  if ('caches' in globalThis) {
    for (const name of await caches.keys()) await caches.delete(name);
  }
}

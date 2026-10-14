import { expect, test } from 'vitest';
import { createOfflineKey, decryptOfflinePayload, encryptOfflinePayload } from '@/pwa/crypto';

test('encrypts offline evidence without retaining plaintext in the stored value', async () => {
  const key = await createOfflineKey();
  const encrypted = await encryptOfflinePayload({ relation: 'ผู้รับยา' }, key);
  expect(JSON.stringify(encrypted)).not.toContain('ผู้รับยา');
  await expect(decryptOfflinePayload(encrypted, key)).resolves.toEqual({ relation: 'ผู้รับยา' });
});

test('round-trips a payload the size of a real evidence photo', async () => {
  const key = await createOfflineKey();
  const photo = `data:image/jpeg;base64,${'A'.repeat(2_000_000)}`;
  const encrypted = await encryptOfflinePayload({ recipientRelation: 'self', photo }, key);
  await expect(decryptOfflinePayload(encrypted, key)).resolves.toEqual({ recipientRelation: 'self', photo });
});

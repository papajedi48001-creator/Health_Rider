import { expect, test } from 'vitest';
import { createOfflineKey, decryptOfflinePayload, encryptOfflinePayload } from '@/pwa/crypto';

test('encrypts offline evidence without retaining plaintext in the stored value', async () => {
  const key = await createOfflineKey();
  const encrypted = await encryptOfflinePayload({ relation: 'ผู้รับยา' }, key);
  expect(JSON.stringify(encrypted)).not.toContain('ผู้รับยา');
  await expect(decryptOfflinePayload(encrypted, key)).resolves.toEqual({ relation: 'ผู้รับยา' });
});

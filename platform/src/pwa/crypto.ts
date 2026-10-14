export async function encryptOfflinePayload(payload: Record<string, unknown>, key: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
}

export async function createOfflineKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function decryptOfflinePayload(encrypted: { iv: string; ciphertext: string }, key: CryptoKey): Promise<Record<string, unknown>> {
  const iv = fromBase64(encrypted.iv) as unknown as BufferSource;
  const ciphertext = fromBase64(encrypted.ciphertext) as unknown as BufferSource;
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, unknown>;
}

// Converts in chunks: spreading a whole evidence photo into one fromCharCode call overflows the call stack.
function toBase64(value: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

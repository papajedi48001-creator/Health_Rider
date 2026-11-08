// The vendor's Ed25519 public key (base64 SPKI DER), printed by `node license-tool/hr-license.mjs keygen`.
// Empty means licensing is not switched on yet and the app runs without license checks. It is compiled in on
// purpose: a key read from .env would let anyone sign their own license.
export const licensePublicKey = '';

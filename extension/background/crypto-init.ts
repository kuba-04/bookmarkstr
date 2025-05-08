/**
 * This file initializes cryptographic functions needed by the secp256k1 library.
 * It must be imported before any code that uses secp256k1 for signing.
 */

import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

// Initialize HMAC-SHA256 for secp256k1
(secp as any).etc = (secp as any).etc || {};
(secp as any).etc.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]): Uint8Array => {
  const h = hmac.create(sha256, key);
  messages.forEach(msg => h.update(msg));
  return h.digest();
};

// Export the configured libraries
export { secp };

console.log('[Crypto] Cryptographic functions initialized', 
  typeof (secp as any).etc.hmacSha256Sync === 'function' ? 'successfully' : 'FAILED'); 
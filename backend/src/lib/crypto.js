import crypto from 'crypto';
import config from '../config/env.js';

// AES-256-GCM. The key comes from ENCRYPTION_KEY (64 hex chars = 32 bytes).
// CRITICAL: if this key ever changes, everything encrypted with the old key
// becomes permanently undecryptable. Generate once, back it up, never rotate
// casually. We fail fast here so a missing/wrong key surfaces at boot.
const KEY = (() => {
  const hex = config.encryptionKey;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
})();

const IV_LEN = 12; // GCM standard

// Returns "ivHex:authTagHex:cipherHex". Returns null/'' unchanged so callers
// can store optional secrets without special-casing.
export function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload) {
  if (payload == null || payload === '') return payload;
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return dec.toString('utf8');
}

export default { encrypt, decrypt };

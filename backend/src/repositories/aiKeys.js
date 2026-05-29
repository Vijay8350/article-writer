import { query } from '../db/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';

// Returns the user's optional AI key overrides, DECRYPTED. Null when unset.
export async function getKeys(userId) {
  const { rows } = await query(
    'SELECT gemini_key_encrypted, deepseek_key_encrypted FROM ai_credentials WHERE user_id = $1',
    [userId]
  );
  if (rows.length === 0) return { geminiKey: null, deepseekKey: null };
  return {
    geminiKey: rows[0].gemini_key_encrypted ? decrypt(rows[0].gemini_key_encrypted) : null,
    deepseekKey: rows[0].deepseek_key_encrypted ? decrypt(rows[0].deepseek_key_encrypted) : null,
  };
}

// Whether each key is present, without decrypting (for display).
export async function getKeyPresence(userId) {
  const { rows } = await query(
    'SELECT gemini_key_encrypted, deepseek_key_encrypted FROM ai_credentials WHERE user_id = $1',
    [userId]
  );
  if (rows.length === 0) return { hasGemini: false, hasDeepseek: false };
  return {
    hasGemini: !!rows[0].gemini_key_encrypted,
    hasDeepseek: !!rows[0].deepseek_key_encrypted,
  };
}

// Saves/updates keys. Pass undefined to leave a key unchanged; pass '' to clear it.
export async function saveKeys(userId, { geminiKey, deepseekKey }) {
  const gemEnc = geminiKey === undefined ? undefined : (geminiKey ? encrypt(geminiKey) : null);
  const deepEnc = deepseekKey === undefined ? undefined : (deepseekKey ? encrypt(deepseekKey) : null);

  await query(
    `INSERT INTO ai_credentials (user_id, gemini_key_encrypted, deepseek_key_encrypted)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       gemini_key_encrypted   = COALESCE($2, ai_credentials.gemini_key_encrypted),
       deepseek_key_encrypted = COALESCE($3, ai_credentials.deepseek_key_encrypted),
       updated_at = now()`,
    [userId, gemEnc === undefined ? null : gemEnc, deepEnc === undefined ? null : deepEnc]
  );
}

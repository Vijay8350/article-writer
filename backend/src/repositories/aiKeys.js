import { query } from '../db/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';

export async function getKeys(workspaceId) {
  const { rows } = await query(
    'SELECT gemini_key_encrypted, deepseek_key_encrypted FROM ai_credentials WHERE workspace_id = $1',
    [workspaceId]
  );
  if (rows.length === 0) return { geminiKey: null, deepseekKey: null };
  return {
    geminiKey: rows[0].gemini_key_encrypted ? decrypt(rows[0].gemini_key_encrypted) : null,
    deepseekKey: rows[0].deepseek_key_encrypted ? decrypt(rows[0].deepseek_key_encrypted) : null,
  };
}

export async function getKeyPresence(workspaceId) {
  const { rows } = await query(
    'SELECT gemini_key_encrypted, deepseek_key_encrypted FROM ai_credentials WHERE workspace_id = $1',
    [workspaceId]
  );
  if (rows.length === 0) return { hasGemini: false, hasDeepseek: false };
  return {
    hasGemini: !!rows[0].gemini_key_encrypted,
    hasDeepseek: !!rows[0].deepseek_key_encrypted,
  };
}

// Pass undefined to leave a key unchanged; pass a value to set it.
export async function saveKeys(workspaceId, { geminiKey, deepseekKey }) {
  const gemEnc = geminiKey === undefined ? null : (geminiKey ? encrypt(geminiKey) : null);
  const deepEnc = deepseekKey === undefined ? null : (deepseekKey ? encrypt(deepseekKey) : null);

  await query(
    `INSERT INTO ai_credentials (workspace_id, gemini_key_encrypted, deepseek_key_encrypted)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id) DO UPDATE SET
       gemini_key_encrypted   = COALESCE($2, ai_credentials.gemini_key_encrypted),
       deepseek_key_encrypted = COALESCE($3, ai_credentials.deepseek_key_encrypted),
       updated_at = now()`,
    [workspaceId, gemEnc, deepEnc]
  );
}

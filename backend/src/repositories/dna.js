import { query } from '../db/index.js';

// Returns the user's Business DNA jsonb, or null.
export async function getDna(userId) {
  const { rows } = await query('SELECT data FROM business_dna WHERE user_id = $1', [userId]);
  return rows.length ? rows[0].data : null;
}

export async function saveDna(userId, storeId, data) {
  await query(
    `INSERT INTO business_dna (user_id, store_id, data, fetched_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET
       store_id = $2, data = $3, fetched_at = now()`,
    [userId, storeId || null, data]
  );
}

export async function deleteDna(userId) {
  await query('DELETE FROM business_dna WHERE user_id = $1', [userId]);
}

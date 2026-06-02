import { query } from '../db/index.js';

export async function getDna(workspaceId) {
  const { rows } = await query('SELECT data FROM business_dna WHERE workspace_id = $1', [workspaceId]);
  return rows.length ? rows[0].data : null;
}

export async function saveDna(workspaceId, storeId, data) {
  await query(
    `INSERT INTO business_dna (workspace_id, store_id, data, fetched_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (workspace_id) DO UPDATE SET
       store_id = $2, data = $3, fetched_at = now()`,
    [workspaceId, storeId || null, data]
  );
}

export async function deleteDna(workspaceId) {
  await query('DELETE FROM business_dna WHERE workspace_id = $1', [workspaceId]);
}

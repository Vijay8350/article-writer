// One-time migration of the old single-tenant data into a real account.
// Creates a superadmin user (ADMIN_EMAIL / ADMIN_PASSWORD), ensures they own a
// personal workspace, and imports the legacy .env Shopify creds + cached
// backend/src/data/businessDna.json into that workspace.
// Safe to re-run: idempotent at every step.
//
//   ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=secret123 npm run seed:legacy
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { pool, query } from './index.js';
import config from '../config/env.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';
import * as workspaces from '../repositories/workspaces.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dnaPath = resolve(__dirname, '../data/businessDna.json');

async function run() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running this seed.');
  }

  // 1. Upsert superadmin
  let { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
  let userId;
  if (rows.length) {
    userId = rows[0].id;
    await query("UPDATE users SET role = 'superadmin', status = 'active' WHERE id = $1", [userId]);
    console.log(`  ✅ superadmin exists: ${email}`);
  } else {
    const hash = await bcrypt.hash(password, 10);
    const ins = await query(
      "INSERT INTO users (email, password_hash, name, role, status) VALUES ($1, $2, 'Admin', 'superadmin', 'active') RETURNING id",
      [email, hash]
    );
    userId = ins.rows[0].id;
    console.log(`  ✅ created superadmin: ${email}`);
  }

  // 2. Find or create a personal workspace
  const { rows: wsRows } = await query(
    `SELECT w.id FROM workspaces w
       JOIN memberships m ON m.workspace_id = w.id
      WHERE m.user_id = $1
      ORDER BY w.created_at ASC LIMIT 1`,
    [userId]
  );
  let workspaceId;
  if (wsRows.length) {
    workspaceId = wsRows[0].id;
    console.log('  ✅ workspace exists');
  } else {
    const ws = await workspaces.createForOwner(userId, "Admin's Workspace");
    workspaceId = ws.id;
    console.log(`  ✅ created workspace: ${ws.name}`);
  }

  // 3. Import legacy Shopify creds from .env (if present and workspace has no store)
  if (config.shopify.legacyStoreUrl && config.shopify.legacyAccessToken) {
    const existing = await stores.getStoreMeta(workspaceId);
    if (!existing) {
      await stores.upsertStore(workspaceId, config.shopify.legacyStoreUrl, config.shopify.legacyAccessToken, null);
      console.log(`  ✅ imported legacy Shopify store: ${config.shopify.legacyStoreUrl}`);
    } else {
      console.log('  ⏭️  workspace already has a store — skipping legacy import');
    }
  } else {
    console.log('  ⏭️  no legacy SHOPIFY_STORE_URL/ACCESS_TOKEN in .env — skipping');
  }

  // 4. Import legacy Business DNA json
  if (existsSync(dnaPath)) {
    try {
      const raw = readFileSync(dnaPath, 'utf-8').trim();
      if (raw) {
        const dna = JSON.parse(raw);
        const existing = await dnaRepo.getDna(workspaceId);
        if (!existing) {
          await dnaRepo.saveDna(workspaceId, null, dna);
          console.log('  ✅ imported legacy businessDna.json');
        } else {
          console.log('  ⏭️  workspace already has Business DNA — skipping');
        }
      }
    } catch (e) {
      console.warn(`  ⚠️ could not import businessDna.json: ${e.message}`);
    }
  } else {
    console.log('  ⏭️  no businessDna.json found — skipping');
  }

  console.log('✅ legacy seed complete');
}

run()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Legacy seed failed:', err.message);
    pool.end().finally(() => process.exit(1));
  });

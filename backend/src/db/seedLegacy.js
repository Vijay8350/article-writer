// One-time migration of the old single-tenant data into a real user account.
// Creates an admin user (ADMIN_EMAIL / ADMIN_PASSWORD), then imports the legacy
// .env Shopify creds and backend/src/data/businessDna.json into that user's rows.
// Safe to re-run: it upserts and skips anything already present / missing.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const dnaPath = resolve(__dirname, '../data/businessDna.json');

async function run() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this seed.');
  }

  // 1. Upsert admin user
  let { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
  let userId;
  if (rows.length) {
    userId = rows[0].id;
    await query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
    console.log(`  ✅ admin user exists: ${email}`);
  } else {
    const hash = await bcrypt.hash(password, 10);
    const ins = await query(
      "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Admin', 'admin') RETURNING id",
      [email, hash]
    );
    userId = ins.rows[0].id;
    console.log(`  ✅ created admin user: ${email}`);
  }

  // 2. Import legacy Shopify creds from .env
  if (config.shopify.legacyStoreUrl && config.shopify.legacyAccessToken) {
    const existing = await stores.getStoreMeta(userId);
    if (!existing) {
      await stores.upsertStore(userId, config.shopify.legacyStoreUrl, config.shopify.legacyAccessToken, null);
      console.log(`  ✅ imported legacy Shopify store: ${config.shopify.legacyStoreUrl}`);
    } else {
      console.log('  ⏭️  admin already has a store — skipping legacy store import');
    }
  } else {
    console.log('  ⏭️  no legacy SHOPIFY_STORE_URL/ACCESS_TOKEN in .env — skipping');
  }

  // 3. Import legacy Business DNA json
  if (existsSync(dnaPath)) {
    try {
      const raw = readFileSync(dnaPath, 'utf-8').trim();
      if (raw) {
        const dna = JSON.parse(raw);
        const existing = await dnaRepo.getDna(userId);
        if (!existing) {
          await dnaRepo.saveDna(userId, null, dna);
          console.log('  ✅ imported legacy businessDna.json');
        } else {
          console.log('  ⏭️  admin already has Business DNA — skipping json import');
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

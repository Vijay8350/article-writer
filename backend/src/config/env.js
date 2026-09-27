import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const config = {
  port: parseInt(process.env.PORT || '5001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  },

  // 64-hex (32 bytes) key for AES-256-GCM. Used from Phase 2 to encrypt per-user secrets.
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  shopify: {
    apiVersion: '2024-01',
    // Legacy single-tenant creds — kept only so the Phase 2 migration can move them
    // into the admin user's DB row. New code must use per-user credentials.
    legacyStoreUrl: process.env.SHOPIFY_STORE_URL || '',
    legacyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
  },

  // Platform fallback AI keys (used when a user hasn't supplied their own).
  // Accept both PLATFORM_* and the original names so existing .env files keep working.
  deepseek: {
    apiKey: process.env.PLATFORM_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  },

  instagram: {
    // Graph API v25.0 is supported until 2028-07-29.
    apiVersion: process.env.INSTAGRAM_API_VERSION || 'v25.0',
  },

  gemini: {
    apiKey: process.env.PLATFORM_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    // gemini-2.0-flash was shut down 2026-06-01. Override via GEMINI_MODEL when Google retires this one.
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  },
};

export default config;

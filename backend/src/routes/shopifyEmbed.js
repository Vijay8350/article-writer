import { readFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import config from '../config/env.js';
import { normalizeShop, frameAncestors } from '../lib/shopifyAuth.js';

// GET /shopify and /shopify/* — the page the Shopify admin loads in its iframe (built by
// Vite as frontend/dist/shopify.html, with App Bridge). Served here rather than by nginx
// so the framing rule can name the one shop that's opening it, as Shopify requires:
//   Content-Security-Policy: frame-ancestors https://<shop>.myshopify.com https://admin.shopify.com
const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(resolve(__dirname, '../../../frontend/dist'), 'shopify.html');
let cached = null;

export async function serveEmbeddedApp(req, res) {
  try {
    const html = (config.nodeEnv === 'production' && cached) || (cached = await readFile(PAGE, 'utf8'));
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', frameAncestors(normalizeShop(req.query.shop)));
    res.setHeader('Cache-Control', 'no-store');
    // The app's client ID is public (App Bridge reads it from this meta tag).
    res.type('html').send(html.replace('__SHOPIFY_API_KEY__', config.shopify.clientId || ''));
  } catch {
    res.status(503).type('text').send('The Shopify app page has not been built on this server yet.');
  }
}

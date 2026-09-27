import axios from 'axios';
import { safeAxiosConfig } from '../lib/safeHttp.js';

// Public (no-token) Shopify storefront reads: /meta.json and /products.json.
// Works for any Shopify store that isn't password-protected.

const http = axios.create({
  ...safeAxiosConfig, // user-supplied URLs: block private/metadata addresses, incl. on redirects
  timeout: 30000,
  headers: { 'User-Agent': 'ArticleWriter-Autopost/1.0', Accept: 'application/json' },
});

export function normalizeSiteUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw Object.assign(new Error('Website URL is required'), { status: 400 });
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  return `https://${url.hostname.toLowerCase()}`;
}

// Resolves a store's canonical URL (custom domain), name and currency.
export async function getStoreInfo(siteUrl) {
  const base = normalizeSiteUrl(siteUrl);
  try {
    const { data } = await http.get(`${base}/meta.json`);
    if (data?.myshopify_domain) {
      return { url: normalizeSiteUrl(data.url || data.domain || base), name: data.name || null, currency: data.currency || null };
    }
  } catch { /* fall through to the products.json probe */ }
  try {
    const res = await http.get(`${base}/products.json`, { params: { limit: 1 } });
    if (Array.isArray(res.data?.products)) {
      const finalHost = new URL(res.request?.res?.responseUrl || base).hostname;
      return { url: `https://${finalHost}`, name: finalHost, currency: null };
    }
  } catch { /* handled below */ }
  throw Object.assign(
    new Error(`Couldn't read products from ${base}. It must be a Shopify store that isn't password-protected.`),
    { status: 400 }
  );
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

// All products (up to 10k), trimmed to what posting needs so memory stays small.
export async function getProducts(siteUrl) {
  const products = [];
  for (let page = 1; page <= 40; page++) {
    const { data } = await http.get(`${siteUrl}/products.json`, { params: { limit: 250, page } });
    const batch = data?.products || [];
    for (const p of batch) {
      const variant = p.variants?.[0] || {};
      products.push({
        id: String(p.id),
        title: p.title,
        handle: p.handle,
        createdAt: p.created_at,
        productType: p.product_type || '',
        vendor: p.vendor || '',
        tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
        description: stripHtml(p.body_html).slice(0, 1200),
        price: variant.price || null,
        compareAtPrice: variant.compare_at_price || null,
        available: (p.variants || []).some((v) => v.available),
        images: (p.images || []).map((i) => i.src).filter(Boolean).slice(0, 10),
        url: `${siteUrl}/products/${p.handle}`,
      });
    }
    if (batch.length < 250) break;
  }
  return products;
}

// Instagram only accepts JPEG within 4:5–1.91:1. Shopify's CDN converts on the
// fly: fit into 1080×1080, pad with white (nothing cropped), serve as JPEG.
export function instagramImageUrl(src) {
  const url = new URL(src.startsWith('//') ? `https:${src}` : src);
  if (!url.hostname.endsWith('cdn.shopify.com') && !url.pathname.includes('/cdn/shop/')) return url.toString();
  url.searchParams.set('width', '1080');
  url.searchParams.set('height', '1080');
  url.searchParams.set('pad_color', 'ffffff');
  url.searchParams.set('format', 'jpg');
  return url.toString();
}

export function formatPrice(amount, currency) {
  if (amount == null) return null;
  const n = Number(amount);
  if (!currency) return n.toLocaleString('en-IN');
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

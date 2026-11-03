import axios from 'axios';
import * as shopify from './shopify.js';
import * as repo from '../repositories/seo.js';
import { safeAxiosConfig } from '../lib/safeHttp.js';

// Review stars in Google: the product's structured data with its review rating, added to
// the live theme through a small snippet of our own. The theme file is saved first, a real
// product page is checked afterwards, and the theme is put back by itself if that page
// doesn't come out right. The change is listed under Changes made, where Undo restores it.

const SNIPPET = 'snippets/aw-product-rating.liquid';
const RENDER_TAG = "{%- render 'aw-product-rating', product: product -%}";
const STRUCTURED_DATA_RE = /\{\{-?\s*product\s*\|\s*structured_data\s*-?\}\}/;
const MAX_SECTIONS_SCANNED = 8;
const VERIFY_ATTEMPTS = 4;
const VERIFY_PAUSE_MS = 4000;

const SNIPPET_BODY = `{%- comment -%}
  Added by Article Writer SEO: this product's structured data plus its review rating, from
  Shopify's reviews.rating and reviews.rating_count (review apps such as Judge.me keep
  these up to date), so Google can show stars. Undo it under SEO → Changes made.
{%- endcomment -%}
{%- capture aw_data -%}{{ product | structured_data }}{%- endcapture -%}
{%- assign aw_rating = product.metafields.reviews.rating.value -%}
{%- assign aw_count = product.metafields.reviews.rating_count.value | default: 0 -%}
{%- if aw_rating != blank and aw_count > 0 -%}
  {%- assign aw_type = '"@type":"Product",' -%}
  {%- if aw_data contains '"@type":"ProductGroup",' -%}
    {%- assign aw_type = '"@type":"ProductGroup",' -%}
  {%- endif -%}
  {%- capture aw_rating_json -%}{{ aw_type }}"aggregateRating":{"@type":"AggregateRating","ratingValue":{{ aw_rating.rating | json }},"bestRating":{{ aw_rating.scale_max | json }},"worstRating":{{ aw_rating.scale_min | json }},"reviewCount":{{ aw_count | json }}},{%- endcapture -%}
  {%- assign aw_data = aw_data | replace_first: aw_type, aw_rating_json -%}
{%- endif -%}
{{- aw_data -}}
`;

const http = axios.create({ ...safeAxiosConfig, timeout: 20000, responseType: 'text', validateStatus: () => true, headers: { 'User-Agent': 'ArticleWriter-SeoAudit/1.0' } });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const refuse = (message, status = 400) => Object.assign(new Error(message), { status });

// The theme file that prints the product's structured data, and whether ours is already in.
async function findSection(creds, themeId) {
  const keys = (await shopify.listThemeAssetKeys(creds, themeId)).filter((k) => /^sections\/.*product.*\.liquid$/.test(k));
  const ordered = ['sections/main-product.liquid', ...keys.filter((k) => k !== 'sections/main-product.liquid')].slice(0, MAX_SECTIONS_SCANNED);
  for (const key of ordered) {
    const asset = await shopify.getThemeAsset(creds, themeId, key);
    if (!asset?.value) continue;
    if (asset.value.includes(RENDER_TAG)) return { key, installed: true };
    if (STRUCTURED_DATA_RE.test(asset.value)) return { key, installed: false };
  }
  return null;
}

// What a product page tells Google right now.
async function readProductData(domain, handle) {
  const res = await http.get(`https://${domain}/products/${handle}`, { params: { aw_check: Date.now() } });
  const html = String(res.data || '');
  if (res.status !== 200) return { ok: false, reason: `the page answered ${res.status}` };
  if (/Liquid (?:syntax )?error/i.test(html)) return { ok: false, reason: 'the theme showed a Liquid error' };
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
  for (const block of blocks) {
    let data;
    try { data = JSON.parse(block); } catch { if (/"@type"\s*:\s*"Product(?:Group)?"/.test(block)) return { ok: false, reason: 'the product data is no longer valid JSON' }; continue; }
    const items = Array.isArray(data) ? data : data['@graph'] || [data];
    const product = items.find((i) => i?.['@type'] === 'Product' || i?.['@type'] === 'ProductGroup');
    if (product) return { ok: true, rating: product.aggregateRating || null };
  }
  return { ok: false, reason: 'no product data was found on the page' };
}

const MESSAGES = {
  no_permission: 'Your Shopify connection needs the read_themes and write_themes permissions. Add them to the app in Shopify, then try again.',
  unsupported: "Your theme prints product data in a way this can't change safely. A developer can add the rating by hand.",
  no_reviews: 'None of your products has reviews in Shopify yet. Once a review app records some, stars can be added.',
  present: 'Your product pages already give Google their review rating.',
  installed: 'Review stars are already set up.',
};

export async function ratingStatus(creds, domain) {
  const scopes = await shopify.getAccessScopes(creds);
  if (!scopes.includes('write_themes') || !scopes.includes('read_themes')) return { state: 'no_permission', message: MESSAGES.no_permission };
  const theme = await shopify.getMainTheme(creds);
  if (!theme) return { state: 'unsupported', message: MESSAGES.unsupported };
  const section = await findSection(creds, theme.id);
  if (!section) return { state: 'unsupported', theme: theme.name, message: MESSAGES.unsupported };
  if (section.installed) return { state: 'installed', theme: theme.name, message: MESSAGES.installed };

  const products = [...(await shopify.getProductSeoAndReviews(creds)).values()].filter((p) => p.active && p.reviewCount > 0);
  if (!products.length) return { state: 'no_reviews', theme: theme.name, message: MESSAGES.no_reviews };
  const sample = products.sort((a, b) => b.reviewCount - a.reviewCount)[0];
  const now = await readProductData(domain, sample.handle);
  if (now.ok && now.rating) return { state: 'present', theme: theme.name, message: MESSAGES.present };
  return { state: 'available', theme: theme.name, file: section.key, handle: sample.handle, reviewed: products.length };
}

export async function installRating(workspaceId, creds, domain) {
  const status = await ratingStatus(creds, domain);
  if (status.state !== 'available') throw refuse(status.message);
  const theme = await shopify.getMainTheme(creds);
  const original = await shopify.getThemeAsset(creds, theme.id, status.file);
  const updated = original.value.replace(STRUCTURED_DATA_RE, RENDER_TAG);

  const restore = async () => {
    await shopify.putThemeAsset(creds, theme.id, status.file, original.value);
    await shopify.deleteThemeAsset(creds, theme.id, SNIPPET).catch(() => {});
  };
  try {
    await shopify.putThemeAsset(creds, theme.id, SNIPPET, SNIPPET_BODY);
    await shopify.putThemeAsset(creds, theme.id, status.file, updated);
  } catch (err) {
    await restore().catch(() => {});
    throw refuse(`Shopify refused the theme change: ${err.response?.data?.errors ? JSON.stringify(err.response.data.errors) : err.message}`, 502);
  }

  let check = { ok: false, reason: 'the page could not be read' };
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt++) {
    await pause(VERIFY_PAUSE_MS);
    check = await readProductData(domain, status.handle).catch((err) => ({ ok: false, reason: err.message }));
    if (check.ok && check.rating) break;
  }
  if (!check.ok || !check.rating) {
    await restore();
    throw refuse(`The product page didn't come out right (${check.reason || 'no rating appeared'}), so your theme was put back exactly as it was.`, 502);
  }

  await repo.logChange(workspaceId, {
    resourceType: 'theme', resourceId: theme.id, url: `https://${domain}/products/${status.handle}`, title: `Review stars in ${theme.name}`,
    field: 'theme_file', before: { key: status.file, value: original.value, addedSnippet: SNIPPET }, after: { key: status.file, rating: check.rating }, source: 'manual',
  });
  return { rating: check.rating, reviewed: status.reviewed, handle: status.handle };
}

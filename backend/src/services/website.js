import axios from 'axios';
import { safeAxiosConfig, assertPublicHost } from '../lib/safeHttp.js';

// Reads a brand's public website for Business DNA: homepage + about-page text,
// meta / Open Graph tags, JSON-LD organisation info and social links. When the
// site is a Shopify storefront it also pulls the public product & collection
// catalog (/products.json, /collections.json) and blog article list (sitemap).

const MAX_PRODUCT_PAGES = 4; // × 250 = 1,000 products — keeps the stored DNA small
const SOCIAL_HOSTS = ['instagram.com', 'facebook.com', 'youtube.com', 'tiktok.com', 'x.com', 'twitter.com', 'pinterest.com', 'linkedin.com'];

const http = axios.create({
  ...safeAxiosConfig,
  timeout: 20000,
  maxRedirects: 5,
  maxContentLength: 5 * 1024 * 1024,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; ArticleWriter-BusinessDNA/1.0)',
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  },
});

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export function normalizeSiteUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw badRequest('Website URL is required');
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw badRequest(`"${raw}" is not a valid website URL`);
  }
  assertPublicHost(url.hostname, url.protocol);
  return `https://${url.hostname.toLowerCase()}`;
}

// ─── HTML helpers (regex-based: this feeds an AI prompt, not a DOM) ─────────

function decode(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : ''))
    .replace(/&amp;/g, '&');
}

const clean = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function metaContent(html, key) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i'))?.[0];
  return tag ? decode(tag.match(/content=(["'])([\s\S]*?)\1/i)?.[2] || '').trim() : '';
}

function visibleText(html) {
  return clean(
    html
      .replace(/<head[\s\S]*?<\/head>/i, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
  );
}

function headings(html) {
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = clean(m[2]);
    const key = text.toLowerCase();
    if (text.length < 3 || text.length > 120 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 20) break;
  }
  return out;
}

function links(html, baseUrl) {
  const out = [];
  for (const m of html.matchAll(/<a\s[^>]*href=(["'])(.*?)\1/gi)) {
    try { out.push(new URL(decode(m[2]), baseUrl)); } catch { /* skip bad hrefs */ }
  }
  return out;
}

// { instagram: 'https://instagram.com/brand', facebook: … } — first profile link per network.
function socialLinks(urls) {
  const found = {};
  for (const u of urls) {
    const host = u.hostname.replace(/^www\./, '');
    const network = SOCIAL_HOSTS.find((h) => host === h || host.endsWith(`.${h}`));
    if (!network || u.pathname.length < 2 || /\/(sharer|share|intent|dialog|p|reel)\b/i.test(u.pathname)) continue;
    const key = network.split('.')[0] === 'x' ? 'twitter' : network.split('.')[0];
    if (!found[key]) found[key] = `https://${host}${u.pathname.replace(/\/$/, '')}`;
  }
  return found;
}

// Organisation name/description/logo from JSON-LD, if the site publishes it.
function organization(html) {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const nodes = [data].flat().flatMap((n) => (n?.['@graph'] ? n['@graph'] : [n]));
    const org = nodes.find((n) => /Organization|Store|Brand|LocalBusiness/i.test([n?.['@type']].flat().join(' ')));
    if (org) {
      return {
        name: typeof org.name === 'string' ? org.name : null,
        description: typeof org.description === 'string' ? clean(org.description) : null,
        logo: typeof org.logo === 'string' ? org.logo : org.logo?.url || null,
      };
    }
  }
  return null;
}

const humanize = (handle) => {
  const s = decodeURIComponent(handle).replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function getHtml(url) {
  const res = await http.get(url, { responseType: 'text' });
  if (!String(res.headers['content-type'] || '').includes('html')) return null;
  return { html: String(res.data), finalUrl: res.request?.res?.responseUrl || url };
}

async function getJson(url, params) {
  const { data } = await http.get(url, { params, responseType: 'json' });
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function getText(url) {
  const { data } = await http.get(url, { responseType: 'text' });
  return String(data);
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));

function shapeProduct(p) {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    productType: p.product_type || '',
    vendor: p.vendor || '',
    tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
    image: p.images?.[0]?.src || null,
    price: p.variants?.[0]?.price || null,
  };
}

// Public Shopify storefront catalog; null when the site isn't a (public) Shopify store.
async function getShopifyCatalog(siteUrl) {
  let first;
  try {
    first = await getJson(`${siteUrl}/products.json`, { limit: 250, page: 1 });
  } catch {
    return null;
  }
  if (!Array.isArray(first?.products)) return null;

  const products = first.products.map(shapeProduct);
  for (let page = 2; page <= MAX_PRODUCT_PAGES && products.length === (page - 1) * 250; page++) {
    const data = await getJson(`${siteUrl}/products.json`, { limit: 250, page }).catch(() => null);
    products.push(...(data?.products || []).map(shapeProduct));
  }

  const [meta, collections, articles] = await Promise.all([
    getJson(`${siteUrl}/meta.json`).catch(() => null),
    getJson(`${siteUrl}/collections.json`, { limit: 250 })
      .then((d) => (d?.collections || []).map((c) => ({ id: c.id, title: c.title, handle: c.handle })))
      .catch(() => []),
    getBlogArticles(siteUrl).catch(() => []),
  ]);
  return {
    name: meta?.name || null,
    description: meta?.description || null,
    currency: meta?.currency || null,
    products,
    collections,
    articles,
  };
}

// Existing Shopify blog articles from the sitemap (titles are derived from handles).
async function getBlogArticles(siteUrl) {
  const host = new URL(siteUrl).hostname;
  const sameHost = (u) => { try { return new URL(u).hostname === host; } catch { return false; } };

  const index = await getText(`${siteUrl}/sitemap.xml`);
  let urls = locs(index);
  if (/<sitemapindex/i.test(index)) {
    const blogMaps = urls.filter((u) => /blog/i.test(u) && sameHost(u)).slice(0, 3);
    urls = (await Promise.all(blogMaps.map((u) => getText(u).then(locs).catch(() => [])))).flat();
  }

  const seen = new Set();
  const articles = [];
  for (const u of urls) {
    const m = u.match(/\/blogs\/([^/?#]+)\/([^/?#]+)/);
    if (!m || seen.has(m[2])) continue;
    seen.add(m[2]);
    articles.push({ id: `${m[1]}/${m[2]}`, blogHandle: m[1], blogTitle: humanize(m[1]), handle: m[2], title: humanize(m[2]), tags: '' });
    if (articles.length >= 300) break;
  }
  return articles;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function readWebsite(input) {
  const requested = normalizeSiteUrl(input);
  let home;
  try {
    home = await getHtml(requested);
  } catch (error) {
    if (error.status === 400) throw error;
    throw badRequest(`Couldn't open ${requested}: ${error.response ? `HTTP ${error.response.status}` : error.message}`);
  }
  if (!home) throw badRequest(`${requested} did not return a web page`);

  // Follow redirects (e.g. store.myshopify.com → custom domain) for everything else.
  const siteUrl = new URL(home.finalUrl).origin;
  const pageLinks = links(home.html, home.finalUrl);

  // One "about" page gives the AI far better brand context than the homepage alone.
  const aboutUrl = pageLinks.find((u) => u.origin === siteUrl && /about|our-story|who-we-are/i.test(u.pathname))?.href;
  const about = aboutUrl ? await getHtml(aboutUrl).catch(() => null) : null;

  const catalog = await getShopifyCatalog(siteUrl);
  const org = organization(home.html);

  return {
    url: siteUrl,
    hostname: new URL(siteUrl).hostname,
    isShopify: !!catalog,
    name: catalog?.name || metaContent(home.html, 'og:site_name') || org?.name || null,
    title: clean(home.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || null,
    description: metaContent(home.html, 'description') || metaContent(home.html, 'og:description') || org?.description || null,
    image: metaContent(home.html, 'og:image') || org?.logo || null,
    currency: catalog?.currency || null,
    headings: headings(home.html),
    socialLinks: socialLinks(pageLinks),
    homeText: visibleText(home.html).slice(0, 4000),
    aboutUrl: about ? aboutUrl : null,
    aboutText: about ? visibleText(about.html).slice(0, 3000) : '',
    products: catalog?.products || [],
    collections: catalog?.collections || [],
    articles: catalog?.articles || [],
  };
}

export default { readWebsite, normalizeSiteUrl };

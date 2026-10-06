import axios from 'axios';
import { safeAxiosConfig, assertPublicHost } from '../lib/safeHttp.js';

// Deep website reader for Instagram Business DNA research (ported from the Insta
// Post Generator). Reads the homepage plus the most informative internal pages
// (about, products, pricing, FAQ, reviews, contact, policies, blog), falling back
// to the sitemap for JavaScript-built sites. Every request — including redirects
// and the sitemap — goes through the SSRF guard in lib/safeHttp.js.

const MAX_BYTES = 1_500_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; ArticleWriter-Research/1.0; business profile reader)';

const http = axios.create({
  ...safeAxiosConfig,
  maxRedirects: 4,
  maxContentLength: MAX_BYTES,
  responseType: 'text',
  headers: { 'User-Agent': USER_AGENT },
  transformResponse: [(d) => d], // keep the raw text
});

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Accept "example.com" or "www.example.com/about" as well as full URLs; only
// public http(s) on standard ports, no credentials.
export function normalizeWebsiteUrl(input) {
  const s = String(input || '').trim();
  if (!s) throw badRequest('Website URL is required');
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw badRequest(`"${s}" is not a valid website URL`);
  }
  if (url.username || url.password) throw badRequest("URLs with credentials aren't allowed.");
  if (url.port && url.port !== '80' && url.port !== '443') throw badRequest('Only the standard web ports (80/443) are allowed.');
  assertPublicHost(url.hostname, url.protocol);
  return url.toString();
}

// ─── HTML → text (every pattern runs in linear time: this parses untrusted HTML) ──

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™', middot: '·',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Lazy `<x>[\s\S]*?</x>` rescans to the end of the document for each unclosed tag
// (quadratic); tags here stop at the next "<" instead.
const TAG_RE = /<[^<>]*>/g;

const inlineText = (html) => decodeEntities(html.replace(TAG_RE, ' ')).replace(/\s+/g, ' ').trim();

function attrs(tag) {
  const out = {};
  const re = /(?<![a-z0-9_:.-])([a-z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  for (const m of tag.slice(0, 4000).matchAll(re)) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

// Visit each `<tag …>inner</tag>` block in one forward pass; an unclosed tag is
// skipped and never searched for again.
function scanBlocks(html, tags, onBlock) {
  const opener = new RegExp(`<(${tags})\\b`, 'gi');
  const closers = new Map();
  const unclosed = new Set();
  for (let m = opener.exec(html); m; m = opener.exec(html)) {
    const tag = m[1].toLowerCase();
    if (unclosed.has(tag)) continue;
    const gt = html.indexOf('>', opener.lastIndex);
    if (gt === -1) return;
    let closer = closers.get(tag);
    if (!closer) closers.set(tag, (closer = new RegExp(`</${tag}\\s*>`, 'gi')));
    closer.lastIndex = gt + 1;
    const c = closer.exec(html);
    if (!c) {
      unclosed.add(tag);
      continue;
    }
    const end = c.index + c[0].length;
    onBlock(html.slice(m.index, gt + 1), html.slice(gt + 1, c.index), m.index, end);
    opener.lastIndex = end;
  }
}

function stripBlocks(html, tags) {
  let out = '';
  let pos = 0;
  scanBlocks(html, tags, (_open, _inner, start, end) => {
    out += `${html.slice(pos, start)} `;
    pos = end;
  });
  return out + html.slice(pos);
}

function stripComments(html) {
  let out = '';
  let pos = 0;
  for (let start = html.indexOf('<!--'); start !== -1; start = html.indexOf('<!--', pos)) {
    const end = html.indexOf('-->', start + 4);
    if (end === -1) break;
    out += `${html.slice(pos, start)} `;
    pos = end + 3;
  }
  return out + html.slice(pos);
}

const SKIP_LINK = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|css|js|xml|json)$/i;

// Readable content + same-site links from a page.
export function extractPage(html, pageUrl, maxChars = 6000) {
  let title;
  scanBlocks(html, 'title', (_open, inner) => { title ??= inner; });

  const meta = {};
  for (const m of html.matchAll(/<meta\b[^<>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.name ?? a.property ?? '').toLowerCase();
    if (key && a.content) meta[key] ??= a.content;
  }

  const ldBlocks = [];
  scanBlocks(html, 'script', (open, inner) => {
    if (!/type\s*=\s*["']application\/ld\+json["']/i.test(open)) return;
    try { ldBlocks.push(JSON.stringify(JSON.parse(inner))); } catch { /* malformed JSON-LD */ }
  });
  const jsonLd = ldBlocks.join(' ');

  const body = stripBlocks(stripComments(html), 'script|style|noscript|svg|template|iframe|head');

  const headingSet = new Set();
  scanBlocks(body, 'h1|h2|h3', (_open, inner) => {
    const h = inlineText(inner).slice(0, 150);
    if (h) headingSet.add(h);
  });

  const text = decodeEntities(
    body.replace(/<\/(p|div|li|h[1-6]|section|article|tr|header|footer)>|<br\s*\/?>/gi, '\n').replace(TAG_RE, ' '),
  )
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ ?\n[\s]*/g, '\n')
    .trim()
    .slice(0, maxChars);

  const base = new URL(pageUrl);
  const site = base.hostname.replace(/^www\./, '');
  const links = new Set();
  for (const m of body.matchAll(/<a\b[^<>]*>/gi)) {
    const href = attrs(m[0]).href;
    if (!href) continue;
    try {
      const u = new URL(href, base);
      if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== site || SKIP_LINK.test(u.pathname)) continue;
      u.hash = '';
      links.add(u.toString());
    } catch { /* malformed href */ }
  }

  return {
    url: pageUrl,
    title: title ? inlineText(title).slice(0, 200) || null : null,
    description: (meta.description ?? meta['og:description'] ?? '').slice(0, 400) || null,
    headings: [...headingSet].slice(0, 25),
    structuredData: jsonLd ? jsonLd.slice(0, 2000) : null,
    text,
    links: [...links],
  };
}

// ─── Fetching ───────────────────────────────────────────────────────────────

async function fetchPage(url, timeoutMs, kind = 'html') {
  const typeOk = kind === 'xml' ? /xml/i : /text\/html|application\/xhtml/i;
  try {
    const res = await http.get(url, {
      timeout: timeoutMs,
      headers: { Accept: kind === 'xml' ? 'application/xml,text/xml' : 'text/html,application/xhtml+xml' },
    });
    if (!typeOk.test(String(res.headers['content-type'] || ''))) {
      throw new Error(`${url} isn't ${kind === 'xml' ? 'XML' : 'an HTML page'}`);
    }
    return { url: res.request?.res?.responseUrl || url, html: String(res.data) };
  } catch (err) {
    if (err.status === 400) throw err; // SSRF guard
    const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    if (err.code === 'ECONNABORTED') throw new Error(`Timed out loading ${host}`);
    if (err.response) throw new Error(`${host} responded ${err.response.status}`);
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') throw new Error(`Couldn't load ${host}: the domain doesn't resolve`);
    throw new Error(`Couldn't load ${host}: ${err.message}`);
  }
}

// Deep research reads more of the site: [pattern, how many pages to take].
const DEEP_PATHS = [
  [/about|our-?story|who-?we-?are|company|founder|mission/i, 1],
  [/products?|shop|collections?|catalog|store|menu/i, 2],
  [/services?|solutions?|what-?we-?do/i, 1],
  [/pricing|plans|packages|rates/i, 1],
  [/faq|help|questions/i, 1],
  [/reviews?|testimonials?|customers?|case-?stud/i, 1],
  [/contact|locations?|visit|stores?-?locator/i, 1],
  [/shipping|returns?|refund|policy|policies|warranty/i, 1],
  [/blog|journal|news|stories|articles/i, 1],
];

// Pages with nothing to learn about the business (cart, login, search…).
const UTILITY_PAGE = /\/(cart|checkout|account|login|log-?in|sign-?in|register|sign-?up|search|wishlist|compare|auth|authentication|password)(\/|$)/i;

const isUtilityPage = (url) => {
  try { return UTILITY_PAGE.test(new URL(url).pathname); } catch { return false; }
};

// Same-site page URLs from the sitemap (following one level of sitemap index).
async function sitemapUrls(origin, site, timeoutMs) {
  const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1])).slice(0, 500);
  const sameSite = (u) => {
    try {
      const url = new URL(u);
      return /^https?:$/.test(url.protocol) && url.hostname.replace(/^www\./, '') === site && !SKIP_LINK.test(url.pathname);
    } catch { return false; }
  };
  try {
    const root = await fetchPage(`${origin}/sitemap.xml`, timeoutMs, 'xml');
    let urls = locs(root.html);
    if (/<sitemapindex/i.test(root.html) && urls[0]) {
      const child = urls.find((u) => /page|product|collection/i.test(u)) ?? urls[0];
      urls = sameSite(child) ? locs((await fetchPage(child, timeoutMs, 'xml')).html) : [];
    }
    return urls.filter(sameSite);
  } catch {
    return []; // no sitemap — fine
  }
}

// Homepage + up to (maxPages - 1) high-signal internal pages.
export async function crawlWebsite(input, { maxPages = 10, timeoutMs = 10000 } = {}) {
  const home = await fetchPage(normalizeWebsiteUrl(input), timeoutMs);
  const first = extractPage(home.html, home.url, 6000);

  const homeUrl = new URL(home.url);
  const pageKey = (u) => {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, '') + (x.pathname.replace(/\/+$/, '') || '/');
  };
  const homeKey = pageKey(home.url);
  let candidates = first.links.filter((l) => pageKey(l) !== homeKey && !isUtilityPage(l));
  if (candidates.length < 8) {
    const site = homeUrl.hostname.replace(/^www\./, '');
    const fromSitemap = await sitemapUrls(homeUrl.origin, site, timeoutMs);
    candidates = [...new Set([...candidates, ...fromSitemap.filter((u) => pageKey(u) !== homeKey && !isUtilityPage(u))])];
  }

  const picks = [];
  const room = () => picks.length < maxPages - 1;
  for (const [re, take] of DEEP_PATHS) {
    let taken = 0;
    for (const l of candidates) {
      if (!room() || taken >= take) break;
      if (!picks.includes(l) && re.test(new URL(l).pathname)) {
        picks.push(l);
        taken++;
      }
    }
  }
  // Fill what's left with shallow pages (/x, /pages/x, /collections/x) — the main sections.
  const depth = (l) => new URL(l).pathname.split('/').filter(Boolean).length;
  for (const l of [...candidates].sort((a, b) => depth(a) - depth(b))) {
    if (!room()) break;
    if (!picks.includes(l) && depth(l) <= 2) picks.push(l);
  }

  const extra = await Promise.allSettled(picks.map(async (u) => {
    const r = await fetchPage(u, timeoutMs);
    return extractPage(r.html, r.url, 3000);
  }));

  // Drop links that redirected to a utility page or to a page we already have.
  const seen = new Set([homeKey]);
  const fetched = extra.flatMap((r) => {
    if (r.status !== 'fulfilled' || isUtilityPage(r.value.url) || seen.has(pageKey(r.value.url))) return [];
    seen.add(pageKey(r.value.url));
    return [r.value];
  });
  return { url: home.url, pages: [first, ...fetched].map(({ links: _links, ...page }) => page) };
}

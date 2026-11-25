// What counts as an SEO problem, how much it matters, and what can fix it. Pure logic, so
// the audit's judgement can be tested without a store.

import { findClaims } from './seoClaims.js';

export const LIMITS = {
  titleMin: 30, titleMax: 65, descriptionMin: 70, descriptionMax: 165,
  thinProductWords: 40, thinArticleWords: 300, lowAeo: 50,
  minImpressionsForCtr: 100, lowCtr: 0.01, topPosition: 10, strikingFrom: 8, strikingTo: 20,
};

// `fix` names the automatic repair, if there is one. `advice` tells the owner what to do
// about the ones that need a person.
export const ISSUE_TYPES = {
  broken_page: { label: 'Page does not load', severity: 'critical', advice: 'Open the page. If it was deleted on purpose, add a URL redirect in Shopify (Online Store → Navigation → URL redirects).' },
  noindex: { label: 'Hidden from Google', severity: 'critical', advice: 'Remove the noindex setting for this page in your theme or SEO app, unless you want it hidden.' },
  empty_collection: { label: 'Empty collection', severity: 'high', fix: 'hide', advice: 'Add products to this collection in Shopify, or hide it from your store. An empty page hurts your site in Google.' },
  false_claim: { label: 'Promise your store doesn\'t make', severity: 'high', fix: 'claims' },
  title_missing: { label: 'Missing page title', severity: 'high', fix: 'meta' },
  meta_missing: { label: 'Missing meta description', severity: 'high', fix: 'meta' },
  title_duplicate: { label: 'Duplicate page title', severity: 'high', fix: 'meta' },
  meta_duplicate: { label: 'Duplicate meta description', severity: 'high', fix: 'meta' },
  broken_link: { label: 'Dead link in article', severity: 'high', fix: 'links' },
  title_long: { label: 'Page title too long', severity: 'medium', fix: 'meta' },
  title_short: { label: 'Page title too short', severity: 'medium', fix: 'meta' },
  meta_long: { label: 'Meta description too long', severity: 'medium', fix: 'meta' },
  meta_short: { label: 'Meta description too short', severity: 'medium', fix: 'meta' },
  alt_missing: { label: 'Images without alt text', severity: 'medium', fix: 'alt' },
  h1_missing: { label: 'No main heading', severity: 'medium', advice: 'Your theme decides this. In the theme editor, make sure this page type shows its title as a heading.' },
  thin_content: { label: 'Very little text', severity: 'medium', advice: 'Add a few real sentences: what it is made of, its size, how to wear it and who it suits. Only you know these facts.' },
  low_ctr: { label: 'Seen on Google but rarely clicked', severity: 'medium', fix: 'meta' },
  not_indexed: { label: 'Not in Google yet', severity: 'medium', advice: 'Usually fixes itself as Google crawls more. Link to this page from a collection or article, or press Request indexing for it in Search Console.' },
  aeo_low: { label: 'Weak for AI answers', severity: 'low', fix: 'article' },
  striking_distance: { label: 'Close to page one', severity: 'low', advice: 'Already near the top of Google. Add a little more helpful text and link to it from your articles to push it up.' },
};

// Problems only the public page can show: whether it loads, its tags and headings, the
// title and description it prints, where its links go. A run that couldn't read the live
// pages (a password-protected store) neither confirms nor clears these.
export const CRAWL_TYPES = [
  'broken_page', 'noindex', 'h1_missing', 'broken_link',
  'title_missing', 'title_duplicate', 'title_long', 'title_short', 'meta_missing', 'meta_duplicate', 'meta_long', 'meta_short',
];

const PENALTY = { critical: 100, high: 25, medium: 10, low: 3 };
export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const words = (html) => String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const normalize = (text) => String(text || '').trim().toLowerCase();

function issue(page, type, detail) {
  return {
    resource_type: page.type, resource_id: String(page.id), blog_id: page.blogId ? String(page.blogId) : null,
    url: page.url, title: page.name, type, severity: ISSUE_TYPES[type].severity, detail,
  };
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…' };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? full;
    const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : full;
  }).replace(/\s+/g, ' ').trim();
}

// Reads the parts of a live page that matter, without keeping the page in memory.
export function readPage(html) {
  const decode = decodeEntities;
  const meta = (name) => {
    const tag = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]*>`, 'i'))?.[0];
    return tag?.match(/content=["']([^"']*)["']/i)?.[1];
  };
  return {
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''),
    description: decode(meta('description') || ''),
    h1Count: (html.match(/<h1\b/gi) || []).length,
    noindex: /noindex/i.test(meta('robots') || ''),
  };
}

// ─── A password-protected storefront ─────────────────────────────────────────
// While a store's password is on (every development store, and many stores before launch),
// Shopify sends every URL to /password, so a crawl only ever sees that one page.

const PASSWORD_PATH_RE = /^(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/password\/?$/i; // also under a language folder, /fr/password
const PASSWORD_FORM_RE = /<form\b[^>]*\baction=["'](?:https?:\/\/[^"'/]+)?(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/password\/?["']/i;

// Whether a response is Shopify's password page: by where the request ended up after its
// redirects, or by the password form in the HTML (Shopify's own page or a theme's password template).
export function isPasswordPage(finalUrl, html = '') {
  let path = '';
  try { path = new URL(finalUrl).pathname; } catch { /* not a full URL */ }
  if (PASSWORD_PATH_RE.test(path)) return true;
  const text = String(html || '');
  return /<input\b[^>]*\bvalue=["']storefront_password["']/i.test(text)
    || (PASSWORD_FORM_RE.test(text) && /<input\b[^>]*\btype=["']password["']/i.test(text));
}

const plainText = (html) => decodeEntities(String(html || '').replace(/<[^>]+>/g, ' '));

// What Google is shown for a page, worked out from Shopify's own fields for when the live
// page can't be read. `page.seo` is the page's Google title and description in Shopify
// (empty when never set). A theme prints Shopify's page_title: the Google title, or else the
// page's name, and Shopify's themes add " – Store name" unless the title already has it (an
// article's may add its blog's name too). The description is the Google description, or else
// the page's own text, which Shopify or the theme may shorten. So only what holds for every
// theme is judged: a title is too long only on its own, too short only with everything added,
// and a page's own text is never called too long or (when it could be one of two) a duplicate.
export function shopifyMeta(page, storeName = '') {
  const title = decodeEntities(String(page.seo?.title || '')) || decodeEntities(String(page.name || ''));
  const added = [page.type === 'article' ? page.blogTitle : null, storeName && !title.includes(storeName) ? storeName : null].filter(Boolean);
  const set = decodeEntities(String(page.seo?.description || ''));
  const sources = page.type === 'article' ? [page.summary, page.body] : page.type === 'product' ? [page.body] : [page.ownText];
  const texts = [...new Set(sources.map(plainText).filter(Boolean))];
  const description = set || texts[0] || '';
  return {
    title,
    longestTitle: [title, ...added].join(' – '),
    added: added.length > 0,
    // Articles of different blogs may print different titles, so they're only compared within a blog.
    titleKey: page.type === 'article' ? `${title}\u0000${page.blogId}` : title,
    description,
    descriptionSet: Boolean(set),
    descriptionLength: set ? set.length : Math.max(0, ...texts.map((t) => t.length)),
    descriptionKey: set || (texts.length === 1 ? texts[0] : ''),
  };
}

// Title and description problems from Shopify's fields (`shopifyMeta`), for a run that couldn't read the live page.
function shopifyMetaIssues(page, meta, seen) {
  const found = [];
  if (!meta.title) found.push(issue(page, 'title_missing', 'This page has no title in Shopify.'));
  else {
    const others = seen.titles.get(normalize(meta.titleKey));
    if (others > 1) found.push(issue(page, 'title_duplicate', `${others} pages share this title: "${meta.title}"`));
    if (meta.title.length > LIMITS.titleMax) found.push(issue(page, 'title_long', `${meta.title.length} characters, so Google will cut it off.`));
    if (meta.longestTitle.length < LIMITS.titleMin) {
      const what = page.type === 'article' && page.blogTitle ? 'the blog and store names' : 'your store name';
      found.push(issue(page, 'title_short', meta.added ? `Only ${meta.longestTitle.length} characters, even with ${what} added.` : `Only ${meta.title.length} characters.`));
    }
  }

  if (!meta.description) found.push(issue(page, 'meta_missing', 'No Google description is set in Shopify, and the page has no text of its own to use instead.'));
  else {
    const others = meta.descriptionKey ? seen.descriptions.get(normalize(meta.descriptionKey)) : 0;
    if (others > 1) found.push(issue(page, 'meta_duplicate', `${others} pages share this description.`));
    if (meta.descriptionSet && meta.description.length > LIMITS.descriptionMax) found.push(issue(page, 'meta_long', `${meta.description.length} characters, so Google will cut it off.`));
    if (meta.descriptionLength < LIMITS.descriptionMin) {
      found.push(issue(page, 'meta_short', meta.descriptionSet
        ? `Only ${meta.descriptionLength} characters.`
        : `Only ${meta.descriptionLength} characters. No Google description is set in Shopify, so the page's own text is used.`));
    }
  }
  return found;
}

const BUILT_IN_COLLECTIONS = new Set(['all', 'vendors', 'types']); // Shopify's own, not in the API
const bareHost = (host) => host.toLowerCase().replace(/^www\./, '');

function isInternal(href, hosts) {
  if (href.startsWith('//')) return false;
  if (href.startsWith('/')) return true;
  const host = href.match(/^https?:\/\/([^/?#]+)/i)?.[1];
  return Boolean(host) && hosts.has(bareHost(host));
}

// Links in `html` to pages missing from the store's own list. Links to other sites are
// never judged. A missing handle isn't proof: Shopify may redirect it to a page that works.
export function suspectLinks(html, live) {
  const dead = new Set();
  for (const [, href] of String(html || '').matchAll(/<a\b[^>]*href="([^"]+)"/gi)) {
    if (!isInternal(href, live.hosts)) continue;
    const product = href.match(/\/products\/([^/?#]+)/)?.[1];
    const collection = href.match(/\/collections\/([^/?#]+)/)?.[1];
    const article = href.match(/\/blogs\/[^/]+\/([^/?#]+)/)?.[1];
    if (product && !live.products.has(product)) dead.add(href);
    else if (!product && collection && !live.collections.has(collection) && !BUILT_IN_COLLECTIONS.has(collection)) dead.add(href);
    if (article && article !== 'tagged' && !live.articles.has(article)) dead.add(href);
  }
  return [...dead];
}

// `live.gone` holds the suspects the public site really answered with "not found".
export const deadLinks = (html, live) => suspectLinks(html, live).filter((href) => live.gone.has(href));

export const liveHosts = (...domains) => new Set(domains.filter(Boolean).map(bareHost));

// The live page's title and description, as the crawl read them.
function liveMetaIssues(page, http, seen) {
  const found = [];
  if (!http.title) found.push(issue(page, 'title_missing', 'This page has no title.'));
  else {
    const others = seen.titles.get(normalize(http.title));
    if (others > 1) found.push(issue(page, 'title_duplicate', `${others} pages share this title: "${http.title}"`));
    if (http.title.length > LIMITS.titleMax) found.push(issue(page, 'title_long', `${http.title.length} characters, so Google will cut it off.`));
    if (http.title.length < LIMITS.titleMin) found.push(issue(page, 'title_short', `Only ${http.title.length} characters.`));
  }

  if (!http.description) found.push(issue(page, 'meta_missing', 'This page has no meta description.'));
  else {
    const others = seen.descriptions.get(normalize(http.description));
    if (others > 1) found.push(issue(page, 'meta_duplicate', `${others} pages share this description.`));
    if (http.description.length > LIMITS.descriptionMax) found.push(issue(page, 'meta_long', `${http.description.length} characters, so Google will cut it off.`));
    if (http.description.length < LIMITS.descriptionMin) found.push(issue(page, 'meta_short', `Only ${http.description.length} characters.`));
  }
  return found;
}

// `locked`: the storefront is password-protected, so nothing from the live page is known.
// Titles and descriptions are then judged from Shopify's fields when they could be read
// (`meta`), and whatever only the live page can show is left out.
function pageIssues(page, { seen, search, live, aeoScore, facts, locked, meta }) {
  const found = [];
  const { http } = page;
  if (!locked && (!http?.status || http.status >= 400)) return [issue(page, 'broken_page', http?.status ? `The page returned ${http.status}.` : 'The page did not respond.')];
  // Nothing on it to describe, so its title and description don't matter until it has products.
  if (page.type === 'collection' && page.productCount === 0) return [issue(page, 'empty_collection', 'This collection has no products, so shoppers and Google see an empty page.')];

  if (page.type === 'product') {
    const claims = [...new Set([...findClaims(page.seoDescription, facts), ...findClaims(page.body, facts)])];
    if (claims.length) found.push(issue(page, 'false_claim', `Promises ${claims.map((c) => `"${c}"`).join(', ')}, which your store facts say you don't offer.`));
  }

  if (!locked) {
    if (http.noindex) found.push(issue(page, 'noindex', 'A noindex tag keeps this page out of Google.'));
    found.push(...liveMetaIssues(page, http, seen));
    if (http.h1Count === 0) found.push(issue(page, 'h1_missing', 'The page has no H1 heading. This usually comes from the theme.'));
  } else if (meta) found.push(...shopifyMetaIssues(page, meta, seen));

  const noAlt = (page.images || []).filter((i) => !String(i.alt || '').trim());
  if (noAlt.length) found.push(issue(page, 'alt_missing', `${noAlt.length} of ${page.images.length} images have no alt text.`));

  const bodyWords = words(page.body);
  if (page.type === 'product' && bodyWords < LIMITS.thinProductWords) found.push(issue(page, 'thin_content', `The description is only ${bodyWords} words.`));
  if (page.type === 'article' && bodyWords < LIMITS.thinArticleWords) found.push(issue(page, 'thin_content', `The article is only ${bodyWords} words.`));

  if (page.type === 'article') {
    const dead = locked ? [] : deadLinks(page.body, live);
    if (dead.length) found.push(issue(page, 'broken_link', `${dead.length} link(s) lead nowhere: ${dead.slice(0, 3).join(', ')}`));
    const aeo = aeoScore?.(page);
    if (aeo != null && aeo < LIMITS.lowAeo) found.push(issue(page, 'aeo_low', `AEO score ${aeo} of 100.`));
  }

  const stats = search?.pages?.get(page.url);
  if (stats) {
    if (stats.impressions >= LIMITS.minImpressionsForCtr && stats.ctr < LIMITS.lowCtr && stats.position <= LIMITS.topPosition) {
      found.push(issue(page, 'low_ctr', `${stats.impressions} views on Google but only ${stats.clicks} clicks.`));
    }
    if (stats.impressions >= LIMITS.minImpressionsForCtr && stats.position >= LIMITS.strikingFrom && stats.position <= LIMITS.strikingTo) {
      found.push(issue(page, 'striking_distance', `Averages position ${stats.position.toFixed(1)}, close to the top of Google.`));
    }
  }
  if (search?.notIndexed?.has(page.url)) found.push(issue(page, 'not_indexed', search.notIndexed.get(page.url)));
  return found;
}

// Pages the crawl was refused (`skipped`) say nothing about the site, so they're left out.
// `locked`: the storefront is password-protected (see pageIssues); `storeName` is what
// themes add to titles, for judging them from Shopify's fields.
export function detectIssues(pages, { search = null, live, aeoScore = null, facts = null, locked = false, storeName = '' } = {}) {
  const checked = pages.filter((p) => !p.skipped);
  const metas = new Map(locked ? checked.filter((p) => p.seo).map((p) => [p, shopifyMeta(p, storeName)]) : []);
  const tally = (read) => {
    const map = new Map();
    for (const p of checked) {
      const value = normalize(read(p));
      if (value) map.set(value, (map.get(value) || 0) + 1);
    }
    return map;
  };
  const seen = locked
    ? { titles: tally((p) => metas.get(p)?.titleKey), descriptions: tally((p) => metas.get(p)?.descriptionKey) }
    : { titles: tally((p) => p.http?.title), descriptions: tally((p) => p.http?.description) };
  return checked.flatMap((page) => pageIssues(page, { seen, search, live, aeoScore, facts, locked, meta: metas.get(page) }));
}

// The site's score: the average page, where each problem takes points off that page.
export function siteScore(pageCount, issues) {
  if (!pageCount) return 0;
  const lost = new Map();
  for (const i of issues) {
    const key = `${i.resource_type}:${i.resource_id}`;
    lost.set(key, Math.min(100, (lost.get(key) || 0) + PENALTY[i.severity]));
  }
  const total = [...lost.values()].reduce((sum, n) => sum + n, 0);
  return Math.round(100 - total / pageCount);
}

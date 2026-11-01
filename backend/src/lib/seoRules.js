// What counts as an SEO problem, how much it matters, and what can fix it. Pure logic, so
// the audit's judgement can be tested without a store.

export const LIMITS = {
  titleMin: 30, titleMax: 65, descriptionMin: 70, descriptionMax: 165,
  thinProductWords: 40, thinArticleWords: 300, lowAeo: 50,
  minImpressionsForCtr: 100, lowCtr: 0.01, topPosition: 10, strikingFrom: 8, strikingTo: 20,
};

// `fix` names the automatic repair, if there is one.
export const ISSUE_TYPES = {
  broken_page: { label: 'Page does not load', severity: 'critical' },
  noindex: { label: 'Hidden from Google', severity: 'critical' },
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
  h1_missing: { label: 'No main heading', severity: 'medium' },
  thin_content: { label: 'Very little text', severity: 'medium' },
  low_ctr: { label: 'Seen on Google but rarely clicked', severity: 'medium', fix: 'meta' },
  not_indexed: { label: 'Not in Google yet', severity: 'medium' },
  aeo_low: { label: 'Weak for AI answers', severity: 'low', fix: 'article' },
  striking_distance: { label: 'Close to page one', severity: 'low' },
};

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

// Reads the parts of a live page that matter, without keeping the page in memory.
export function readPage(html) {
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
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

const BUILT_IN_COLLECTIONS = new Set(['all', 'vendors', 'types']); // Shopify's own, not in the API
const bareHost = (host) => host.toLowerCase().replace(/^www\./, '');

function isInternal(href, hosts) {
  if (href.startsWith('//')) return false;
  if (href.startsWith('/')) return true;
  const host = href.match(/^https?:\/\/([^/?#]+)/i)?.[1];
  return Boolean(host) && hosts.has(bareHost(host));
}

// Links in `html` to pages of this store that no longer exist. Links to other sites are
// never judged, because they can't be checked against the store's own list.
export function deadLinks(html, live) {
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

export const liveHosts = (...domains) => new Set(domains.filter(Boolean).map(bareHost));

function pageIssues(page, seen, search, live, aeoScore) {
  const found = [];
  const { http } = page;
  if (!http?.status || http.status >= 400) return [issue(page, 'broken_page', http?.status ? `The page returned ${http.status}.` : 'The page did not respond.')];

  if (http.noindex) found.push(issue(page, 'noindex', 'A noindex tag keeps this page out of Google.'));

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

  if (http.h1Count === 0) found.push(issue(page, 'h1_missing', 'The page has no H1 heading. This usually comes from the theme.'));

  const noAlt = (page.images || []).filter((i) => !String(i.alt || '').trim());
  if (noAlt.length) found.push(issue(page, 'alt_missing', `${noAlt.length} of ${page.images.length} images have no alt text.`));

  const bodyWords = words(page.body);
  if (page.type === 'product' && bodyWords < LIMITS.thinProductWords) found.push(issue(page, 'thin_content', `The description is only ${bodyWords} words.`));
  if (page.type === 'article' && bodyWords < LIMITS.thinArticleWords) found.push(issue(page, 'thin_content', `The article is only ${bodyWords} words.`));

  if (page.type === 'article') {
    const dead = deadLinks(page.body, live);
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
export function detectIssues(pages, { search = null, live, aeoScore = null } = {}) {
  const checked = pages.filter((p) => !p.skipped);
  const tally = (read) => {
    const map = new Map();
    for (const p of checked) {
      const value = normalize(read(p));
      if (value) map.set(value, (map.get(value) || 0) + 1);
    }
    return map;
  };
  const seen = { titles: tally((p) => p.http?.title), descriptions: tally((p) => p.http?.description) };
  return checked.flatMap((page) => pageIssues(page, seen, search, live, aeoScore));
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

import axios from 'axios';
import * as repo from '../repositories/seo.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';
import * as shopify from './shopify.js';
import * as gsc from './searchConsole.js';
import { applyFixes } from './seoFixes.js';
import { mapLimit } from './igMedia.js';
import { safeAxiosConfig } from '../lib/safeHttp.js';
import { detectIssues, siteScore, readPage, liveHosts, suspectLinks } from '../lib/seoRules.js';
import { calculateAeoScore } from '../lib/seo.js';
import { stripTags } from '../lib/articleStructure.js';

// The full-site check: everything published on the store, each live page as Google sees
// it, and Search Console's numbers when connected. Then the worst problems get fixed.

const CRAWL_PARALLEL = 2;
const CRAWL_PAUSE_MS = 250; // about three pages a second, so the crawl doesn't slow the store
const CRAWL_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 4000;
const MAX_SKIPPED_SHARE = 0.2;
const MAX_PAGES = 2000;
const http = axios.create({
  ...safeAxiosConfig, timeout: 20000, maxContentLength: 6 * 1024 * 1024, responseType: 'text', validateStatus: () => true,
  headers: { 'User-Agent': 'ArticleWriter-SeoAudit/1.0' },
});

const isPublished = (item) => Boolean(item.published_at);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Everything the store has published, as pages the audit can check and the fixes can edit.
async function loadInventory(creds, domain) {
  const base = `https://${domain}`;
  const [products, collections, blogs, shopPages] = await Promise.all([
    shopify.getProducts(creds), shopify.getCollections(creds, { strict: true }), shopify.getBlogs(creds), shopify.getPages(creds),
  ]);
  const articles = (await Promise.all(blogs.map(async (blog) => (await shopify.getArticles(creds, blog.id))
    .filter(isPublished).map((a) => ({ ...a, blogId: blog.id, blogHandle: blog.handle }))))).flat();

  const liveProducts = products.filter((p) => p.status === 'active' && isPublished(p));
  const liveCollections = collections.filter((c) => c.published);
  if (!liveProducts.length) throw new Error('Shopify returned no published products, so the check stopped.');

  const pages = [
    ...liveProducts.map((p) => ({
      type: 'product', id: p.id, handle: p.handle, name: p.title, url: `${base}/products/${p.handle}`, body: p.body_html,
      images: (p.images || []).map((i) => ({ id: i.id, alt: i.alt, position: i.position })),
      facts: [p.product_type, stripTags(p.body_html).slice(0, 300)].filter(Boolean).join('. '), // never the price: metadata outlives it
    })),
    ...liveCollections.map((c) => ({ type: 'collection', id: c.id, handle: c.handle, name: c.title, url: `${base}/collections/${c.handle}` })),
    ...articles.map((a) => ({
      type: 'article', id: a.id, blogId: a.blogId, handle: a.handle, name: a.title, url: `${base}/blogs/${a.blogHandle}/${a.handle}`,
      body: a.body_html, tags: a.tags, image: a.image, facts: stripTags(a.summary_html || a.body_html).slice(0, 300),
    })),
    ...shopPages.filter(isPublished).map((p) => ({ type: 'page', id: p.id, handle: p.handle, name: p.title, url: `${base}/pages/${p.handle}`, facts: stripTags(p.body_html).slice(0, 300) })),
  ].slice(0, MAX_PAGES);

  const live = {
    products: new Set(liveProducts.map((p) => p.handle)),
    collections: new Set(liveCollections.map((c) => c.handle)),
    articles: new Set(articles.map((a) => a.handle)),
    hosts: liveHosts(domain, creds.storeUrl?.replace(/^https?:\/\//, '').replace(/\/.*$/, '')),
    gone: new Set(),
  };
  await confirmDeadLinks(pages, live, base);
  return { pages, live };
}

// A busy or failing store gets a few tries. Status 0 means no response at all.
async function fetchPage(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await http.get(url).catch(() => ({ status: 0 }));
    const temporary = res.status === 0 || res.status === 429 || res.status >= 500;
    if (!temporary || attempt === CRAWL_ATTEMPTS) return res;
    await pause(RETRY_PAUSE_MS * attempt);
  }
}

// Only a real "not found" counts. A redirect still takes the reader somewhere, and a fix
// removes the link, so anything less certain is left alone.
async function confirmDeadLinks(pages, live, base) {
  const suspects = [...new Set(pages.flatMap((page) => suspectLinks(page.body, live)))];
  await mapLimit(suspects, CRAWL_PARALLEL, async (href) => {
    const { status } = await fetchPage(new URL(href, base).toString());
    if (status === 404 || status === 410) live.gone.add(href);
    await pause(CRAWL_PAUSE_MS);
  });
}

// Being refused says nothing about a page, so those are skipped rather than called broken,
// and a run that was mostly refused stops here: it can't tell the site's real state.
async function crawl(pages) {
  await mapLimit(pages, CRAWL_PARALLEL, async (page) => {
    const res = await fetchPage(page.url);
    if (res.status === 429) page.skipped = true;
    else page.http = { status: res.status, ...(res.status && res.status < 400 ? readPage(String(res.data)) : {}) };
    await pause(CRAWL_PAUSE_MS);
  });
  const skipped = pages.filter((p) => p.skipped).length;
  if (skipped > pages.length * MAX_SKIPPED_SHARE) throw new Error(`The store refused ${skipped} of ${pages.length} page requests, so nothing was changed.`);
  return pages.length - skipped;
}

// Pages already known to be missing get rechecked, then each day takes the next few of
// the pages with no search traffic, so over time every page is looked at.
async function inspectionSample(workspaceId, pages, stats) {
  const flagged = await repo.openIssueUrls(workspaceId, 'not_indexed');
  const unseen = pages.map((p) => p.url).filter((url) => !stats.has(url) && !flagged.includes(url));
  const offset = unseen.length ? (Math.floor(Date.now() / 864e5) * gsc.INSPECTIONS_PER_RUN) % unseen.length : 0;
  return [...flagged, ...unseen.slice(offset), ...unseen.slice(0, offset)];
}

// Search Console's view of the site. Any failure here leaves the audit running without it.
async function loadSearch(workspaceId, settings, pages, domain) {
  if (!settings.google_connected || !settings.google_site || !gsc.isConfigured()) return null;
  try {
    const token = await gsc.accessToken(await repo.googleToken(workspaceId));
    const { pages: stats, summary } = await gsc.fetchPerformance(token, settings.google_site);
    const sitemap = await gsc.ensureSitemap(token, settings.google_site, `https://${domain}/sitemap.xml`).catch(() => null);
    const notIndexed = await gsc.findNotIndexed(token, settings.google_site, await inspectionSample(workspaceId, pages, stats));
    return { pages: stats, notIndexed, token, summary: { ...summary, sitemap, notIndexed: notIndexed.size } };
  } catch (err) {
    console.error(`Search Console read failed for ${workspaceId}: ${err.response?.data?.error?.message || err.message}`);
    return { pages: new Map(), notIndexed: new Map(), summary: { error: 'Search Console could not be read on this run.' } };
  }
}

// One full run. `applying` is false for a check that should only report.
export async function runAudit(workspaceId, { trigger = 'schedule', applying = true } = {}) {
  const audit = await repo.createAudit(workspaceId, trigger);
  try {
    const [settings, creds, dna] = await Promise.all([repo.getSettings(workspaceId), stores.getDefaultStore(workspaceId), dnaRepo.getDna(workspaceId)]);
    if (!creds) throw new Error('No Shopify store is connected.');
    if (!dna?.shop?.domain) throw new Error('Fetch your Business DNA first, so the audit knows your domain.');

    const { pages, live } = await loadInventory(creds, dna.shop.domain);
    const checked = await crawl(pages);
    const search = await loadSearch(workspaceId, settings, pages, dna.shop.domain);
    const issues = detectIssues(pages, { search, live, aeoScore: (page) => calculateAeoScore({ bodyHtml: page.body }).score });
    await repo.syncIssues(workspaceId, audit.id, issues);

    const fixesApplied = applying ? await applyFixes({
      workspaceId, settings, creds, pages, issues, live, audit, search, storeName: dna.shop.name,
      queriesFor: search?.token ? (url) => gsc.pageQueries(search.token, settings.google_site, url) : null,
    }) : 0;

    const score = siteScore(checked, issues);
    await repo.finishAudit(audit.id, {
      status: 'done', pagesChecked: checked, issuesFound: issues.length, fixesApplied, score, search: search?.summary,
    });
    return { auditId: audit.id, pages: checked, issues: issues.length, fixesApplied, score };
  } catch (err) {
    await repo.finishAudit(audit.id, { status: 'failed', error: String(err.message).slice(0, 300) });
    throw err;
  }
}

// Loads the one page an issue is about, fresh from Shopify, so a manual fix uses today's text.
export async function loadIssuePage(creds, domain, issue) {
  const { pages, live } = await loadInventory(creds, domain);
  const page = pages.find((p) => p.type === issue.resource_type && String(p.id) === issue.resource_id);
  return { page, live };
}

// Scheduler hook: at most one workspace per call.
export async function runDueSeoAudit() {
  const workspaceId = await repo.claimDue();
  if (!workspaceId) return false;
  try {
    const result = await runAudit(workspaceId);
    console.log(`🔎 SEO audit ${workspaceId}: ${result.pages} pages, ${result.issues} issues, ${result.fixesApplied} improved, score ${result.score}`);
  } catch (err) {
    console.error(`❌ SEO audit ${workspaceId} failed: ${err.message}`);
  } finally {
    await repo.finishRun(workspaceId);
  }
  return true;
}

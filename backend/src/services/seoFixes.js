import * as repo from '../repositories/seo.js';
import * as shopify from './shopify.js';
import * as deepseek from './deepseek.js';
import { resolveAi } from './ai.js';
import { enhanceArticleForWorkspace } from './articleService.js';
import { tidySeoFields, withFaqSchema } from '../lib/articleStructure.js';
import { ISSUE_TYPES, SEVERITY_ORDER, deadLinks } from '../lib/seoRules.js';

// Turns audit findings into changes on the live store. Every change saves what it
// replaced first, so it can be undone, and only the fields the owner allowed are touched.

const RECHANGE_DAYS = 14; // a changed page rests this long before it can change again
const MAX_ARTICLE_REWRITES = 1; // per run: these are the biggest changes the automation makes
const MIN_SEO_DESCRIPTION = 90;
const META_TOKENS = 1500; // the model reasons before it answers, and that counts too
const IMAGE_PAUSE_MS = 400; // Shopify allows about two admin calls a second
const CLAIMS_RE = /free (?:shipping|delivery)|\d+\s*% off|guarantee\w*|warranty|lowest price|best price|cash on delivery|\bcod\b|hypoallergenic|waterproof|anti[- ]tarnish/gi;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A promise the page's own facts don't make can't go on the store, however well it reads.
function inventedClaim(text, page) {
  const known = `${page.name} ${page.facts || ''}`.toLowerCase();
  return (String(text).match(CLAIMS_RE) || []).find((claim) => !known.includes(claim.toLowerCase())) || null;
}

function parseMeta(raw) {
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The AI returned no metadata.');
  return JSON.parse(match[0]);
}

function metaPrompt(page, { storeName, queries }) {
  return `Write the Google search title and description for one page of ${storeName || 'an online store'}.

PAGE TYPE: ${page.type}
PAGE NAME: ${page.name}
FACTS: ${page.facts || 'none beyond the name'}
${queries?.length ? `PEOPLE FIND THIS PAGE BY SEARCHING: ${queries.join(', ')}` : ''}

Rules:
- seoTitle: 45-60 characters. Lead with what the page is, in the words a shopper would search.${storeName ? ` End with " | ${storeName}", counted in the 60.` : ''}
- seoDescription: 130-155 characters. Say plainly what the page offers and why it's worth the click.
- Use only the facts above. Never invent discounts, free shipping, materials, guarantees or stock claims.
- No emojis, no capital-letter shouting, no quotation marks.

Return ONLY JSON: {"seoTitle":"","seoDescription":""}`;
}

async function writeMeta(workspaceId, page, context) {
  const ai = await resolveAi(workspaceId, 'article', 'deepseek');
  const raw = await deepseek.complete(metaPrompt(page, context), ai.apiKey, { temperature: 0.4, maxTokens: META_TOKENS, model: ai.model });
  const parsed = parseMeta(raw);
  const { seoTitle, seoDescription } = tidySeoFields({ title: page.name, handle: 'x', seoTitle: parsed.seoTitle, seoDescription: parsed.seoDescription });
  if (!seoTitle || seoDescription.length < MIN_SEO_DESCRIPTION) throw new Error('The AI returned metadata that was too short to use.');
  const claim = inventedClaim(`${seoTitle} ${seoDescription}`, page);
  if (claim) throw new Error(`The AI added a claim the page doesn't make: "${claim}"`);
  return { seoTitle, seoDescription };
}

async function fixMeta({ workspaceId, creds, page, context, audit, source }) {
  const before = await shopify.getResourceSeo(creds, page.type, page.id);
  const after = await writeMeta(workspaceId, page, context);
  await shopify.setResourceSeo(creds, page.type, page.id, after);
  await repo.logChange(workspaceId, {
    auditId: audit?.id, resourceType: page.type, resourceId: page.id, blogId: page.blogId, url: page.url, title: page.name,
    field: 'meta', before, after, source,
  });
}

// Alt text comes from the product's own name, so it can't describe the wrong thing.
async function fixAlt({ workspaceId, creds, page, audit, source }) {
  const missing = (page.images || []).filter((i) => !String(i.alt || '').trim());
  const before = [];
  const after = [];
  try {
    for (const image of missing) {
      const alt = (image.position || 1) > 1 ? `${page.name}, view ${image.position}` : page.name;
      await shopify.setImageAlt(creds, page.id, image.id, alt);
      before.push({ id: image.id, alt: image.alt || '' });
      after.push({ id: image.id, alt });
      await pause(IMAGE_PAUSE_MS);
    }
  } finally { // a failure partway must still leave the finished images undoable
    if (after.length) {
      await repo.logChange(workspaceId, {
        auditId: audit?.id, resourceType: page.type, resourceId: page.id, url: page.url, title: page.name,
        field: 'image_alt', before, after, source,
      });
    }
  }
}

// A dead link keeps its words and loses only the link.
async function fixLinks({ workspaceId, creds, page, live, audit, source }) {
  const dead = new Set(deadLinks(page.body, live));
  const body = page.body.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (full, href, label) => (dead.has(href) ? label : full));
  await shopify.updateArticle(creds, page.blogId, page.id, { title: page.name, bodyHtml: body });
  await repo.logChange(workspaceId, {
    auditId: audit?.id, resourceType: 'article', resourceId: page.id, blogId: page.blogId, url: page.url, title: page.name,
    field: 'article_links', before: { bodyHtml: page.body, links: [...dead] }, after: { links: [...dead] }, source,
  });
}

async function rewriteArticle({ workspaceId, creds, page, audit, source }) {
  const seo = await shopify.getArticleSeo(creds, page.id).catch(() => ({}));
  const enhanced = await enhanceArticleForWorkspace(workspaceId, {
    article: { title: page.name, bodyHtml: page.body, tags: page.tags, handle: page.handle, image: page.image, ...seo },
    aiModel: 'deepseek',
  });
  if (enhanced.warning) throw new Error(enhanced.warning); // never publish a version that lost images
  await shopify.updateArticle(creds, page.blogId, page.id, {
    title: enhanced.title, bodyHtml: withFaqSchema(enhanced.bodyHtml), tags: enhanced.tags, summary: enhanced.summary,
    seoTitle: enhanced.seoTitle, seoDescription: enhanced.seoDescription,
  });
  await repo.logChange(workspaceId, {
    auditId: audit?.id, resourceType: 'article', resourceId: page.id, blogId: page.blogId, url: page.url, title: page.name,
    field: 'article_body', before: { title: page.name, bodyHtml: page.body, ...seo }, after: { title: enhanced.title, aeo: enhanced.aeoScore?.score }, source,
  });
}

const allowed = (settings) => ({ meta: settings.fix_meta, alt: settings.fix_alt, links: settings.fix_links, article: settings.fix_articles });

// Applies the fixes one page needs. Failures are per fix: one bad page never stops the rest.
async function fixPage({ workspaceId, creds, page, types, kinds, live, context, audit, source }) {
  let applied = 0;
  const fixed = [];
  const run = async (kind, fn) => {
    const matching = types.filter((t) => ISSUE_TYPES[t]?.fix === kind);
    if (!matching.length || !kinds[kind]) return;
    try {
      await fn();
      applied++;
      fixed.push(...matching);
    } catch (err) {
      console.error(`SEO fix ${kind} failed on ${page.url}: ${err.response?.data?.errors ? JSON.stringify(err.response.data.errors) : err.message}`);
    }
  };
  await run('meta', () => fixMeta({ workspaceId, creds, page, context, audit, source }));
  await run('alt', () => fixAlt({ workspaceId, creds, page, audit, source }));
  await run('links', () => fixLinks({ workspaceId, creds, page, live, audit, source }));
  await run('article', () => rewriteArticle({ workspaceId, creds, page, audit, source }));
  if (fixed.length) await repo.markFixed(workspaceId, page.type, page.id, fixed);
  return applied;
}

// The daily run: the worst problems first, then the pages Google already shows most.
export async function applyFixes({ workspaceId, settings, creds, pages, issues, live, audit, search, queriesFor, storeName }) {
  const kinds = allowed(settings);
  const rested = await repo.recentlyChanged(workspaceId, RECHANGE_DAYS);
  const byPage = new Map();
  for (const issue of issues) {
    const fix = ISSUE_TYPES[issue.type]?.fix;
    const key = `${issue.resource_type}:${issue.resource_id}`;
    if (!fix || !kinds[fix] || rested.has(key)) continue;
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(issue);
  }

  const lookup = new Map(pages.map((p) => [`${p.type}:${p.id}`, p]));
  const views = (issue) => search?.pages?.get(issue.url)?.impressions || 0;
  const queue = [...byPage.entries()].sort(([, a], [, b]) => {
    const worst = (list) => Math.min(...list.map((i) => SEVERITY_ORDER[i.severity]));
    return worst(a) - worst(b) || views(b[0]) - views(a[0]);
  });

  let touched = 0;
  let rewrites = 0;
  for (const [key, found] of queue) {
    if (touched >= settings.max_fixes) break;
    const page = lookup.get(key);
    if (!page) continue;
    const allowRewrite = rewrites < MAX_ARTICLE_REWRITES;
    const pageKinds = { ...kinds, article: kinds.article && allowRewrite };
    const types = found.map((i) => i.type);
    if (!types.some((t) => pageKinds[ISSUE_TYPES[t].fix])) continue;
    const queries = await queriesFor?.(page.url).catch(() => []);
    const applied = await fixPage({
      workspaceId, creds, page, types, kinds: pageKinds, live, audit, source: 'auto', context: { storeName, queries },
    });
    if (applied) touched++;
    if (pageKinds.article && types.includes('aeo_low')) rewrites++;
  }
  return touched;
}

// One issue fixed on request. Ignores the automation's toggles: the owner just asked for it.
export async function fixOne({ workspaceId, creds, issue, page, live, storeName }) {
  const kinds = { meta: true, alt: true, links: true, article: true };
  const types = [issue.type];
  const applied = await fixPage({ workspaceId, creds, page, types, kinds, live, source: 'manual', context: { storeName } });
  if (!applied) throw Object.assign(new Error("This fix couldn't be applied. Please try again."), { status: 502 });
}

// Puts back exactly what a change replaced.
export async function undoChange(workspaceId, creds, id) {
  const change = await repo.claimUndo(workspaceId, id);
  if (!change) throw Object.assign(new Error('This change was already undone.'), { status: 400 });
  try {
    const before = change.before_value;
    if (change.field === 'meta') await shopify.restoreResourceSeo(creds, change.resource_type, change.resource_id, before);
    else if (change.field === 'image_alt') {
      for (const image of before) await shopify.setImageAlt(creds, change.resource_id, image.id, image.alt);
    } else if (change.field === 'article_links') {
      await shopify.updateArticle(creds, change.blog_id, change.resource_id, { title: change.title, bodyHtml: before.bodyHtml });
    } else if (change.field === 'article_body') {
      await shopify.updateArticle(creds, change.blog_id, change.resource_id, { title: before.title, bodyHtml: before.bodyHtml });
      await shopify.restoreResourceSeo(creds, 'article', change.resource_id, before);
    }
  } catch (err) {
    await repo.reopenChange(change.id);
    throw err;
  }
  return change;
}

import * as repo from '../repositories/seo.js';
import * as shopify from './shopify.js';
import * as deepseek from './deepseek.js';
import { resolveAi } from './ai.js';
import { enhanceArticleForWorkspace } from './articleService.js';
import { withFaqSchema } from '../lib/articleStructure.js';
import { ISSUE_TYPES, SEVERITY_ORDER, deadLinks } from '../lib/seoRules.js';
import { cleanDescription, cleanBody } from '../lib/seoClaims.js';

// Turns audit findings into changes on the live store. Every change saves what it
// replaced first, so it can be undone, and only the fields the owner allowed are touched.

const RECHANGE_DAYS = 14; // a changed field rests this long before it can change again
const MAX_ARTICLE_REWRITES = 1; // per run: these are the biggest changes the automation makes
const MAX_RULE_FIX_PAGES = 150; // alt text and dead links need no AI; this only bounds one run
const AI_TRIES_PER_FIX = 2; // a run stops asking the AI after max_fixes × this many pages, so a bad night can't loop
const META_ATTEMPTS = 2; // a rejected answer gets one more try, told what was wrong
const MIN_SEO_DESCRIPTION = 70;
const MIN_FACT_WORDS = 12; // below this the AI has nothing true to say about the page
const MAX_SEO_TITLE = 60;
const MAX_SEO_DESCRIPTION = 160;
const MAX_MANUAL_TITLE = 70; // an owner's own wording gets a little more room
const MAX_MANUAL_DESCRIPTION = 200;
const IMAGE_PAUSE_MS = 400; // Shopify allows about two admin calls a second
const CLAIMS_RE = /free (?:shipping|delivery)|\d+\s*% off|guarantee\w*|warranty|lowest price|best price|cash on delivery|\bcod\b|hypoallergenic|waterproof|anti[- ]tarnish/gi;

const AI_KINDS = new Set(['meta', 'article']);
// The earlier changes that make each kind of fix wait: a rewritten article also replaced its
// meta, and an owner who undid a promise fix wants that product's text left alone.
const BLOCKED_BY = {
  meta: ['meta', 'article_body'], alt: ['image_alt'], links: ['article_links', 'article_body'], article: ['article_body', 'meta'],
  claims: ['product_body'], hide: ['collection_published'],
};
const TYPES_BY_FIX = Object.entries(ISSUE_TYPES).reduce((map, [type, { fix }]) => {
  if (fix) (map[fix] ||= []).push(type);
  return map;
}, {});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A promise the page's own facts don't make can't go on the store, however well it reads.
function inventedClaim(text, page) {
  const known = `${page.name} ${page.facts || ''}`.toLowerCase();
  return (String(text).match(CLAIMS_RE) || []).find((claim) => !known.includes(claim.toLowerCase())) || null;
}

// A description over the limit falls back to its last whole sentence, never a cut-off one.
function wholeSentences(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const ending = [...clean.slice(0, max + 1).matchAll(/[.!?](?=\s|$)/g)].pop();
  if (!ending) throw new Error('The AI wrote a description too long to use.');
  return clean.slice(0, ending.index + 1);
}

function parseMeta(raw) {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The AI sent back no title and description.');
  try { return JSON.parse(match[0]); } catch { throw new Error('The AI sent back an answer that could not be read.'); }
}

// Nothing is cut to fit: a title cut off mid-phrase reads worse than the one it replaces.
function checkMeta(parsed, page, storeName) {
  const seoTitle = String(parsed.seoTitle || '').replace(/\s+/g, ' ').trim();
  const seoDescription = wholeSentences(parsed.seoDescription, MAX_SEO_DESCRIPTION);
  if (!seoTitle) throw new Error('The AI left the title empty.');
  if (seoTitle.length > MAX_SEO_TITLE) throw new Error(`The title was ${seoTitle.length} characters, over the ${MAX_SEO_TITLE} Google shows.`);
  if (seoDescription.length < MIN_SEO_DESCRIPTION) throw new Error('The description was too short to use.');
  const claim = inventedClaim(`${seoTitle} ${seoDescription}`, page);
  if (claim) throw new Error(`The AI added a claim the page doesn't make: "${claim}".`);
  const brand = storeName?.toLowerCase();
  if (brand && seoTitle.toLowerCase().split(brand).length > 2) throw new Error('The AI repeated the store name in the title.');
  return { seoTitle, seoDescription };
}

function metaPrompt(page, { storeName, queries }) {
  return `Write the Google search title and description for one page of ${storeName || 'an online store'}.

PAGE TYPE: ${page.type}
PAGE NAME: ${page.name}
FACTS: ${page.facts || 'none beyond the name'}
${queries?.length ? `PEOPLE FIND THIS PAGE BY SEARCHING: ${queries.join(', ')}` : ''}

Rules:
- seoTitle: 4 to 7 words. Lead with what the page is, in the words a shopper would search, such as the styles, materials or occasions the facts mention.${storeName ? ` End with " | ${storeName}".` : ''}
- seoDescription: one or two short sentences, about 20 words in all. Name what's actually on the page, using specifics from the facts: styles, finishes, stones, who it suits.
- Write like a helpful shop assistant, not an advert: no words like stunning, timeless, exquisite or perfect.
- Don't open with Browse, Explore or Discover, don't use the word "collection", and skip filler like "find what you want".
- Name the store only once, at the end of the title.
- Use only the facts above. Never invent discounts, free shipping, materials, guarantees or stock claims.
- No emojis, no capital-letter shouting, no quotation marks.
- Don't count characters. The length is checked afterwards.

Return ONLY JSON: {"seoTitle":"","seoDescription":""}`;
}

// A rejected answer gets one more try, told why. DeepSeek itself failing isn't retried here.
async function writeMeta(workspaceId, page, context) {
  const ai = await resolveAi(workspaceId, 'article', 'deepseek');
  let feedback = '';
  for (let attempt = 1; ; attempt++) {
    let raw;
    try {
      raw = await deepseek.complete(metaPrompt(page, context) + feedback, ai.apiKey, { temperature: 0.4, model: ai.model });
    } catch (err) {
      const status = err.response?.status;
      throw new Error(status ? `DeepSeek refused the request (error ${status}). Check the DeepSeek key and balance in Settings.` : 'DeepSeek did not answer. Please try again.');
    }
    try {
      return checkMeta(parseMeta(raw), page, context.storeName);
    } catch (err) {
      if (attempt >= META_ATTEMPTS) throw err;
      feedback = `\n\nYour last answer could not be used: ${err.message} Write a new one that follows every rule, with fewer words in the title if it was too long.`;
    }
  }
}

// A collection has no text of its own worth using, but its products say what it is. Any
// other page with almost no text (a contact form, an app's page) is left alone: the AI
// would only pad out the store name.
async function pageFacts(creds, page) {
  if (page.type === 'collection') {
    const titles = await shopify.getCollectionProductTitles(creds, page.id);
    if (!titles.length) throw new Error('This collection has no products yet, so there is nothing true to describe. Add products to it, or write the title and description yourself.');
    return `Products here include: ${titles.join('; ')}`;
  }
  if (String(page.facts || '').split(/\s+/).filter(Boolean).length < MIN_FACT_WORDS) {
    throw new Error("This page has almost no text of its own, so the AI can't describe it truthfully. Write the title and description yourself, or ignore this problem.");
  }
  return page.facts;
}

// An owner's own title and description, tidied and kept within what Google can show.
export function cleanManualMeta(input) {
  const tidy = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const seoTitle = tidy(input?.seoTitle);
  const seoDescription = tidy(input?.seoDescription);
  const bad = (message) => Object.assign(new Error(message), { status: 400 });
  if (!seoTitle || !seoDescription) throw bad('Write both a title and a description.');
  if (seoTitle.length > MAX_MANUAL_TITLE) throw bad(`Keep the title to ${MAX_MANUAL_TITLE} characters or fewer (it is ${seoTitle.length}).`);
  if (seoDescription.length > MAX_MANUAL_DESCRIPTION) throw bad(`Keep the description to ${MAX_MANUAL_DESCRIPTION} characters or fewer (it is ${seoDescription.length}).`);
  return { seoTitle, seoDescription };
}

// What the editor opens with: the page's current title and description, and the AI's
// suggestion, or the reason there isn't one.
export async function suggestMeta({ workspaceId, creds, page, storeName }) {
  const current = await shopify.getResourceSeo(creds, page.type, page.id);
  try {
    const suggestion = await writeMeta(workspaceId, { ...page, facts: await pageFacts(creds, page) }, { storeName });
    return { current, suggestion, note: null };
  } catch (err) {
    return { current, suggestion: null, note: err.message };
  }
}

async function fixMeta({ workspaceId, creds, page, context, audit, source, manual }) {
  const before = await shopify.getResourceSeo(creds, page.type, page.id);
  const after = manual || await writeMeta(workspaceId, { ...page, facts: await pageFacts(creds, page) }, context);
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

// What removing a product's false promises would change, worked out from Shopify's current
// text. Changes nothing; `error` says why it needs a person instead.
export async function planClaims(creds, page, facts) {
  if (!facts) return { error: 'Set your store facts in Settings first.' };
  const seo = await shopify.getResourceSeo(creds, 'product', page.id);
  const body = page.body || '';
  const description = cleanDescription(seo.seoDescription, facts);
  const text = cleanBody(body, facts);
  const error = description.error || text.error;
  const changes = [];
  if (description.changed) changes.push({ where: 'Google description', before: seo.seoDescription, after: description.text });
  for (const line of text.lines || []) changes.push({ where: 'Product text', before: line.before, after: line.after });
  return { seo, body, description, text, changes, error: error || (changes.length ? null : 'No promise left to remove: this one is already fixed.') };
}

async function fixClaims({ workspaceId, creds, page, context, audit, source }) {
  const plan = await planClaims(creds, page, context.facts);
  if (plan.error) throw new Error(plan.error);
  const entry = { auditId: audit?.id, resourceType: 'product', resourceId: page.id, url: page.url, title: page.name, source };
  if (plan.description.changed) {
    await shopify.setResourceSeo(creds, 'product', page.id, { seoDescription: plan.description.text });
    await repo.logChange(workspaceId, { ...entry, field: 'meta', before: plan.seo, after: { seoTitle: plan.seo.seoTitle, seoDescription: plan.description.text } });
  }
  if (plan.text.changed) {
    await shopify.setProductBody(creds, page.id, plan.text.html);
    const removed = plan.text.lines.map((l) => (l.after === null ? `"${l.before}"` : `"${l.before}" → "${l.after}"`));
    await repo.logChange(workspaceId, { ...entry, field: 'product_body', before: { bodyHtml: plan.body }, after: { removed } });
  }
}

// Only on request: hiding a page is the owner's call, never the daily run's.
async function hideCollection({ workspaceId, creds, page, audit, source }) {
  await shopify.setCollectionPublished(creds, page.collectionType, page.id, false);
  await repo.logChange(workspaceId, {
    auditId: audit?.id, resourceType: 'collection', resourceId: page.id, url: page.url, title: page.name,
    field: 'collection_published', before: { published: true, collectionType: page.collectionType }, after: { published: false }, source,
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

const allowed = (settings) => ({
  meta: settings.fix_meta, alt: settings.fix_alt, links: settings.fix_links, article: settings.fix_articles, claims: settings.fix_claims && Boolean(settings.store_facts),
});

const failure = (err) => (err.response?.data?.errors ? `Shopify refused the change: ${JSON.stringify(err.response.data.errors)}` : err.message);

// Applies the fixes one page needs. Failures are per fix: one bad page never stops the rest.
// One write settles every problem of its kind on the page, so all of them are marked fixed.
async function fixPage({ workspaceId, creds, page, types, kinds, live, context, audit, source, manual }) {
  const done = [];
  const errors = [];
  const run = async (kind, fn) => {
    if (!kinds[kind] || !types.some((t) => ISSUE_TYPES[t]?.fix === kind)) return;
    try {
      await fn();
      done.push(kind);
    } catch (err) {
      errors.push(failure(err));
      console.error(`SEO fix ${kind} failed on ${page.url}: ${failure(err)}`);
    }
  };
  await run('claims', () => fixClaims({ workspaceId, creds, page, context, audit, source })); // before meta: both edit the description
  await run('meta', () => fixMeta({ workspaceId, creds, page, context, audit, source, manual }));
  await run('alt', () => fixAlt({ workspaceId, creds, page, audit, source }));
  await run('links', () => fixLinks({ workspaceId, creds, page, live, audit, source }));
  await run('article', () => rewriteArticle({ workspaceId, creds, page, audit, source }));
  await run('hide', () => hideCollection({ workspaceId, creds, page, audit, source }));
  if (done.length) await repo.markFixed(workspaceId, page.type, page.id, done.flatMap((kind) => TYPES_BY_FIX[kind]));
  return { done, errors };
}

// The daily run: the worst problems first, then the pages Google already shows most. Only
// AI-written changes count toward the owner's daily limit; alt text and dead links follow
// fixed rules, so every page that needs them is done in the same run.
export async function applyFixes({ workspaceId, settings, creds, pages, issues, live, audit, search, queriesFor, storeName }) {
  const kinds = allowed(settings);
  const resting = await repo.recentlyChanged(workspaceId, RECHANGE_DAYS);
  const canFix = (key, kind) => kinds[kind] && !BLOCKED_BY[kind].some((field) => resting.get(key)?.has(field));
  const byPage = new Map();
  for (const issue of issues) {
    const fix = ISSUE_TYPES[issue.type]?.fix;
    const key = `${issue.resource_type}:${issue.resource_id}`;
    if (!fix || !canFix(key, fix)) continue;
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
  let aiPages = 0;
  let aiTries = 0;
  let rulePages = 0;
  let rewrites = 0;
  for (const [key, found] of queue) {
    const aiRoom = aiPages < settings.max_fixes && aiTries < settings.max_fixes * AI_TRIES_PER_FIX;
    const ruleRoom = rulePages < MAX_RULE_FIX_PAGES;
    if (!aiRoom && !ruleRoom) break;
    const page = lookup.get(key);
    if (!page) continue;
    const types = found.map((i) => i.type);
    const pageKinds = {
      meta: aiRoom && canFix(key, 'meta'),
      article: aiRoom && rewrites < MAX_ARTICLE_REWRITES && canFix(key, 'article'),
      alt: ruleRoom && canFix(key, 'alt'),
      links: ruleRoom && canFix(key, 'links'),
      claims: ruleRoom && canFix(key, 'claims'),
    };
    const wanted = Object.keys(pageKinds).filter((kind) => pageKinds[kind] && types.some((t) => ISSUE_TYPES[t].fix === kind));
    if (!wanted.length) continue;
    const usesAi = wanted.some((kind) => AI_KINDS.has(kind));
    const queries = usesAi ? await queriesFor?.(page.url).catch(() => []) : [];
    const { done } = await fixPage({
      workspaceId, creds, page, types, kinds: pageKinds, live, audit, source: 'auto', context: { storeName, queries, facts: settings.store_facts },
    });
    if (usesAi) aiTries++;
    if (done.some((kind) => AI_KINDS.has(kind))) aiPages++;
    if (done.some((kind) => !AI_KINDS.has(kind))) rulePages++;
    if (done.length) touched++;
    if (wanted.includes('article')) rewrites++;
  }
  return touched;
}

// One issue fixed on request. Ignores the automation's toggles: the owner just asked for it.
// `manual` is the owner's own title and description, used instead of asking the AI.
export async function fixOne({ workspaceId, creds, issue, page, live, storeName, facts, manual }) {
  const kind = ISSUE_TYPES[issue.type]?.fix;
  const kinds = { [kind]: true };
  const { done, errors } = await fixPage({
    workspaceId, creds, page, types: [issue.type], kinds, live, source: 'manual', context: { storeName, facts }, manual: kind === 'meta' ? manual : undefined,
  });
  if (!done.length) throw Object.assign(new Error(errors[0] || "This fix couldn't be applied."), { status: 422 });
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
    } else if (change.field === 'product_body') {
      await shopify.setProductBody(creds, change.resource_id, before.bodyHtml);
    } else if (change.field === 'collection_published') {
      await shopify.setCollectionPublished(creds, before.collectionType, change.resource_id, before.published);
    } else if (change.field === 'theme_file') {
      await shopify.putThemeAsset(creds, change.resource_id, before.key, before.value);
      if (before.addedSnippet) await shopify.deleteThemeAsset(creds, change.resource_id, before.addedSnippet).catch(() => {});
    }
  } catch (err) {
    await repo.reopenChange(change.id);
    throw err;
  }
  return change;
}

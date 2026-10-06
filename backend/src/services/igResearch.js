import * as repo from '../repositories/igStudio.js';
import * as igRepo from '../repositories/instagram.js';
import { getTextAi } from './igAi.js';
import { fetchProfile, fetchMedia, fetchRecentComments } from './instagram.js';
import { crawlWebsite, normalizeWebsiteUrl } from './websiteCrawl.js';

// Business DNA deep research (ported from the Insta Post Generator). Research
// first, then write:
//   1 collect  — Instagram profile + up to 50 captions + customer comments; a deep website crawl
//   2 extract  — per source excerpt, concrete facts with verbatim evidence
//   3 write    — the Business DNA from the research dossier only
//   4 verify   — fact-check the draft against the dossier
// The Studio queues a run on the account's row; the scheduler picks it up and
// records progress there, which the page shows live.

const CAPTIONS = 50;
const COMMENT_POSTS = 12;
const MAX_COMMENTS = 80;
const EXCERPT_CHARS = 9000;
const EXTRACT_CONCURRENCY = 3;
const MAX_FACTS = 150;
const MAX_LOG = 60;
const DEADLINE_MS = 8 * 60_000;
const MAX_CAPTION = 500;
const TOP_POSTS = 5;

const errText = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 240);

// Instagram + website data flattened into source text for fact extraction.
function sourceText({ instagram, website }) {
  const out = [];
  if (instagram) {
    const ig = instagram;
    out.push('## Instagram profile', `Username: @${ig.username}`);
    if (ig.name) out.push(`Name: ${ig.name}`);
    if (ig.biography) out.push(`Bio: ${ig.biography}`);
    if (ig.website) out.push(`Link in bio: ${ig.website}`);
    if (ig.followers != null) out.push(`Followers: ${ig.followers}`);
    if (ig.mediaCount != null) out.push(`Total posts: ${ig.mediaCount}`);
    const posts = ig.posts.filter((p) => p.caption?.trim());
    if (posts.length) {
      const engagement = (p) => (p.likes ?? 0) + (p.comments ?? 0);
      const top = new Set([...posts].sort((a, b) => engagement(b) - engagement(a)).slice(0, TOP_POSTS));
      out.push('', `## Recent Instagram captions (newest first; ★ = top ${TOP_POSTS} by engagement)`);
      for (const p of posts) {
        const caption = p.caption.replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION);
        out.push(`- ${top.has(p) ? '★ ' : ''}[${String(p.timestamp || '').slice(0, 10)} · ${p.likes ?? '?'} likes, ${p.comments ?? '?'} comments] ${caption}`);
      }
    }
  }
  for (const page of website?.pages || []) {
    out.push('', `## Website page: ${page.url}`);
    if (page.title) out.push(`Title: ${page.title}`);
    if (page.description) out.push(`Description: ${page.description}`);
    if (page.headings.length) out.push(`Headings: ${page.headings.join(' | ')}`);
    if (page.structuredData) out.push(`Structured data: ${page.structuredData}`);
    if (page.text) out.push(`Text:\n${page.text}`);
  }
  return out.join('\n').trim();
}

// Split text into chunks of at most `max` chars, on line boundaries.
function chunkText(text, max = EXCERPT_CHARS) {
  const chunks = [];
  let cur = '';
  for (const line of text.split('\n')) {
    const piece = line.length > max ? line.slice(0, max) : line;
    if (cur && cur.length + piece.length + 1 > max) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + piece;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Merge per-excerpt findings: de-duplicate facts and samples, cap sizes.
function mergeFindings(parts) {
  const facts = [];
  const seen = new Set();
  for (const p of parts) {
    for (const f of p.facts) {
      const key = norm(f.fact);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      facts.push({ ...f, source: p.source });
    }
  }
  const uniq = (xs, cap) => {
    const s = new Set();
    return xs.filter((x) => {
      const k = norm(x);
      if (!k || s.has(k)) return false;
      s.add(k);
      return true;
    }).slice(0, cap);
  };
  return {
    facts: facts.slice(0, MAX_FACTS),
    voice_samples: uniq(parts.flatMap((p) => p.voice_samples), 15),
    customer_signals: uniq(parts.flatMap((p) => p.customer_signals), 15),
  };
}

// The dossier as prompt text — the only thing synthesis and fact-checking see.
function dossierText(d) {
  const out = ['## Research dossier — facts found in the sources, each with its evidence'];
  const byCat = new Map();
  for (const f of d.facts) byCat.set(f.category, [...(byCat.get(f.category) || []), f]);
  let n = 0;
  for (const [cat, facts] of byCat) {
    out.push(`\n### ${cat}`);
    for (const f of facts) {
      n++;
      out.push(`[F${n}] ${f.fact}${f.evidence ? ` — "${f.evidence}"` : ''} (${f.source})`);
    }
  }
  if (!d.facts.length) out.push('(no facts found)');
  if (d.voice_samples.length) out.push('\n## How the brand writes (verbatim samples)', ...d.voice_samples.map((v) => `- "${v}"`));
  if (d.customer_signals.length) out.push('\n## What customers say / ask', ...d.customer_signals.map((c) => `- ${c}`));
  return out.join('\n').slice(0, 30_000);
}

// Run `fn` over items with at most `limit` in flight, keeping order.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// Pure orchestration: collects, extracts, writes and verifies; reports progress via onProgress.
export async function runBusinessResearch({ ai, account, websiteUrl, onProgress }) {
  const started = Date.now();
  const deadline = started + DEADLINE_MS;
  const progress = (e) => onProgress?.(e);
  const sources = {};
  const excerpts = [];
  let captions = 0;
  let commentCount = 0;

  // ---- 1) Collect
  await progress({ phase: 'researching', step: 'Research started' });
  let profile = null;
  if (account) {
    await progress({ step: 'Reading the Instagram profile and recent posts' });
    try {
      let media;
      [profile, media] = await Promise.all([fetchProfile(account), fetchMedia(account, CAPTIONS)]);
      captions = media.filter((m) => m.caption?.trim()).length;
      sources.instagram = { username: profile.username, posts_analyzed: captions, followers: profile.followers };
      const text = sourceText({ instagram: { ...profile, posts: media } });
      chunkText(text).forEach((t, i) => excerpts.push({ source: `instagram profile & captions${i ? ` (${i + 1})` : ''}`, text: t }));
      await progress({ step: `Instagram: @${profile.username}`, detail: `${captions} captions, ${profile.followers ?? '?'} followers` });
    } catch (err) {
      sources.instagram = { username: null, posts_analyzed: 0, followers: null, error: errText(err) };
      await progress({ step: "Instagram profile couldn't be read", detail: errText(err), level: 'warn' });
    }

    if (profile) {
      await progress({ step: 'Reading what customers comment' });
      try {
        const own = profile.username.toLowerCase();
        const comments = (await fetchRecentComments(account, { since: new Date(Date.now() - 365 * 864e5), mediaLimit: COMMENT_POSTS, perMedia: 20 }))
          .filter((c) => c.author?.toLowerCase() !== own)
          .slice(0, MAX_COMMENTS);
        commentCount = comments.length;
        if (comments.length) {
          const text = ['## Comments customers left on recent posts',
            ...comments.map((c) => `- @${c.author || 'someone'}: ${c.text.replace(/\s+/g, ' ').slice(0, 300)}`)].join('\n');
          for (const t of chunkText(text)) excerpts.push({ source: 'instagram comments', text: t });
        }
        await progress({ step: `Customer comments: ${comments.length}` });
      } catch (err) {
        await progress({ step: 'Comments skipped', detail: errText(err), level: 'warn' });
      }
    }
  }

  const websiteInput = websiteUrl || profile?.website || null;
  let website = null;
  if (websiteInput) {
    let url;
    try { url = normalizeWebsiteUrl(websiteInput); } catch (err) { url = null; await progress({ step: 'Website skipped', detail: errText(err), level: 'warn' }); }
    if (url) {
      await progress({ step: `Crawling the website ${new URL(url).hostname}`, detail: 'about, products, pricing, FAQ, reviews, policies…' });
      try {
        website = await crawlWebsite(url);
        sources.website = { url: website.url, pages: website.pages.map((p) => p.url) };
        for (const page of website.pages) {
          const text = sourceText({ website: { pages: [page] } });
          const path = new URL(page.url).pathname || '/';
          for (const t of chunkText(text)) excerpts.push({ source: `website: ${path}`, text: t });
        }
        const chars = website.pages.reduce((n, p) => n + p.text.length, 0);
        await progress({ step: `Website: ${website.pages.length} page${website.pages.length === 1 ? '' : 's'} read`, detail: website.pages.map((p) => new URL(p.url).pathname).join(', ') });
        if (chars < 300) {
          await progress({ step: 'Very little readable text on the website', detail: 'It may be built with JavaScript — the result leans on Instagram.', level: 'warn' });
        }
      } catch (err) {
        sources.website = { url, pages: [], error: errText(err) };
        await progress({ step: "Website couldn't be read", detail: errText(err), level: 'warn' });
      }
    }
  }
  if (!excerpts.length) throw new Error('Nothing to research — add a website URL or include the Instagram account.');

  // ---- 2) Extract facts
  await progress({ phase: 'analyzing', step: `Extracting facts from ${excerpts.length} source excerpt${excerpts.length === 1 ? '' : 's'}` });
  const parts = await mapLimit(excerpts, EXTRACT_CONCURRENCY, async (ex) => {
    try {
      const r = await ai.extractResearchFacts(ex.source, ex.text, { deadline });
      await progress({ step: `✓ ${ex.source}`, detail: `${r.facts.length} facts` });
      return { source: ex.source, ...r };
    } catch (err) {
      await progress({ step: `✗ ${ex.source}`, detail: errText(err), level: 'warn' });
      return null;
    }
  });
  const found = parts.filter(Boolean);
  if (!found.length) throw new Error("The AI couldn't read any of the sources — try again in a minute.");
  const merged = mergeFindings(found);
  if (!merged.facts.length) throw new Error('The research found no concrete facts about the business in these sources.');
  await progress({ step: `Research complete: ${merged.facts.length} facts`, detail: `${merged.voice_samples.length} voice samples, ${merged.customer_signals.length} customer signals` });

  // ---- 3) Write from the research only; 4) fact-check
  const text = dossierText(merged);
  await progress({ step: 'Writing the Business DNA from the research' });
  const { gaps, ...draft } = await ai.synthesizeBusinessDna(text, { deadline });
  await progress({ step: 'Fact-checking every field against the research' });
  let dna = draft;
  try {
    dna = await ai.verifyBusinessDna(text, draft, { deadline });
  } catch (err) {
    await progress({ step: "Fact-check didn't finish — keeping the draft written from the research", detail: errText(err), level: 'warn' });
  }

  const dossier = {
    ...merged,
    gaps,
    stats: {
      captions, comments: commentCount, pages: website?.pages.length ?? 0, excerpts: excerpts.length,
      facts: merged.facts.length, seconds: Math.round((Date.now() - started) / 1000),
    },
  };
  await progress({ step: 'Done', detail: `${dossier.stats.seconds}s` });
  return { dna, dossier, sources, websiteUrl: website?.url ?? sources.website?.url ?? null };
}

// Scheduler hook: claim one queued research run and execute it (1–3 minutes).
export async function runDueResearch() {
  const first = [{ at: new Date().toISOString(), step: 'Picked up by the research worker' }];
  const row = await repo.claimNextResearch(first);
  if (!row) return false;
  const accountId = row.account_id;
  const log = [...first];
  let status = 'researching';
  try {
    const req = row.research_request || {};
    const ai = await getTextAi(row.workspace_id);
    const account = req.include_instagram ? await igRepo.getAccountWithToken(accountId) : null;
    const result = await runBusinessResearch({
      ai,
      account,
      websiteUrl: req.website_url || null,
      onProgress: async (e) => {
        if (e.phase) status = e.phase;
        log.push({ at: new Date().toISOString(), step: e.step, detail: e.detail ?? null, level: e.level ?? 'info' });
        await repo.setResearchProgress(accountId, status, log.slice(-MAX_LOG));
      },
    });
    await repo.finishResearch(accountId, { ...result, progress: log.slice(-MAX_LOG) });
    await repo.log({ workspaceId: row.workspace_id, accountId, stage: 'research', message: `Business DNA built from ${result.dossier.stats.facts} facts in ${result.dossier.stats.seconds}s` });
  } catch (err) {
    log.push({ at: new Date().toISOString(), step: 'Research failed', detail: errText(err), level: 'warn' });
    await repo.failResearch(accountId, errText(err), log.slice(-MAX_LOG));
    await repo.log({ workspaceId: row.workspace_id, accountId, stage: 'research', level: 'error', message: errText(err) });
  }
  return true;
}

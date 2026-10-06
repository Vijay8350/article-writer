import config from '../config/env.js';
import * as repo from '../repositories/igStudio.js';
import * as igRepo from '../repositories/instagram.js';
import { getTextAi } from './igAi.js';
import * as media from './igMedia.js';
import { publishPost } from './instagram.js';
import { buildImagePrompt } from '../lib/igPrompts.js';
import { normalizeHash } from '../lib/igSchemas.js';
import { assertCanGenerateIgPost, incrementIgUsage } from './usage.js';

// The Instagram Studio pipeline (ported from the Insta Post Generator):
//   1 idea (DeepSeek, de-duplicated) → 2 post text (DeepSeek, strict JSON)
//   → 3 image (Gemini, text baked in) → 4 quality gate (Gemini vision; regenerate
//   up to MAX_REGEN_ATTEMPTS, then fail closed) → 5 publish (Graph API).
// Used by the Studio's buttons, campaigns, and the autopilot slots.

const DAILY_PUBLISH_LIMIT = 25; // our own cap per account, well under Instagram's API limit
const MAX_CAPTION = 2200;
const MAX_HASHTAGS = 30;
const SLOT_WINDOW_MIN = 15; // a slot can start up to this late (server restart, busy tick)

const errText = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// ─── Stage 1 + 2: idea → text ────────────────────────────────────────────────

export async function generatePostText(workspaceId, accountId, { promptText, sourcePromptId = null, campaign = null, origin = 'manual', userId = null }) {
  await assertCanGenerateIgPost(workspaceId);
  const [dna, business, ai, recent] = await Promise.all([
    repo.getDna(workspaceId, accountId),
    repo.getActiveBusinessDna(accountId),
    getTextAi(workspaceId),
    repo.recentIdeaSummaries(accountId),
  ]);

  // A fresh idea: a hash collision means it's a repeat — steer away from it and retry.
  let idea;
  let ideaId = null;
  for (let attempt = 0; attempt < 3 && !ideaId; attempt++) {
    idea = await ai.generateIdea(dna, promptText, recent, business);
    ideaId = await repo.insertIdea(workspaceId, accountId, { idea, sourcePromptId, hash: normalizeHash(idea.summary) });
    if (!ideaId) recent.unshift(idea.summary);
  }
  if (!ideaId) throw badRequest("Couldn't come up with a fresh idea — every one repeated a past post. Try another prompt.");

  const content = await ai.generateContent(dna, idea, business);
  const post = await repo.createPost(workspaceId, accountId, {
    ideaId, campaignId: campaign?.id, ...content, origin, createdBy: userId,
  });
  await incrementIgUsage(workspaceId);
  if (sourcePromptId) await repo.bumpPrompt(sourcePromptId);
  if (campaign) await repo.bumpCampaign(campaign.id);
  await repo.log({ workspaceId, accountId, postId: post.id, stage: 'text', message: `Wrote "${content.headline}"`, context: { origin, idea: idea.summary } });
  return post;
}

// ─── Stage 3 + 4: image → quality gate (regenerate, fail closed) ─────────────

export async function generatePostImage(workspaceId, postId) {
  const post = await repo.claimPost(workspaceId, postId, ['draft', 'qa_failed', 'ready'], 'generating');
  if (!post) throw badRequest('This post is busy or already published.');
  const accountId = post.account_id;
  try {
    const apiKey = await media.geminiKeyFor(workspaceId);
    const [dna, imgPrompt, campaign] = await Promise.all([
      repo.getDna(workspaceId, accountId),
      repo.pickPrompt(accountId, 'image_idea'),
      post.campaign_id ? repo.getCampaign(workspaceId, post.campaign_id) : null,
    ]);
    const references = campaign?.reference_images?.length ? await media.loadReferenceImages(campaign.reference_images) : [];
    const intended = { headline: post.headline || '', lines: post.lines || [] };
    const prompt = buildImagePrompt(dna, imgPrompt?.prompt_text || null, intended, { hasReferences: references.length > 0 });

    let jpeg = null;
    let verdict = null;
    let attempts = 0;
    while (attempts < config.instagram.maxRegenAttempts) {
      attempts++;
      jpeg = await media.generateImage(prompt, apiKey, references);
      verdict = await media.scoreImage(jpeg, intended, dna, apiKey);
      await repo.log({
        workspaceId, accountId, postId,
        stage: 'quality_gate',
        level: verdict.pass ? 'info' : 'warn',
        message: `Image attempt ${attempts}: ${verdict.pass ? 'passed' : 'failed'} (score ${verdict.score})`,
        context: { reasons: verdict.reasons, rendered_text: verdict.renderedText },
      });
      if (verdict.pass) break;
    }
    if (imgPrompt) await repo.bumpPrompt(imgPrompt.id);

    // The last attempt is kept either way, so a failed one can be reviewed.
    const file = await media.saveImage(jpeg);
    await media.deleteImage(post.image_file);
    if (!verdict.pass) {
      await repo.log({ workspaceId, accountId, postId, stage: 'quality_gate', level: 'warn', message: `Quality gate failed after ${attempts} attempts — not publishable` });
    }
    return repo.updatePost(post.id, {
      image_file: file,
      status: verdict.pass ? 'ready' : 'qa_failed',
      qa_score: verdict.score,
      qa_reasons: verdict.reasons,
      regen_attempts: attempts,
    });
  } catch (err) {
    await repo.updatePost(post.id, { status: post.prev_status, error: errText(err) });
    await repo.log({ workspaceId, accountId, postId, stage: 'image', level: 'error', message: errText(err) });
    throw err;
  }
}

// ─── Stage 5: publish ────────────────────────────────────────────────────────

// Caption + hashtags within Instagram's limits (2,200 characters, 30 hashtags).
function buildCaption(post) {
  const body = String(post.caption || '').trim();
  const inBody = (body.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  const tags = (post.hashtags || []).slice(0, Math.max(0, MAX_HASHTAGS - inBody)).join(' ');
  const tail = tags ? `\n\n${tags}` : '';
  return body.slice(0, MAX_CAPTION - tail.length) + tail;
}

// Only posts whose image passed the quality gate can be published — never forced.
export async function publishGeneratedPost(workspaceId, postId) {
  const problem = media.publicUrlProblem();
  if (problem) throw badRequest(problem);
  const post = await repo.claimPost(workspaceId, postId, ['ready'], 'publishing');
  if (!post) throw badRequest('Only a post whose image passed the quality check can be published.');
  const { account_id: accountId } = post;
  try {
    if (!post.image_file) throw badRequest('Generate the image first.');
    if ((await repo.publishedLast24h(accountId)) >= DAILY_PUBLISH_LIMIT) {
      throw badRequest(`Daily limit reached (${DAILY_PUBLISH_LIMIT} posts in 24 hours) — try again later.`);
    }
    const account = await igRepo.getAccountWithToken(accountId);
    if (!account) throw badRequest('The Instagram account is no longer connected.');
    const { mediaId, permalink } = await publishPost(account, [media.publicImageUrl(post.image_file)], buildCaption(post));
    const done = await repo.updatePost(post.id, { status: 'published', ig_media_id: mediaId, permalink, published_at: new Date(), error: null });
    await repo.log({ workspaceId, accountId, postId, stage: 'publish', message: `Published to @${account.username}`, context: { mediaId, permalink } });
    return done;
  } catch (err) {
    await repo.updatePost(post.id, { status: 'ready', error: errText(err) });
    await repo.log({ workspaceId, accountId, postId, stage: 'publish', level: 'error', message: errText(err) });
    throw err;
  }
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export function campaignSeed(campaign) {
  return campaign.prompt || campaign.topic || campaign.name;
}

// "Generate one" for a campaign: the text stage, linked to the campaign.
export async function generateFromCampaign(workspaceId, campaign, userId) {
  return generatePostText(workspaceId, campaign.account_id, {
    promptText: campaignSeed(campaign), campaign, origin: 'campaign', userId,
  });
}

// ─── Autopilot ───────────────────────────────────────────────────────────────

// Local minute-of-day and YYYY-MM-DD in a time zone.
function localParts(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { minutes: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// One autopilot slot, end to end. The seed is the account's active campaign if it
// has one, else its least recently used quote-idea prompt. Never throws.
async function runSlot({ workspace_id: workspaceId, account_id: accountId }, slot) {
  try {
    const campaign = await repo.activeCampaignFor(accountId);
    let seed;
    let sourcePromptId = null;
    if (campaign) {
      seed = campaignSeed(campaign);
    } else {
      const prompt = await repo.pickPrompt(accountId, 'quote_idea');
      if (!prompt) {
        await repo.log({ workspaceId, accountId, stage: 'autopilot', level: 'warn', message: `Slot ${slot} skipped: add an active quote-idea prompt (Prompts tab)` });
        return;
      }
      seed = prompt.prompt_text;
      sourcePromptId = prompt.id;
    }
    await repo.log({ workspaceId, accountId, stage: 'autopilot', message: `Slot ${slot} started${campaign ? ` (campaign "${campaign.name}")` : ''}` });
    const post = await generatePostText(workspaceId, accountId, {
      promptText: seed, sourcePromptId, campaign, origin: campaign ? 'campaign' : 'auto',
    });
    const imaged = await generatePostImage(workspaceId, post.id);
    if (imaged.status !== 'ready') {
      await repo.log({ workspaceId, accountId, postId: post.id, stage: 'autopilot', level: 'warn', message: `Slot ${slot}: the image failed the quality gate — skipped, nothing published` });
      return;
    }
    await publishGeneratedPost(workspaceId, post.id);
  } catch (err) {
    await repo.log({ workspaceId, accountId, stage: 'autopilot', level: 'error', message: `Slot ${slot} failed: ${errText(err)}` });
  }
}

// Scheduler hook: run at most one due slot. A slot is due during the first
// SLOT_WINDOW_MIN minutes after its local time, and runs once per local day.
export async function runDueAutopilot() {
  for (const account of await repo.autopilotAccounts()) {
    let local;
    try { local = localParts(account.timezone || 'UTC'); } catch { continue; } // invalid zone
    for (const slot of new Set(account.posting_slots)) {
      const start = toMinutes(slot);
      if (start == null || local.minutes < start || local.minutes >= start + SLOT_WINDOW_MIN) continue;
      if (!(await repo.claimSlot(account.account_id, local.date, slot))) continue;
      console.log(`📸 Instagram autopilot: account ${account.account_id} slot ${slot}`);
      await runSlot(account, slot);
      return true;
    }
  }
  return false;
}

// ─── Business DNA → Account DNA ──────────────────────────────────────────────

const mergeUnique = (a, b) => [...new Set([...(a || []), ...(b || [])])];

// Map the Business DNA onto Account DNA fields ("Apply to Account DNA"). Voice,
// audience, niche, pillars and language are replaced when the business has a
// value; do's/don'ts are merged; hashtag strategy and visual style are only
// filled in when the account doesn't have them yet.
export function businessToAccountDnaPatch(b, existing) {
  const patch = {};
  const fields = [];
  const set = (key, value, label) => { patch[key] = value; fields.push(label); };
  if (b.brand_voice) set('persona', b.brand_voice, 'persona');
  if (b.tone) set('tone', b.tone, 'tone');
  if (b.target_customers) set('audience', b.target_customers, 'audience');
  if (b.industry) set('niche', b.business_name ? `${b.industry} — ${b.business_name}` : b.industry, 'niche');
  if (b.content_themes?.length) set('content_pillars', b.content_themes, 'content pillars');
  if (b.language) set('language', b.language, 'language');
  if (b.dos?.length) set('dos', mergeUnique(existing?.dos, b.dos), "do's");
  if (b.donts?.length) set('donts', mergeUnique(existing?.donts, b.donts), "don'ts");
  if (b.keywords?.length && !existing?.hashtag_strategy) {
    set('hashtag_strategy', `Mix broad, medium and niche hashtags built around: ${b.keywords.slice(0, 12).join(', ')}.`, 'hashtag strategy');
  }
  if (b.visual_cues && !existing?.visual_identity?.style) {
    set('visual_identity', { ...(existing?.visual_identity || {}), style: b.visual_cues }, 'visual style');
  }
  return { patch, fields };
}

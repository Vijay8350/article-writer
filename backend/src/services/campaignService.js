import * as campaigns from '../repositories/campaigns.js';
import { getKeywordIdeas, isDuplicate } from './keywordIdeas.js';
import { loadUserContext, generateArticleForUser, publishArticleForUser } from './articleService.js';

// Product titles most relevant to a category (token overlap), fallback to all.
function relevantProductTitles(dna, collectionTitle) {
  const products = dna.products || [];
  const toks = new Set(String(collectionTitle).toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const scored = products.map((p) => {
    const hay = `${p.title} ${p.productType || ''} ${p.tags || ''}`.toLowerCase();
    let s = 0;
    for (const t of toks) if (hay.includes(t)) s++;
    return { title: p.title, s };
  });
  const matched = scored.filter((x) => x.s > 0).map((x) => x.title);
  return (matched.length ? matched : products.map((p) => p.title)).slice(0, 25);
}

function nextPeriod(cadence) {
  if (cadence === 'manual') return null;
  const d = new Date();
  if (cadence === 'daily') return new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString();
  if (cadence === 'monthly') { d.setMonth(d.getMonth() + 1); return d.toISOString(); }
  return null;
}

// Generates + publishes ONE article for a campaign. Returns { stopRun } where
// stopRun ends the current run early (e.g. monthly limit hit, no DNA).
export async function runOneArticleForCampaign(campaign) {
  const userId = campaign.user_id;
  try {
    if (!campaign.blog_id) {
      await campaigns.logArticle(campaign.id, userId, { status: 'failed', error: 'No blog selected for this campaign' });
      return { stopRun: true };
    }

    const { dna, keys } = await loadUserContext(userId);
    if (!dna) {
      await campaigns.logArticle(campaign.id, userId, { status: 'failed', error: 'Business DNA not fetched' });
      return { stopRun: true };
    }

    const covered = [
      ...(dna.articles || []).map((a) => a.title).filter(Boolean),
      ...(await campaigns.coveredTitles(userId)),
    ];
    const productTitles = relevantProductTitles(dna, campaign.collection_title);
    const apiKey = (campaign.ai_model === 'deepseek' ? keys.deepseekKey : keys.geminiKey) || undefined;

    const ideas = await getKeywordIdeas({
      collectionTitle: campaign.collection_title,
      niche: dna.analysis?.niche,
      productTitles,
      excludeTitles: covered,
      count: 8,
      aiModel: campaign.ai_model,
      apiKey,
    });

    const fresh = ideas.find((i) => !isDuplicate(i.title, covered));
    if (!fresh) {
      await campaigns.logArticle(campaign.id, userId, { status: 'skipped_duplicate', error: 'No fresh keyword ideas (all overlap existing topics)' });
      return {};
    }

    // Enforces the monthly plan limit + image-aware generation.
    const generated = await generateArticleForUser(userId, {
      topic: fresh.title,
      wordCount: campaign.word_count,
      aiModel: campaign.ai_model,
    });

    const publishLive = campaign.publish_mode === 'live';
    const created = await publishArticleForUser(userId, campaign.blog_id, { ...generated, published: publishLive });

    await campaigns.logArticle(campaign.id, userId, {
      keyword: fresh.keyword,
      title: generated.title,
      status: publishLive ? 'published' : 'draft',
      publishedArticleId: created.id,
    });
    return {};
  } catch (err) {
    if (err.code === 'LIMIT_REACHED') {
      await campaigns.logArticle(campaign.id, userId, { status: 'limit_reached', error: err.message });
      return { stopRun: true }; // stop the run rather than hammering the limit
    }
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    await campaigns.logArticle(campaign.id, userId, { status: 'failed', error: msg });
    return {};
  }
}

// Worker entry: process ONE article for the next due campaign. Returns true if
// it did work (so the scheduler knows a generation happened this tick).
export async function runDueCampaignArticle() {
  const campaign = await campaigns.findDue();
  if (!campaign) return false;

  // run_remaining 0 + due == the start of a fresh run.
  let runRemaining = campaign.run_remaining > 0 ? campaign.run_remaining : campaign.articles_per_run;

  const result = await runOneArticleForCampaign(campaign);

  runRemaining = result.stopRun ? 0 : runRemaining - 1;

  // While the run still has articles left, keep next_run_at in the past so the
  // worker picks it again next tick. When done, schedule the next period.
  const nextRunAt = runRemaining > 0 ? campaign.next_run_at : nextPeriod(campaign.cadence);

  await campaigns.updateRunState(campaign.id, { runRemaining, nextRunAt });
  return true;
}

export default { runOneArticleForCampaign, runDueCampaignArticle };

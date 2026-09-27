import * as campaigns from '../repositories/campaigns.js';
import { getKeywordIdeas, isDuplicate } from './keywordIdeas.js';
import { resolveAi } from './ai.js';
import { loadWorkspaceContext, generateArticleForWorkspace, publishArticleForWorkspace } from './articleService.js';

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

export async function runOneArticleForCampaign(campaign) {
  const workspaceId = campaign.workspace_id;
  const actor = campaign.created_by; // user who set up the campaign
  try {
    if (!campaign.blog_id) {
      await campaigns.logArticle(campaign.id, workspaceId, { status: 'failed', error: 'No blog selected for this campaign' });
      return { stopRun: true };
    }

    const { dna } = await loadWorkspaceContext(workspaceId);
    if (!dna) {
      await campaigns.logArticle(campaign.id, workspaceId, { status: 'failed', error: 'Business DNA not fetched' });
      return { stopRun: true };
    }

    const covered = [
      ...(dna.articles || []).map((a) => a.title).filter(Boolean),
      ...(await campaigns.coveredTitles(workspaceId)),
    ];
    const productTitles = relevantProductTitles(dna, campaign.collection_title);
    const ideas = await getKeywordIdeas({
      collectionTitle: campaign.collection_title,
      niche: dna.analysis?.niche,
      productTitles,
      excludeTitles: covered,
      count: 8,
      ai: await resolveAi(workspaceId, 'article', campaign.ai_model),
    });

    const fresh = ideas.find((i) => !isDuplicate(i.title, covered));
    if (!fresh) {
      await campaigns.logArticle(campaign.id, workspaceId, { status: 'skipped_duplicate', error: 'No fresh keyword ideas (all overlap existing topics)' });
      return {};
    }

    const generated = await generateArticleForWorkspace(workspaceId, {
      topic: fresh.title,
      wordCount: campaign.word_count,
      aiModel: campaign.ai_model,
    }, actor);

    const publishLive = campaign.publish_mode === 'live';
    const created = await publishArticleForWorkspace(workspaceId, campaign.blog_id, { ...generated, published: publishLive }, actor);

    await campaigns.logArticle(campaign.id, workspaceId, {
      keyword: fresh.keyword,
      title: generated.title,
      status: publishLive ? 'published' : 'draft',
      publishedArticleId: created.id,
    });
    return {};
  } catch (err) {
    if (err.code === 'LIMIT_REACHED') {
      await campaigns.logArticle(campaign.id, workspaceId, { status: 'limit_reached', error: err.message });
      return { stopRun: true };
    }
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    await campaigns.logArticle(campaign.id, workspaceId, { status: 'failed', error: msg });
    return {};
  }
}

export async function runDueCampaignArticle() {
  const campaign = await campaigns.findDue();
  if (!campaign) return false;
  let runRemaining = campaign.run_remaining > 0 ? campaign.run_remaining : campaign.articles_per_run;
  const result = await runOneArticleForCampaign(campaign);
  runRemaining = result.stopRun ? 0 : runRemaining - 1;
  const nextRunAt = runRemaining > 0 ? campaign.next_run_at : nextPeriod(campaign.cadence);
  await campaigns.updateRunState(campaign.id, { runRemaining, nextRunAt });
  return true;
}

export default { runOneArticleForCampaign, runDueCampaignArticle };

import axios from 'axios';
import config from '../config/env.js';
import { readWebsite } from './website.js';
import { resolveAi } from './ai.js';
import { getBlogs } from './shopify.js';
import * as igRepo from '../repositories/instagram.js';
import * as stores from '../repositories/stores.js';
import * as dnaRepo from '../repositories/dna.js';

// Builds a workspace's Business DNA from its Instagram account and/or public
// website instead of the Shopify Admin API. Produces the same shape the article
// pipeline reads (shop / analysis / products / collections / articles / blogs)
// plus a `brand` profile the AI distils from the bio, captions and site copy.

const IG_HOSTS = { instagram: 'https://graph.instagram.com', facebook: 'https://graph.facebook.com' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const uniq = (list) => [...new Set(list.filter(Boolean))];

function topCounts(items, n) {
  const counts = {};
  for (const i of items) counts[i] = (counts[i] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

// ─── Instagram (read-only Graph API) ─────────────────────────────────────────

async function igGet(account, path, fields, extra = {}) {
  try {
    const { data } = await axios.get(`${IG_HOSTS[account.token_type]}/${config.instagram.apiVersion}${path}`, {
      params: { fields, access_token: account.accessToken, ...extra },
      timeout: 30000,
    });
    return data;
  } catch (error) {
    const e = error.response?.data?.error;
    throw Object.assign(new Error(e ? e.error_user_msg || e.message : error.message), { igCode: e?.code });
  }
}

// Instagram-Login tokens don't expose every field Facebook-Login tokens do, and an
// unknown field fails the whole call with #100 — so retry with the basic set.
async function igGetWithFallback(account, path, [rich, basic], extra) {
  try {
    return await igGet(account, path, rich, extra);
  } catch (err) {
    if (err.igCode !== 100) throw err;
    return igGet(account, path, basic, extra);
  }
}

async function readInstagram(workspaceId, accountId) {
  // getAccountWithToken isn't workspace-scoped, so check ownership first.
  const meta = UUID.test(String(accountId)) ? await igRepo.getAccountMeta(workspaceId, accountId) : null;
  if (!meta) throw badRequest('That Instagram account is not connected to this workspace');
  const account = await igRepo.getAccountWithToken(meta.id);

  const node = account.token_type === 'instagram' ? '/me' : `/${account.ig_user_id}`;
  const profile = await igGetWithFallback(account, node, [
    'username,name,biography,website,followers_count,media_count,profile_picture_url',
    'username,name,followers_count,media_count,profile_picture_url',
  ]);

  const warnings = [];
  const media = await igGetWithFallback(account, `${node}/media`, [
    'caption,media_type,permalink,timestamp,like_count,comments_count',
    'caption,media_type,permalink,timestamp',
  ], { limit: 50 }).catch((err) => {
    warnings.push(`Instagram posts couldn't be read: ${err.message}`);
    return { data: [] };
  });

  const posts = (media.data || []).map((m) => ({
    caption: String(m.caption || '').trim(),
    mediaType: m.media_type || null,
    permalink: m.permalink || null,
    timestamp: m.timestamp || null,
    likeCount: m.like_count ?? null,
    commentsCount: m.comments_count ?? null,
  }));
  const hashtags = posts.flatMap((p) => (p.caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase()));

  return {
    accountId: meta.id,
    username: profile.username || meta.username,
    name: profile.name || null,
    biography: profile.biography || null,
    website: profile.website || null,
    followersCount: profile.followers_count ?? null,
    mediaCount: profile.media_count ?? null,
    profilePictureUrl: profile.profile_picture_url || null,
    topHashtags: topCounts(hashtags, 15),
    posts,
    warnings,
  };
}

// ─── AI brand analysis ───────────────────────────────────────────────────────

function analysisPrompt(site, ig) {
  const parts = [];
  if (site) {
    const catalog = site.products.length
      ? `Product types: ${uniq(site.products.map((p) => p.productType)).slice(0, 15).join(', ')}
Sample products: ${site.products.slice(0, 25).map((p) => p.title).join(' | ')}
Collections: ${site.collections.slice(0, 20).map((c) => c.title).join(' | ')}\n`
      : '';
    parts.push(`=== WEBSITE (${site.url}) ===
Name: ${site.name || 'unknown'}
Title: ${site.title || ''}
Meta description: ${site.description || ''}
Headings: ${site.headings.join(' | ')}
${catalog}Homepage text: ${site.homeText}
${site.aboutText ? `About page: ${site.aboutText}` : ''}`);
  }
  if (ig) {
    const engagement = (p) => (p.likeCount || 0) + (p.commentsCount || 0);
    const captions = ig.posts.filter((p) => p.caption).sort((a, b) => engagement(b) - engagement(a))
      .slice(0, 15).map((p) => `- ${p.caption.slice(0, 300).replace(/\s+/g, ' ')}`);
    parts.push(`=== INSTAGRAM (@${ig.username}) ===
Name: ${ig.name || ''}
Bio: ${ig.biography || ''}
Followers: ${ig.followersCount ?? 'unknown'}
Top hashtags: ${ig.topHashtags.join(' ')}
Most-engaged post captions:
${captions.join('\n') || '(none)'}`);
  }

  return `You are a brand strategist. From the public website and Instagram data below, write this business's "Business DNA" — the brief a writer needs to produce on-brand, SEO-focused blog articles for it.

${parts.join('\n\n')}

Return ONLY valid JSON (no markdown fences, no commentary):
{"brandName":"","summary":"2-3 sentences: what the business sells, to whom, and what makes it different","niche":"short niche label, e.g. 'handmade silver jewellery'","targetAudience":"1-2 sentences on who buys and why","brandVoice":"the tone and style to write in, e.g. 'warm and playful, short sentences, light Hinglish'","valuePropositions":["3-5 short selling points"],"contentPillars":["4-6 recurring blog themes that suit this brand"],"keywords":["8-12 search phrases shoppers would use to find these products"]}

Base everything on the data above. Don't invent facts (certifications, awards, prices, locations) that aren't in it.`;
}

function parseAnalysis(raw) {
  const text = String(raw || '');
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v, n) => (Array.isArray(v) ? v.map((x) => str(x, 120)).filter(Boolean).slice(0, n) : []);
  return {
    brandName: str(json.brandName, 120),
    summary: str(json.summary),
    niche: str(json.niche, 120),
    targetAudience: str(json.targetAudience),
    voice: str(json.brandVoice),
    valuePropositions: list(json.valuePropositions, 6),
    contentPillars: list(json.contentPillars, 8),
    keywords: list(json.keywords, 15),
  };
}

// ─── Build ───────────────────────────────────────────────────────────────────

export async function buildSocialDna(workspaceId, { websiteUrl, instagramAccountId } = {}) {
  const siteInput = String(websiteUrl || '').trim();
  if (!siteInput && !instagramAccountId) {
    throw badRequest('Enter your website URL, choose an Instagram account, or both.');
  }
  const warnings = [];

  // Either source may fail on its own; only give up when nothing usable is left.
  let instagram = null;
  if (instagramAccountId) {
    try {
      instagram = await readInstagram(workspaceId, instagramAccountId);
      warnings.push(...instagram.warnings);
    } catch (err) {
      if (err.status === 400 || !siteInput) throw badRequest(`Instagram: ${err.message}`);
      warnings.push(`Instagram skipped: ${err.message}`);
    }
  }

  // No website given? Use the one in the Instagram bio.
  let site = null;
  const siteTarget = siteInput || instagram?.website;
  if (siteTarget) {
    try {
      site = await readWebsite(siteTarget);
    } catch (err) {
      if (!instagram) throw badRequest(err.message);
      warnings.push(`Website skipped: ${err.message}`);
    }
  }
  if (site && !site.isShopify) {
    warnings.push(`${site.hostname} isn't a public Shopify storefront, so no products or collections were imported — articles won't get product links or images.`);
  }
  if (site?.socialLinks.instagram && !instagram) {
    warnings.push(`Found ${site.socialLinks.instagram} on your website — connect it on the Instagram page and rebuild to include your posts.`);
  }

  // Blog IDs only come from the Admin API, and publishing needs them.
  const creds = await stores.getDefaultStore(workspaceId);
  let blogs = [];
  if (creds) {
    try {
      blogs = (await getBlogs(creds)).map((b) => ({ id: b.id, title: b.title, handle: b.handle }));
    } catch {
      warnings.push('Could not list blogs from your connected Shopify store (needs the read_content scope) — enter a Blog ID when publishing.');
    }
  } else {
    warnings.push('No Shopify store connected — you can generate articles, but connect a store in Settings to publish them.');
  }

  const ai = await resolveAi(workspaceId, 'businessDna');
  let brand = null;
  try {
    const raw = await ai.service.complete(analysisPrompt(site, instagram), ai.apiKey, {
      temperature: 0.4, maxTokens: 8000, model: ai.model,
    });
    brand = { ...parseAnalysis(raw), aiProvider: ai.provider };
  } catch (err) {
    const reason = err.response?.data?.error?.message || err.message;
    warnings.push(`AI brand analysis failed (${ai.provider}): ${reason} — using a basic analysis instead.`);
  }

  const products = site?.products || [];
  const productTypes = uniq(products.map((p) => p.productType));
  const productTags = products.flatMap((p) => p.tags.split(',').map((t) => t.trim())).filter(Boolean);
  const niche = brand?.niche || productTypes.slice(0, 3).join(', ') || 'General Store';

  const dna = {
    source: 'social',
    fetchedAt: new Date().toISOString(),
    inputs: { websiteUrl: siteInput || null, instagramAccountId: instagramAccountId || null },
    warnings,
    shop: {
      name: brand?.brandName || site?.name || instagram?.name || (instagram ? `@${instagram.username}` : site?.hostname),
      domain: site?.hostname || null,
      description: brand?.summary || site?.description || instagram?.biography || '',
      currency: site?.currency || null,
    },
    analysis: {
      niche,
      productTypes,
      vendors: uniq(products.map((p) => p.vendor)),
      topTags: productTags.length ? topCounts(productTags, 20) : (instagram?.topHashtags || []).map((h) => h.slice(1)),
      targetAudience: brand?.targetAudience || `Online shoppers interested in ${productTypes.slice(0, 2).join(' and ') || niche}`,
      totalProducts: products.length,
      totalCollections: site?.collections.length || 0,
      totalArticles: site?.articles.length || 0,
      totalPages: 0,
      totalBlogs: blogs.length,
    },
    brand,
    website: site && {
      url: site.url,
      hostname: site.hostname,
      name: site.name,
      title: site.title,
      description: site.description,
      image: site.image,
      isShopify: site.isShopify,
      headings: site.headings.slice(0, 12),
      socialLinks: site.socialLinks,
      aboutUrl: site.aboutUrl,
    },
    instagram: instagram && {
      accountId: instagram.accountId,
      username: instagram.username,
      name: instagram.name,
      biography: instagram.biography,
      website: instagram.website,
      followersCount: instagram.followersCount,
      mediaCount: instagram.mediaCount,
      profilePictureUrl: instagram.profilePictureUrl,
      topHashtags: instagram.topHashtags,
      recentPosts: instagram.posts.slice(0, 12).map((p) => ({ ...p, caption: p.caption.slice(0, 500) })),
    },
    blogs,
    products,
    collections: site?.collections || [],
    articles: site?.articles || [],
    pages: [],
  };

  await dnaRepo.saveDna(workspaceId, creds?.id || null, dna);
  return dna;
}

export default { buildSocialDna };

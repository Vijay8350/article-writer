import axios from 'axios';
import config from '../config/env.js';

// Instagram Graph API content publishing. Two token flavours are supported:
//   instagram — "Instagram API with Instagram Login" (IGAA… tokens, 60 days, refreshable)
//   facebook  — "Instagram API with Facebook Login" (EAA… Page/System-User tokens)
// Both expose the same /{ig-user-id}/media → /media_publish flow on different hosts.

const HOSTS = { instagram: 'https://graph.instagram.com', facebook: 'https://graph.facebook.com' };

export function detectTokenType(accessToken) {
  return String(accessToken).startsWith('EAA') ? 'facebook' : 'instagram';
}

// A dropped connection or timeout, with no answer from Instagram.
const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE', 'EAI_AGAIN']);

async function graph(tokenType, accessToken, method, path, params = {}, attempt = 0) {
  // POST params go form-encoded in the body — a 2,200-char caption is too long for a query string.
  const payload = { ...params, access_token: accessToken };
  const isGet = method === 'get' || method === 'delete';
  try {
    const { data } = await axios({
      method,
      url: `${HOSTS[tokenType]}/${config.instagram.apiVersion}${path}`,
      params: isGet ? payload : undefined,
      data: isGet ? undefined : new URLSearchParams(payload),
      timeout: method === 'get' ? 30000 : 60000,
    });
    return data;
  } catch (error) {
    // Reads are safe to repeat, so retry one dropped connection. Writes (publish,
    // reply, hide, delete) never retry: Instagram may have applied the first one.
    if (method === 'get' && !error.response && TRANSIENT.has(error.code) && attempt === 0) {
      return graph(tokenType, accessToken, method, path, params, 1);
    }
    if (!error.response && TRANSIENT.has(error.code)) {
      throw Object.assign(new Error(`Couldn't reach Instagram (${error.code}). Check the internet connection and try again.`), { network: true });
    }
    const e = error.response?.data?.error;
    const msg = !e ? error.message
      : e.code === 190 ? `Instagram: access token is invalid or expired — reconnect the account (${e.message})`
        : `Instagram: ${e.error_user_msg || e.message}`;
    throw Object.assign(new Error(msg), { igCode: e?.code });
  }
}

// Resolves which Instagram professional account a token publishes to.
export async function identifyAccount(accessToken, igUserId) {
  const tokenType = detectTokenType(accessToken);
  if (tokenType === 'instagram') {
    const me = await graph(tokenType, accessToken, 'get', '/me', { fields: 'user_id,username' });
    return { tokenType, igUserId: String(me.user_id), username: me.username };
  }
  if (igUserId) {
    const acc = await graph(tokenType, accessToken, 'get', `/${igUserId}`, { fields: 'id,username' });
    return { tokenType, igUserId: String(acc.id), username: acc.username };
  }
  // A Page token can resolve its linked Instagram account without an explicit ID.
  const page = await graph(tokenType, accessToken, 'get', '/me', { fields: 'instagram_business_account{id,username}' })
    .catch(() => null);
  const acc = page?.instagram_business_account;
  if (!acc) {
    throw new Error('For a Facebook (EAA…) token, also enter the Instagram account ID.');
  }
  return { tokenType, igUserId: String(acc.id), username: acc.username };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilReady(account, containerId) {
  for (let i = 0; i < 20; i++) {
    const { status_code: status } = await graph(account.token_type, account.accessToken, 'get', `/${containerId}`, { fields: 'status_code' });
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Instagram rejected the media (status ${status})`);
    await sleep(3000);
  }
  throw new Error('Instagram took too long to process the media');
}

// 1 image → single post; 2–10 images → carousel. Image URLs must be public JPEGs.
export async function publishPost(account, imageUrls, caption) {
  const call = (method, path, params) => graph(account.token_type, account.accessToken, method, path, params);
  const ig = account.ig_user_id;
  let creationId;
  if (imageUrls.length === 1) {
    creationId = (await call('post', `/${ig}/media`, { image_url: imageUrls[0], caption })).id;
  } else {
    const children = [];
    for (const imageUrl of imageUrls.slice(0, 10)) {
      const { id } = await call('post', `/${ig}/media`, { image_url: imageUrl, is_carousel_item: true });
      await waitUntilReady(account, id);
      children.push(id);
    }
    creationId = (await call('post', `/${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption })).id;
  }
  await waitUntilReady(account, creationId);
  const { id: mediaId } = await call('post', `/${ig}/media_publish`, { creation_id: creationId });
  const { permalink } = await call('get', `/${mediaId}`, { fields: 'permalink' }).catch(() => ({}));
  return { mediaId, permalink: permalink || null };
}

// ─── Live account status (read-only) ─────────────────────────────────────────

// Instagram-Login tokens reject some fields Facebook-Login tokens allow; an unknown
// field fails the whole call with #100, so retry once with the basic set.
const PROFILE_FIELDS = {
  instagram: ['user_id,username,name,account_type,biography,website,profile_picture_url,followers_count,follows_count,media_count',
    'user_id,username,name,profile_picture_url,followers_count,follows_count,media_count'],
  facebook: ['id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count',
    'id,username,name,profile_picture_url,followers_count,follows_count,media_count'],
};
const MEDIA_FIELDS = ['id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp'];

async function getWithFallback(account, path, [rich, basic], extra = {}) {
  const call = (fields) => graph(account.token_type, account.accessToken, 'get', path, { fields, ...extra });
  try {
    return await call(rich);
  } catch (err) {
    if (err.igCode !== 100) throw err;
    return call(basic);
  }
}

// Graph error codes 10 and 200–299 mean "the token lacks this permission".
const isPermissionError = (err) => err.igCode === 10 || (err.igCode >= 200 && err.igCode < 300);
const skipped = (label, key) => ({ key, label, ok: null, detail: 'Skipped: the token is not working' });

// Full public profile: counts, bio, picture (the picture URL expires after a few days).
export async function fetchFullProfile(account) {
  const p = await getWithFallback(account, accountNode(account), PROFILE_FIELDS[account.token_type]);
  return {
    username: p.username,
    name: p.name || null,
    accountType: p.account_type || null,
    biography: p.biography || null,
    website: p.website || null,
    profilePictureUrl: p.profile_picture_url || null,
    followersCount: p.followers_count ?? null,
    followsCount: p.follows_count ?? null,
    mediaCount: p.media_count ?? null,
  };
}

// Probes what the connected token can actually do: read the profile, read posts,
// publish (with today's quota), manage comments (needed for comment auto-reply)
// and read insights. Never throws. `tokenError` is set only when the token itself is dead.
export async function checkAccountStatus(account) {
  const node = accountNode(account);
  const checks = [];
  let profile = null;
  let posts = [];
  let tokenError = null;

  try {
    profile = await fetchFullProfile(account);
    checks.push({ key: 'token', label: 'Access token & profile', ok: true, detail: `Signed in as @${profile.username}` });
  } catch (err) {
    tokenError = err.message;
    checks.push({ key: 'token', label: 'Access token & profile', ok: false, detail: err.message });
    return {
      profile, posts, tokenError, checkedAt: new Date().toISOString(),
      checks: [...checks, skipped('Read posts', 'media'), skipped('Publish posts', 'publish'),
        skipped('Manage comments (auto-reply)', 'comments'), skipped('Read insights', 'insights')],
    };
  }

  try {
    const media = await getWithFallback(account, `${node}/media`, MEDIA_FIELDS, { limit: 6 });
    posts = (media.data || []).map((m) => ({
      id: m.id,
      caption: m.caption ? String(m.caption).slice(0, 300) : '',
      mediaType: m.media_type,
      imageUrl: m.media_type === 'VIDEO' ? m.thumbnail_url || null : m.media_url || null,
      permalink: m.permalink || null,
      timestamp: m.timestamp || null,
      likeCount: m.like_count ?? null,
      commentsCount: m.comments_count ?? null,
    }));
    checks.push({ key: 'media', label: 'Read posts', ok: true, detail: `${profile.mediaCount ?? posts.length} posts on the account` });
  } catch (err) {
    checks.push({ key: 'media', label: 'Read posts', ok: false, detail: err.message });
  }

  try {
    const { data } = await graph(account.token_type, account.accessToken, 'get',
      `/${account.ig_user_id}/content_publishing_limit`, { fields: 'config,quota_usage' });
    const used = data?.[0]?.quota_usage ?? 0;
    const total = data?.[0]?.config?.quota_total;
    checks.push({ key: 'publish', label: 'Publish posts', ok: true, detail: total ? `${used} of ${total} posts used in the last 24 hours` : 'Allowed' });
  } catch (err) {
    checks.push({ key: 'publish', label: 'Publish posts', ok: false,
      detail: isPermissionError(err) ? 'Permission not granted: add instagram_business_content_publish (or instagram_content_publish) and reconnect' : err.message });
  }

  // Comments can only be probed on an existing post.
  if (!posts.length) {
    checks.push({ key: 'comments', label: 'Manage comments (auto-reply)', ok: null, detail: 'No posts yet to test on' });
  } else {
    try {
      await graph(account.token_type, account.accessToken, 'get', `/${posts[0].id}/comments`, { fields: 'id', limit: 1 });
      checks.push({ key: 'comments', label: 'Manage comments (auto-reply)', ok: true, detail: 'Ready for comment auto-reply' });
    } catch (err) {
      checks.push({ key: 'comments', label: 'Manage comments (auto-reply)', ok: false,
        detail: isPermissionError(err) ? 'Permission not granted: add instagram_business_manage_comments (or instagram_manage_comments) and reconnect' : err.message });
    }
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    await graph(account.token_type, account.accessToken, 'get', `${node}/insights`,
      { metric: 'reach', period: 'day', metric_type: 'total_value', since: now - 86400, until: now });
    checks.push({ key: 'insights', label: 'Read insights', ok: true, detail: 'Account and post insights available' });
  } catch (err) {
    checks.push({ key: 'insights', label: 'Read insights', ok: false,
      detail: isPermissionError(err) ? 'Permission not granted: add instagram_business_manage_insights (or instagram_manage_insights) and reconnect' : err.message });
  }

  return { profile, posts, checks, tokenError, checkedAt: new Date().toISOString() };
}

// ─── Reads + comments for Instagram Studio (research, analytics, auto-reply) ──

// Instagram-Login tokens address the account as /me; Facebook-Login tokens by its id.
const accountNode = (account) => (account.token_type === 'instagram' ? '/me' : `/${account.ig_user_id}`);
const call = (account, method, path, params) => graph(account.token_type, account.accessToken, method, path, params);

export async function fetchProfile(account) {
  const p = await getWithFallback(account, accountNode(account), PROFILE_FIELDS[account.token_type]);
  return {
    username: p.username,
    name: p.name || null,
    biography: p.biography || null,
    website: p.website || null,
    followers: p.followers_count ?? null,
    mediaCount: p.media_count ?? null,
  };
}

// The account's most recent media, newest first.
export async function fetchMedia(account, limit = 12) {
  const media = await getWithFallback(account, `${accountNode(account)}/media`, MEDIA_FIELDS, { limit: Math.min(limit, 100) });
  return (media.data || []).map((m) => ({
    id: m.id,
    caption: m.caption || null,
    permalink: m.permalink || null,
    timestamp: m.timestamp || null,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
  }));
}

// Engagement for one published post. Best-effort: reach/saves need the insights permission.
export async function fetchMediaInsights(account, mediaId) {
  const out = { likes: null, comments: null, reach: null, saves: null };
  try {
    const d = await call(account, 'get', `/${mediaId}`, { fields: 'like_count,comments_count' });
    out.likes = d.like_count ?? null;
    out.comments = d.comments_count ?? null;
  } catch { /* best-effort */ }
  try {
    const d = await call(account, 'get', `/${mediaId}/insights`, { metric: 'reach,saved' });
    for (const m of d.data || []) {
      const value = m.values?.[0]?.value ?? m.total_value?.value ?? null;
      if (m.name === 'reach') out.reach = value;
      if (m.name === 'saved') out.saves = value;
    }
  } catch { /* best-effort */ }
  return out;
}

// Top-level comments left since `since` on the account's most recent posts (no reply threads).
// ─── Account insights (the Insights page) ────────────────────────────────────
// Verified against Graph API v25: "impressions" is retired (use views), and
// engaged-audience demographics need a minimum audience, so callers treat every
// group except the totals as optional.

const TOTAL_METRICS = ['views', 'reach', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'saves', 'shares',
  'replies', 'reposts', 'profile_links_taps', 'website_clicks', 'profile_views'];
const CORE_TOTAL_METRICS = ['views', 'reach', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'saves', 'shares'];

const metricValue = (m) => m.total_value?.value ?? (m.values || []).reduce((sum, v) => sum + (Number(v.value) || 0), 0);
const insights = (account, params) => call(account, 'get', `${accountNode(account)}/insights`, params);
const breakdownRows = (res) => (res.data?.[0]?.total_value?.breakdowns?.[0]?.results || [])
  .map((r) => ({ key: r.dimension_values?.[0] ?? 'Unknown', value: Number(r.value) || 0 }))
  .sort((a, b) => b.value - a.value);

export { isPermissionError };

// Period totals (unix seconds). If Meta has retired one of the extra metrics,
// fall back to the core set rather than failing the whole page.
export async function fetchAccountTotals(account, since, until) {
  const params = (metrics) => ({ metric: metrics.join(','), period: 'day', metric_type: 'total_value', since, until });
  let res;
  try {
    res = await insights(account, params(TOTAL_METRICS));
  } catch (err) {
    if (err.igCode !== 100) throw err;
    res = await insights(account, params(CORE_TOTAL_METRICS));
  }
  return Object.fromEntries((res.data || []).map((m) => [m.name, metricValue(m)]));
}

// reach × media_product_type (POST, REEL, STORY, AD…), follows_and_unfollows × follow_type.
export async function fetchBreakdown(account, metric, dimension, since, until) {
  return breakdownRows(await insights(account, { metric, period: 'day', metric_type: 'total_value', breakdown: dimension, since, until }));
}

// One value per day. Meta stamps each value with the END of its day, so the
// value belongs to the day before end_time. Ranges are capped at 30 days.
export async function fetchDailySeries(account, metric, since, until) {
  const res = await insights(account, { metric, period: 'day', since, until });
  return (res.data?.[0]?.values || []).map((v) => ({
    date: new Date(Date.parse(v.end_time) - 86400000).toISOString().slice(0, 10),
    value: Number(v.value) || 0,
  }));
}

// Follower demographics by country | city | age | gender (needs 100+ followers).
export async function fetchFollowerDemographics(account, dimension) {
  return breakdownRows(await insights(account, {
    metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', timeframe: 'this_month', breakdown: dimension,
  }));
}

// UTC offset (hours) of a time zone at a moment, e.g. America/Los_Angeles → -7 in summer.
function tzOffsetHours(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - date.getTime()) / 3600000);
}

// Followers online per hour of day, re-indexed from Meta's Pacific-time hours to
// UTC hours (index 0 = 00:00 UTC) so the browser can show its own local time.
// The newest ~2 days come back empty, so look back a week for the latest full day.
export async function fetchOnlineFollowers(account) {
  const until = Math.floor(Date.now() / 1000);
  const res = await insights(account, { metric: 'online_followers', period: 'lifetime', since: until - 7 * 86400, until });
  const latest = [...(res.data?.[0]?.values || [])].reverse().find((v) => v.value && Object.keys(v.value).length);
  if (!latest) return null;
  const offset = tzOffsetHours('America/Los_Angeles', new Date(latest.end_time));
  const utc = new Array(24).fill(0);
  for (let pt = 0; pt < 24; pt++) utc[(((pt - offset) % 24) + 24) % 24] = Number(latest.value[pt]) || 0;
  return utc;
}

const POST_FIELDS = ['id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'];
const POST_METRICS = 'reach,saved,shares,total_interactions,views';

const postKind = (m) => (m.media_product_type === 'REELS' ? 'Reel'
  : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : m.media_type === 'VIDEO' ? 'Video' : 'Photo');

const metricsOf = (insightsData) => Object.fromEntries((insightsData || [])
  .map((x) => [x.name, x.values?.[0]?.value ?? x.total_value?.value ?? null]));

const shapePost = (m, metrics) => ({
  id: m.id,
  kind: postKind(m),
  caption: m.caption ? String(m.caption).slice(0, 300) : '',
  imageUrl: m.media_type === 'VIDEO' ? m.thumbnail_url || null : m.media_url || null,
  permalink: m.permalink || null,
  timestamp: m.timestamp || null,
  likes: m.like_count ?? null,
  comments: m.comments_count ?? null,
  views: metrics.views ?? null,
  reach: metrics.reach ?? null,
  saves: metrics.saved ?? null,
  shares: metrics.shares ?? null,
  interactions: metrics.total_interactions ?? null,
});

// Recent posts with their lifetime insights. One request normally does it (the
// insights edge expanded inline, ~4s for 25 posts); if Instagram refuses the
// expansion (one bad post fails the whole call), fall back to one insights
// request per post, 5 at a time — a post whose insights can't be read (e.g.
// posted before the account turned professional) still lists with its counts.
export async function fetchPostsWithInsights(account, limit = 25) {
  const path = `${accountNode(account)}/media`;
  const params = { limit: Math.min(limit, 50) };
  try {
    const res = await call(account, 'get', path, { ...params, fields: `${POST_FIELDS[0]},insights.metric(${POST_METRICS})` });
    return (res.data || []).map((m) => shapePost(m, metricsOf(m.insights?.data)));
  } catch { /* per-post fallback below */ }

  const media = (await getWithFallback(account, path, POST_FIELDS, params)).data || [];
  const out = [];
  for (let i = 0; i < media.length; i += 5) {
    out.push(...await Promise.all(media.slice(i, i + 5).map(async (m) => {
      const d = await call(account, 'get', `/${m.id}/insights`, { metric: POST_METRICS }).catch(() => null);
      return shapePost(m, metricsOf(d?.data));
    })));
  }
  return out;
}

export async function fetchRecentComments(account, { since, mediaLimit = 10, perMedia = 50 }) {
  const media = await fetchMedia(account, mediaLimit);
  const withComments = media.filter((m) => (m.comments ?? 1) > 0);
  const perPost = await Promise.all(withComments.map(async (m) => {
    const res = await call(account, 'get', `/${m.id}/comments`, { fields: 'id,text,username,timestamp,hidden', limit: perMedia });
    return (res.data || [])
      .filter((c) => c.text && new Date(c.timestamp) >= since)
      .map((c) => ({
        id: c.id,
        text: c.text,
        author: c.username || null,
        timestamp: c.timestamp,
        hidden: Boolean(c.hidden),
        mediaId: m.id,
        permalink: m.permalink,
        caption: m.caption,
      }));
  }));
  return perPost.flat();
}

// Public reply under a comment; returns the reply's id.
export async function replyToComment(account, commentId, message) {
  return (await call(account, 'post', `/${commentId}/replies`, { message })).id;
}

// Hidden comments stay visible to their author only.
export async function setCommentHidden(account, commentId, hide) {
  await call(account, 'post', `/${commentId}`, { hide: String(hide) });
}

export async function deleteComment(account, commentId) {
  await call(account, 'delete', `/${commentId}`);
}

// Instagram Login tokens only; extends to 60 days from now. Unversioned endpoint.
export async function refreshToken(accessToken) {
  try {
    const { data } = await axios.get(`${HOSTS.instagram}/refresh_access_token`, {
      params: { grant_type: 'ig_refresh_token', access_token: accessToken },
      timeout: 30000,
    });
    return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000) };
  } catch (error) {
    throw new Error(`Token refresh failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

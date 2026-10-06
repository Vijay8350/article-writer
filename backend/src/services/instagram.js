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

async function graph(tokenType, accessToken, method, path, params = {}) {
  // POST params go form-encoded in the body — a 2,200-char caption is too long for a query string.
  const payload = { ...params, access_token: accessToken };
  const isGet = method === 'get' || method === 'delete';
  try {
    const { data } = await axios({
      method,
      url: `${HOSTS[tokenType]}/${config.instagram.apiVersion}${path}`,
      params: isGet ? payload : undefined,
      data: isGet ? undefined : new URLSearchParams(payload),
      timeout: 60000,
    });
    return data;
  } catch (error) {
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

// Probes what the connected token can actually do: read the profile, read posts,
// publish (with today's quota) and manage comments (needed for comment auto-reply).
// Never throws. `tokenError` is set only when the token itself is dead.
export async function checkAccountStatus(account) {
  const node = account.token_type === 'instagram' ? '/me' : `/${account.ig_user_id}`;
  const checks = [];
  let profile = null;
  let posts = [];
  let tokenError = null;

  try {
    const p = await getWithFallback(account, node, PROFILE_FIELDS[account.token_type]);
    profile = {
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
    checks.push({ key: 'token', label: 'Access token & profile', ok: true, detail: `Signed in as @${p.username}` });
  } catch (err) {
    tokenError = err.message;
    checks.push({ key: 'token', label: 'Access token & profile', ok: false, detail: err.message });
    return {
      profile, posts, tokenError, checkedAt: new Date().toISOString(),
      checks: [...checks, skipped('Read posts', 'media'), skipped('Publish posts', 'publish'), skipped('Manage comments (auto-reply)', 'comments')],
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

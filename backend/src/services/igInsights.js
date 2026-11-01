import {
  fetchFullProfile, fetchAccountTotals, fetchBreakdown, fetchDailySeries, fetchFollowerDemographics,
  fetchOnlineFollowers, fetchPostsWithInsights, isPermissionError,
} from './instagram.js';

// Insights page data for one account over the last 7/14/30 days: profile,
// period totals, daily reach + new followers, reach by content type, follower
// audience, best hours to post, and recent posts with their insights.
//
// ~40 Graph API calls per build, so results are cached in-process for 10
// minutes (safe: PM2 runs a single fork). Only the totals are required; every
// other section fails soft into `notes` so one retired metric can't blank the page.

export const PERIODS = [7, 14, 30];
const CACHE_MS = 10 * 60_000;
const cache = new Map(); // `${accountId}:${days}` → { at, value }

const settle = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));

// Meta's "not enough data" style errors read better as a plain note.
function noteFor(section, error) {
  if (error.igCode === 3006 || /not enough/i.test(error.message)) return `${section}: Instagram needs a bigger audience before it shows this.`;
  if (isPermissionError(error)) return `${section}: the connection lacks the insights permission — reconnect the account.`;
  return `${section}: ${error.message.replace(/^Instagram: /, '')}`;
}

export async function getInsights(account, days, { fresh = false } = {}) {
  const key = `${account.id}:${days}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;

  const [profile, totals, follows, reachByType, reachDaily, followerDaily, countries, cities, ages, genders, online, posts] =
    await Promise.all([
      settle(fetchFullProfile(account)),
      settle(fetchAccountTotals(account, since, until)),
      settle(fetchBreakdown(account, 'follows_and_unfollows', 'follow_type', since, until)),
      settle(fetchBreakdown(account, 'reach', 'media_product_type', since, until)),
      settle(fetchDailySeries(account, 'reach', since, until)),
      settle(fetchDailySeries(account, 'follower_count', since, until)),
      settle(fetchFollowerDemographics(account, 'country')),
      settle(fetchFollowerDemographics(account, 'city')),
      settle(fetchFollowerDemographics(account, 'age')),
      settle(fetchFollowerDemographics(account, 'gender')),
      settle(fetchOnlineFollowers(account)),
      settle(fetchPostsWithInsights(account, 25)),
    ]);

  if (totals.error) {
    const err = totals.error;
    throw Object.assign(new Error(isPermissionError(err)
      ? "This account's connection doesn't include the insights permission. Reconnect it and allow insights access."
      : err.message), { status: isPermissionError(err) ? 400 : undefined });
  }

  const notes = [];
  const pick = (section, r) => {
    if (r.error) { notes.push(noteFor(section, r.error)); return null; }
    return r.value;
  };

  // follow_type: FOLLOWER = new follows, NON_FOLLOWER = unfollows.
  const followRows = pick('Follows', follows);
  const value = {
    days,
    since: new Date(since * 1000).toISOString(),
    until: new Date(until * 1000).toISOString(),
    fetchedAt: new Date().toISOString(),
    profile: pick('Profile', profile),
    totals: totals.value,
    follows: followRows && {
      follows: followRows.find((r) => r.key === 'FOLLOWER')?.value ?? 0,
      unfollows: followRows.find((r) => r.key === 'NON_FOLLOWER')?.value ?? 0,
    },
    reachByType: pick('Reach by content type', reachByType),
    daily: { reach: pick('Daily reach', reachDaily), newFollowers: pick('Daily new followers', followerDaily) },
    audience: {
      countries: pick('Follower countries', countries),
      cities: pick('Follower cities', cities),
      ages: pick('Follower ages', ages),
      genders: pick('Follower gender', genders),
    },
    onlineHoursUtc: pick('Best time to post', online),
    posts: pick('Posts', posts) || [],
    notes: [...new Set(notes)],
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

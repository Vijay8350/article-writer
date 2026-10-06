import * as repo from '../repositories/igStudio.js';
import * as igRepo from '../repositories/instagram.js';
import { fetchMediaInsights } from './instagram.js';

// Scheduler hook: refresh likes / reach / saves / comments for up to 10 posts
// published in the last 14 days and not measured in the last 6 hours.
// Best-effort per post — a failure just leaves the previous snapshot.
export async function runDueAnalytics() {
  const posts = await repo.postsNeedingMetrics(10);
  if (!posts.length) return false;
  const accounts = new Map();
  for (const post of posts) {
    try {
      if (!accounts.has(post.account_id)) accounts.set(post.account_id, await igRepo.getAccountWithToken(post.account_id));
      const account = accounts.get(post.account_id);
      if (!account) continue;
      await repo.insertMetrics(post, await fetchMediaInsights(account, post.ig_media_id));
    } catch { /* best-effort */ }
  }
  return true;
}

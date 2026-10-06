import * as repo from '../repositories/igStudio.js';
import * as igRepo from '../repositories/instagram.js';
import { getTextAi } from './igAi.js';
import { fetchRecentComments, replyToComment, setCommentHidden } from './instagram.js';

// Comments engine (ported from the Insta Post Generator) — shared by the
// scheduler's sweep and the "Check now" button. Pulls new top-level comments,
// has DeepSeek review them in the account's voice, hides + flags bad ones, and
// drafts replies (review mode) or sends them (auto mode, within a daily limit).

// Only comments this recent are picked up, so switching it on never replies to a backlog.
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const REVIEW_BATCH = 15;
const HIDE_CONFIDENCE = 0.8;       // hide automatically only when the model is this sure it's bad
const AUTO_REPLY_CONFIDENCE = 0.7; // send automatically only when this sure of its read

const errText = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

// Post a reply exactly once: the row is claimed first (new/draft/error →
// replying), so concurrent runs can't both send; if the process dies after
// Instagram accepts the reply, the row stays "replying" and is never re-sent.
export async function sendCommentReply(account, row, text) {
  const message = String(text || '').trim().slice(0, 1000);
  if (!message) return { ok: false, error: 'The reply is empty.' };
  const claimed = await repo.claimReply(row.id, message);
  if (!claimed) return { ok: false, error: 'This comment was already handled.' };
  try {
    const replyId = await replyToComment(account, row.ig_comment_id, message);
    await repo.updateComment(row.id, { status: 'replied', reply_ig_id: replyId, replied_at: new Date(), error: null });
    return { ok: true };
  } catch (err) {
    await repo.updateComment(row.id, { status: 'error', error: errText(err) });
    return { ok: false, error: errText(err) };
  }
}

// One pass for one account. Never throws for API/model problems — they're
// recorded on the account's comment settings (last_error).
export async function runCommentCycle(workspaceId, accountId, settings, { maxReview = 60 } = {}) {
  const result = { fetched: 0, reviewed: 0, flagged: 0, hidden: 0, drafted: 0, replied: 0, error: null };
  try {
    const account = await igRepo.getAccountWithToken(accountId);
    if (!account) throw new Error('The Instagram account is no longer connected.');
    const own = account.username?.toLowerCase();

    // 1) Pull recent comments (not our own) and store the unseen ones.
    const comments = (await fetchRecentComments(account, { since: new Date(Date.now() - LOOKBACK_MS) }))
      .filter((c) => !own || c.author?.toLowerCase() !== own);
    result.fetched = comments.length;
    await repo.insertComments(workspaceId, accountId, comments);

    // 2) Review what's still new, oldest first.
    const rows = await repo.pendingComments(accountId, maxReview);
    if (!rows.length) return result;

    const [ai, dna, business, repliedToday] = await Promise.all([
      getTextAi(workspaceId),
      repo.getDna(workspaceId, accountId),
      repo.getActiveBusinessDna(accountId),
      repo.repliedLast24h(accountId),
    ]);
    let budget = Math.max(0, settings.daily_reply_limit - repliedToday);

    for (let i = 0; i < rows.length; i += REVIEW_BATCH) {
      const batch = rows.slice(i, i + REVIEW_BATCH);
      const reviews = await ai.reviewComments(
        batch.map((r) => ({ id: r.id, author: r.author, text: r.text, post: r.media_caption })), dna, business,
      );
      const byId = new Map(reviews.map((r) => [r.id, r]));

      for (const row of batch) {
        const review = byId.get(row.id);
        if (!review) {
          await repo.updateComment(row.id, { status: 'error', error: "The AI didn't return a verdict for this comment." });
          continue;
        }
        result.reviewed++;
        const verdict = {
          verdict: review.verdict, category: review.category, reason: review.reason,
          confidence: review.confidence, reply_text: review.reply,
        };

        // 3a) Bad → flag for review; hide on Instagram when confident.
        if (review.verdict === 'bad') {
          let hidden = row.hidden;
          let error = null;
          if (settings.auto_hide && !hidden && review.confidence >= HIDE_CONFIDENCE) {
            try {
              await setCommentHidden(account, row.ig_comment_id, true);
              hidden = true;
              result.hidden++;
            } catch (err) {
              error = `Couldn't hide: ${errText(err)}`;
            }
          }
          await repo.updateComment(row.id, { ...verdict, status: 'flagged', hidden, error });
          result.flagged++;
          continue;
        }

        // 3b) Fine → reply per mode (auto only within the daily limit and when confident).
        const canAuto = settings.reply_mode === 'auto' && review.reply && budget > 0 && review.confidence >= AUTO_REPLY_CONFIDENCE;
        const status = review.reply && settings.reply_mode !== 'off' ? 'draft' : 'done';
        await repo.updateComment(row.id, { ...verdict, status: canAuto ? 'new' : status });
        if (canAuto) {
          const sent = await sendCommentReply(account, row, review.reply);
          if (sent.ok) {
            budget--;
            result.replied++;
          }
        } else if (status === 'draft') {
          result.drafted++;
        }
      }
    }
  } catch (err) {
    result.error = errText(err);
  } finally {
    await repo.recordCommentCheck(accountId, result.error);
  }
  return result;
}

// Scheduler hook: sweep one monitored account whose last check is ≥15 minutes old.
export async function runDueCommentSweep() {
  const settings = await repo.claimCommentSweep();
  if (!settings) return false;
  const r = await runCommentCycle(settings.workspace_id, settings.account_id, settings);
  if (r.error || r.reviewed) {
    await repo.log({
      workspaceId: settings.workspace_id,
      accountId: settings.account_id,
      stage: 'comments',
      level: r.error ? 'warn' : 'info',
      message: r.error
        ? `Comments: ${r.error}`
        : `Comments: reviewed ${r.reviewed}, flagged ${r.flagged} (hidden ${r.hidden}), replied ${r.replied}, drafts ${r.drafted}`,
    });
  }
  // Only counts as this tick's job when real work (AI review) happened.
  return r.reviewed > 0;
}

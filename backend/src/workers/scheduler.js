import cron from 'node-cron';
import * as scheduled from '../repositories/scheduledPosts.js';
import { generateAndPublishForWorkspace } from '../services/articleService.js';
import { runDueCampaignArticle } from '../services/campaignService.js';
import { runDueInstagramPost, refreshDueInstagramToken } from '../services/instagramAutopost.js';
import { runDueAutopilot } from '../services/igStudio.js';
import { runDueResearch } from '../services/igResearch.js';
import { runDueCommentSweep } from '../services/igComments.js';
import { runDueAnalytics } from '../services/igAnalytics.js';
import { releaseStalePosts } from '../repositories/igStudio.js';

// Runs inside the SINGLE PM2 fork process. This is the ONLY reason it's safe
// from double-firing — do NOT enable PM2 cluster mode / instances>1 without
// moving this worker to its own single-instance process.
//
// Each tick claims AT MOST ONE due job (memory guard for the 908MB instance:
// AI generation is heavy, so never run several concurrently). A tick that is
// still running when the next fires is skipped via `isRunning`.
let isRunning = false;

async function tick() {
  if (isRunning) return;
  isRunning = true;
  try {
    const job = await scheduled.claimNextDue();
    if (job) {
      console.log(`⏰ Processing scheduled post ${job.id} (workspace ${job.workspace_id}): "${job.topic}"`);
      try {
        const { created } = await generateAndPublishForWorkspace(job.workspace_id, {
          topic: job.topic,
          wordCount: job.word_count,
          aiModel: job.ai_model,
          blogId: job.blog_id,
        }, job.created_by);
        await scheduled.markPublished(job.id, created.id);
        console.log(`✅ Scheduled post ${job.id} published (article ${created.id})`);
      } catch (err) {
        // A LIMIT_REACHED error lands here and marks the job failed rather than over-publishing.
        const msg = err.code === 'LIMIT_REACHED'
          ? 'Monthly article limit reached'
          : (err.response?.data ? JSON.stringify(err.response.data) : err.message);
        await scheduled.markFailed(job.id, msg);
        console.error(`❌ Scheduled post ${job.id} failed: ${msg}`);
      }
      return; // one generation per tick max
    }

    // Then one Instagram product autopost (light: one short DeepSeek call + Graph API).
    if (await runDueInstagramPost()) return;

    // Then one Instagram Studio autopilot slot (text → image + quality gate → publish).
    if (await runDueAutopilot()) return;

    // No scheduled post due → try one campaign article (still ≤1 generation/tick).
    if (await runDueCampaignArticle()) return;

    // Background Instagram work, one piece per tick: Business DNA research (1–3 min),
    // a comment sweep for one account, then a batch of post metrics.
    if (await runDueResearch()) return;
    if (await runDueCommentSweep()) return;
    if (await runDueAnalytics()) return;

    // Idle tick → housekeeping: un-stick interrupted Studio posts, and keep one
    // Instagram Login token alive (they expire after 60 days).
    await releaseStalePosts();
    await refreshDueInstagramToken();
  } catch (err) {
    console.error('Scheduler tick error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startScheduler() {
  // Every minute.
  cron.schedule('* * * * *', tick);
  console.log('🗓️  Scheduled-post worker started (every minute, 1 job/tick)');
}

export default { startScheduler };

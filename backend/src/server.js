import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/env.js';

import authRouter from './routes/auth.js';
import settingsRouter from './routes/settings.js';
import businessDnaRouter from './routes/businessDna.js';
import articlesRouter from './routes/articles.js';
import scheduledPostsRouter from './routes/scheduledPosts.js';
import campaignsRouter from './routes/campaigns.js';
import upgradeRequestsRouter from './routes/upgradeRequests.js';
import workspacesRouter from './routes/workspaces.js';
import membersRouter from './routes/members.js';
import invitationsRouter from './routes/invitations.js';
import adminRouter from './routes/admin.js';
import instagramRouter from './routes/instagram.js';
import igStudioRouter from './routes/igStudio.js';
import metaRouter from './routes/meta.js';
import { MEDIA_DIR } from './services/igMedia.js';
import { startScheduler } from './workers/scheduler.js';
import * as gemini from './services/gemini.js';
import * as deepseek from './services/deepseek.js';

const app = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generated Instagram images. Public on purpose — Instagram downloads them to
// publish — but only unguessable file names live here, and there's no listing.
app.use('/api/media/ig', express.static(MEDIA_DIR, { index: false, dotfiles: 'deny', maxAge: '7d' }));
app.use('/api/media/ig', (req, res) => res.status(404).json({ success: false, error: 'Not found' })); // never leak the file path

// Routes
app.use('/api/meta', metaRouter); // public OAuth / data-deletion callbacks — before any authed router
app.use('/api/ig', igStudioRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/business-dna', businessDnaRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/scheduled-posts', scheduledPostsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/upgrade-requests', upgradeRequestsRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/members', membersRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/instagram', instagramRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Fail fast on missing critical config rather than 500ing at request time.
const missing = [];
if (!config.database.url) missing.push('DATABASE_URL');
if (!config.jwt.secret) missing.push('JWT_SECRET');
if (missing.length) {
  console.error(`❌ Missing required env var(s): ${missing.join(', ')}. Set them in the root .env.`);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`\n🚀 Article Writer Backend running on http://localhost:${config.port}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Frontend: ${config.frontendUrl}\n`);
  startScheduler();

  // Surface a dead platform AI key at boot instead of on the first generation.
  for (const [name, svc, key] of [['Gemini', gemini, config.gemini.apiKey], ['DeepSeek', deepseek, config.deepseek.apiKey]]) {
    if (key) svc.verifyKey().then(() => console.log(`✅ Platform ${name} key OK`), err => console.warn(`⚠️  Platform ${name} key: ${err.message}`));
  }
});

export default app;

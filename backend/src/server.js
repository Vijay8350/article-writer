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
import plansRouter from './routes/plans.js';
import workspacesRouter from './routes/workspaces.js';
import membersRouter from './routes/members.js';
import invitationsRouter from './routes/invitations.js';
import adminRouter from './routes/admin.js';
import instagramRouter from './routes/instagram.js';
import productImagesRouter from './routes/productImages.js';
import seoRouter from './routes/seo.js';
import igStudioRouter from './routes/igStudio.js';
import dashboardRouter from './routes/dashboard.js';
import metaRouter from './routes/meta.js';
import shopifyAppRouter from './routes/shopifyApp.js';
import shopifyWebhooksRouter from './routes/shopifyWebhooks.js';
import { serveEmbeddedApp } from './routes/shopifyEmbed.js';
import { MEDIA_DIR } from './services/igMedia.js';
import { startScheduler } from './workers/scheduler.js';
import * as gemini from './services/gemini.js';
import * as deepseek from './services/deepseek.js';

const app = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(morgan('dev'));
// Shopify webhooks need the raw bytes for their HMAC, so they come before the JSON parser.
app.use('/api/shopify/webhooks', express.raw({ type: '*/*', limit: '2mb' }), shopifyWebhooksRouter);
app.use(express.json({ limit: '10mb' }));

// The app inside the Shopify admin (an iframe): its page, framed only by that shop's admin.
app.get(['/shopify', '/shopify/*'], serveEmbeddedApp);

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
app.use('/api/shopify', shopifyAppRouter); // the Shopify app: connect, callback, embedded session, billing
app.use('/api/ig', igStudioRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/business-dna', businessDnaRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/scheduled-posts', scheduledPostsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/upgrade-requests', upgradeRequestsRouter);
app.use('/api/plans', plansRouter); // public pricing
app.use('/api/workspaces', workspacesRouter);
app.use('/api/members', membersRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/instagram', instagramRouter);
app.use('/api/product-images', productImagesRouter);
app.use('/api/seo', seoRouter);
app.use('/api/dashboard', dashboardRouter);

// Global error handler
// An error from a service we call (a store, Instagram, an AI API) that no route handled:
// say what happened in plain words instead of passing on "Request failed with status code 429".
function upstreamMessage(err) {
  const s = err.response?.status;
  if (s === 429) return 'That service is limiting requests right now. Wait a minute and try again.';
  if (s === 401 || s === 403) return 'A connected service refused access. Check the connection in Settings and try again.';
  if (s === 404) return 'That address could not be found. Check it and try again.';
  return 'A service we rely on did not answer properly. Try again in a moment.';
}

app.use((err, req, res, next) => {
  if (err?.isAxiosError && !err.status) {
    let host = '';
    try { host = new URL(err.config?.url, err.config?.baseURL).host; } catch { /* no URL */ } // host only: query strings can hold tokens
    console.warn(`⚠️ ${req.method} ${req.path}: upstream ${err.response?.status || err.code || ''} ${host}`.trim());
    return res.status(502).json({ success: false, error: upstreamMessage(err) });
  }
  const expected = err.status && err.status < 500; // a refusal the user should see (plan limit, locked feature…)
  if (expected) console.warn(`⚠️ ${req.method} ${req.path}: ${err.message}`);
  else { console.error('❌ Error:', err.message); console.error(err.stack); }
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(expected && err.code ? { code: err.code } : {}),
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

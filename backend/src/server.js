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
import adminRouter from './routes/admin.js';
import { startScheduler } from './workers/scheduler.js';

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

// Routes
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/business-dna', businessDnaRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/scheduled-posts', scheduledPostsRouter);
app.use('/api/admin', adminRouter);

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
});

export default app;

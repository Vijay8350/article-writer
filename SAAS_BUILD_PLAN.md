# Article Writer → SaaS — Build Prompts (Production Edition)

Turns the single-tenant **Shopify Article Writer** into a multi-user SaaS **that runs on the
already-deployed AWS EC2 server**. Paste the prompts into your coding AI from the project root.

**Decisions locked in:**

- **Auth:** Email + password with JWT (custom, in the Express backend).
- **Database:** PostgreSQL, **installed on the same EC2 instance** (localhost only).
- **Payments:** None yet — admin assigns plans manually. Architecture stays payment-ready.
- **Plan limit:** Articles generated per month, per user.
- **Images:** AI auto-picks the most relevant *existing* Shopify product images and embeds them.
- **Auto-publish:** Both instant one-click AND a scheduled topic queue.

---

## 🖥️ PRODUCTION ENVIRONMENT (the AI must assume all of this)

> The app is **already deployed and live**. Do not re-architect the deployment — fit the SaaS work
> into it.
>
> - **Host:** AWS EC2, Ubuntu 26.04, **1 vCPU / ~908 MB RAM / ~6.6 GB disk (tight)**, **1 GB swap added**.
> - **Process manager:** PM2 runs `article-writer-backend` (fork mode, **1 instance**), config in
>   `deploy/ecosystem.config.cjs`, auto-starts on reboot (systemd).
> - **Web server:** Nginx serves the built frontend from `frontend/dist` and reverse-proxies
>   `/api/*` → `http://127.0.0.1:5001`. SPA fallback (`try_files … /index.html`) already handles
>   client-side routes like `/login`, `/signup`.
> - **Auto-deploy:** push to `main` → GitHub Actions SSHes in and runs `deploy/deploy.sh`, which does
>   `git reset --hard origin/main` → `npm ci` (backend) → **`npm run migrate --if-present`** →
>   `npm run build` (frontend) → `pm2 reload`.
> - **Secrets:** live in `/home/ubuntu/Article_Writer/.env` (gitignored, uploaded via `scp` — never
>   committed). Backend reads this root `.env` via `backend/src/config/env.js`.
> - **Frontend → backend calls** must stay **relative** (`/api/...`) so Nginx proxies them in prod and
>   the Vite dev proxy handles them locally. Never hardcode `http://localhost:5001` in frontend code.

### 🔴 Production-critical rules (read before any phase)

1. **`ENCRYPTION_KEY` and `JWT_SECRET` must be stable forever and backed up.** They live only in the
   server `.env`. If `ENCRYPTION_KEY` ever changes, **every encrypted Shopify/AI secret in the DB
   becomes permanently undecryptable.** Generate once, store in a password manager, never regenerate.
2. **Postgres stays on `localhost` only.** Never open port 5432 in the AWS Security Group.
3. **Migrations must be tracked + idempotent** (a `schema_migrations` table). `deploy.sh` runs them on
   every deploy via `git reset --hard`, so re-running completed migrations must be a no-op.
4. **Use `bcryptjs` (pure JS), not `bcrypt` (native).** The native `bcrypt` needs `node-gyp` +
   `build-essential` and can fail to compile on this tiny instance. `bcryptjs` is a drop-in with no
   build step.
5. **The cron worker runs inside the single PM2 fork process.** That is the ONLY thing that makes it
   safe from double-firing. **Never switch PM2 to cluster mode or `instances > 1`** without moving the
   scheduler to its own single-instance process — otherwise every scheduled post publishes N times.
6. **Memory is the main constraint.** AI generation + Postgres + a Vite build all share 908 MB. Tune
   Postgres low, cap the worker to **one job at a time**, and rely on swap. Watch `free -h` / `pm2 logs`.

---

## ⭐ PHASE 0 — Provision the server for SaaS (run on EC2, do this FIRST)

This is infra, not app code. Do it on the server over SSH before Phase 1's code can run.

```
PHASE 0 — prepare the live EC2 server for the SaaS build. These are server commands + env changes,
not application code. The app already runs here under PM2 + Nginx; don't disturb that.

1. INSTALL POSTGRES (tuned for a 908 MB instance):
   sudo apt update && sudo apt install -y postgresql postgresql-contrib
   sudo systemctl enable --now postgresql
   # Low-RAM tuning — edit the main postgresql.conf:
   #   shared_buffers = 128MB
   #   work_mem = 8MB
   #   max_connections = 30
   sudo systemctl restart postgresql

2. CREATE DB + APP USER (localhost only):
   sudo -u postgres psql -c "CREATE DATABASE article_writer;"
   sudo -u postgres psql -c "CREATE USER aw_user WITH ENCRYPTED PASSWORD '<STRONG_PASSWORD>';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE article_writer TO aw_user;"
   sudo -u postgres psql -d article_writer -c "GRANT ALL ON SCHEMA public TO aw_user;"
   # Enable extensions the schema needs (uuid + case-insensitive email):
   sudo -u postgres psql -d article_writer -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;"

3. GENERATE SECRETS (run twice, keep both values safe — back them up!):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY (32 bytes/64 hex)
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET

4. ADD TO THE SERVER .env (/home/ubuntu/Article_Writer/.env), then `pm2 restart article-writer-backend`:
   DATABASE_URL=postgresql://aw_user:<STRONG_PASSWORD>@localhost:5432/article_writer
   JWT_SECRET=<paste>
   ENCRYPTION_KEY=<paste 64-hex>
   # keep existing platform AI keys as fallbacks:
   PLATFORM_GEMINI_API_KEY=<existing GEMINI_API_KEY value>
   PLATFORM_DEEPSEEK_API_KEY=<existing DEEPSEEK_API_KEY value>

5. DEPLOY SCRIPT already runs `npm run migrate --if-present` before the frontend build — so once
   Phase 1 adds the migrate script, every push auto-migrates. No deploy.sh change needed.

6. DAILY BACKUP (cheap insurance on a single box):
   Add a cron: `0 3 * * * pg_dump -U aw_user article_writer | gzip > /home/ubuntu/backups/aw_$(date +\%F).sql.gz`
   (create /home/ubuntu/backups, keep ~7 days). Especially protects users + encrypted credentials.

Confirm: `psql "$DATABASE_URL" -c "select 1;"` succeeds from the ubuntu user before starting Phase 1.
```

---

## ⭐ MASTER PROMPT (paste first for the overview)

```
You are upgrading my existing "Shopify Article Writer" into a multi-tenant SaaS. Read the whole repo
first and respect the current structure. The app is ALREADY DEPLOYED and LIVE — see the production
notes at the end; do not re-architect the deployment.

CURRENT ARCHITECTURE
- Monorepo run with `concurrently`. Root scripts: dev, build, start.
- backend/: Node + Express, ES modules ("type":"module"), port 5001.
  Routes: backend/src/routes/{settings,businessDna,articles}.js
  Services: backend/src/services/{shopify,gemini,deepseek}.js
  Config: backend/src/config/env.js (reads the repo-root ../../../.env)
- frontend/: React 18 + Vite + React Router. Pages in frontend/src/pages/, API client in
  frontend/src/lib/api.js (calls RELATIVE /api paths), layout in frontend/src/components/Layout.jsx.
- TODAY IT IS SINGLE-TENANT: one store's creds live in .env + in-memory (shopify.js runtimeCredentials);
  Business DNA is cached to backend/src/data/businessDna.json.

GOAL — convert to SaaS:
1. AUTH: Email + password sign-up/login with JWT. Hash passwords with bcryptjs (pure JS — NOT native
   bcrypt, the server can't reliably compile it). Protected API routes.
2. DATABASE: PostgreSQL for all persistent data. Use the `pg` library with a small query helper and
   tracked, idempotent SQL migrations (a schema_migrations table; no heavyweight ORM unless justified).
   Remove reliance on .env credentials and businessDna.json — those become per-user DB rows.
3. PER-USER CREDENTIALS: Each user connects their OWN Shopify store + optional OWN AI keys (fall back
   to PLATFORM_* keys). Encrypt secrets at rest (AES-256-GCM, key from ENCRYPTION_KEY). shopify.js must
   stop using global runtimeCredentials and take the current user's creds per request.
4. IMAGE-AWARE ARTICLES: auto-select the most relevant images from the user's EXISTING Shopify products
   (from their Business DNA) and embed real <img> tags + product links into the article body.
5. AUTO-PUBLISH — both modes: (a) instant generate+publish; (b) a node-cron scheduled queue worker.
6. PLANS + USAGE LIMITS: plans (Free/Pro/Business) with a monthly article cap; block generation at the
   cap; admin assigns plans manually; keep billing abstracted for a future gateway.

CROSS-CUTTING
- Every route under /api/articles, /api/business-dna, /api/settings becomes user-scoped behind auth
  middleware (req.user from JWT). No data leaks between users.
- New env vars: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, PLATFORM_GEMINI_API_KEY,
  PLATFORM_DEEPSEEK_API_KEY. These already exist on the production server's .env (Phase 0).
- `npm run migrate` runs migrations in order and is idempotent (deploy.sh calls it on every deploy).
  Provide a seed for plans + one admin user.
- Frontend: Login + Signup pages, an auth context holding the JWT, an axios interceptor attaching the
  token + logging out on 401, route guards, a Plan/Usage page, a Scheduled Posts page. Keep existing
  pages but make them read the logged-in user's data. Keep all API calls relative (/api/...).
- Don't break local dev OR production. Update README with: create DB, run migrations, env vars.

PRODUCTION CONSTRAINTS (must respect):
- Live on AWS EC2 Ubuntu, 1 vCPU / 908 MB RAM / ~6.6 GB disk + 1 GB swap. PM2 (fork, 1 instance) +
  Nginx (serves frontend/dist, proxies /api). Auto-deploy via GitHub Actions → deploy/deploy.sh.
- Postgres is on the SAME box, localhost only. Memory is tight: tune queries, cap the cron worker to
  ONE job at a time, no cluster mode.
- ENCRYPTION_KEY/JWT_SECRET are fixed + backed up; never regenerate (would orphan encrypted secrets).

Implement in PHASES and PAUSE after each so I can test on both local and the server:
Phase 1 Auth + PostgreSQL foundation
Phase 2 Per-user Shopify + AI credentials (encrypted) + per-user Business DNA
Phase 3 Image-aware article generation
Phase 4 Auto-publish (instant + scheduled queue)
Phase 5 Plans + monthly usage limits + admin plan assignment

Start with Phase 1. Show me the migration SQL and the list of files you'll add/change before coding.
```

---

## PHASE 1 — Auth + PostgreSQL foundation

```
PHASE 1. Add PostgreSQL + JWT email/password auth to the existing Express + React app. Do NOT touch
article/image/publish logic — only the foundation.

BACKEND
- Add deps: pg, bcryptjs (NOT native bcrypt), jsonwebtoken.
- DB helper backend/src/db/index.js exporting `query` using a pg Pool from process.env.DATABASE_URL.
- A tracked migration runner: backend/src/db/migrate.js + migrations in backend/src/db/migrations/.
  Create a schema_migrations(version text pk, applied_at timestamptz) table; each run applies only
  files not yet recorded, inside a transaction. Add npm script "migrate": "node src/db/migrate.js".
  (deploy.sh already calls `npm run migrate --if-present` on every deploy — keep it idempotent.)
- First migration creates:
    users(id uuid pk default gen_random_uuid(), email citext unique not null,
          password_hash text not null, name text, role text not null default 'user',
          created_at timestamptz default now())
  (pgcrypto + citext extensions are already installed on the server; add CREATE EXTENSION IF NOT
   EXISTS lines in the migration so local/dev DBs get them too.)
- backend/src/routes/auth.js:
    POST /api/auth/register -> validate, hash with bcryptjs, create user, return JWT
    POST /api/auth/login    -> verify, return JWT { sub: user.id, role }
    GET  /api/auth/me       -> current user (protected)
- backend/src/middleware/auth.js: read Bearer token, verify with JWT_SECRET, set
  req.user = { id, role }; 401 on failure.
- Mount auth routes in server.js; import auth middleware ready for Phase 2 (don't lock existing routes
  down yet).

FRONTEND
- Pages Login.jsx + Signup.jsx (forms, react-hot-toast for errors).
- AuthContext (frontend/src/context/AuthContext.jsx): stores JWT, exposes login/logout/register/user.
- api.js: request interceptor attaches Authorization: Bearer <token>; response interceptor logs out on
  401. Keep baseURL relative (/api).
- Route guards in App.jsx: logged-out users → /login; /login + /signup public.
- Logout button + user email in Layout.jsx.

ACCEPTANCE
- Sign up, log in, refresh-and-stay-logged-in, GET /api/auth/me returns me; protected route without a
  token → 401. `npm run migrate` creates tables on a fresh DB and is a no-op on the second run.
- Verify on the server too: after deploy, `npm run migrate` ran automatically and /api/auth/me works
  through Nginx at the live URL.
Show the migration SQL + file list first, then implement. Update README (DB + env setup).
```

---

## PHASE 2 — Per-user Shopify + AI credentials (encrypted) + per-user Business DNA

```
PHASE 2. Make credentials + Business DNA per-user in PostgreSQL, replacing .env creds and
backend/src/data/businessDna.json. All routes behind Phase 1 auth, scoped to req.user.id.

MIGRATIONS — add tables:
- shopify_stores(id uuid pk default gen_random_uuid(), user_id uuid fk users, store_url text not null,
    access_token_encrypted text not null, shop_name text, is_default boolean default true,
    created_at timestamptz default now())
- ai_credentials(id uuid pk default gen_random_uuid(), user_id uuid fk users unique,
    gemini_key_encrypted text, deepseek_key_encrypted text, created_at, updated_at)
- business_dna(user_id uuid pk fk users, store_id uuid fk shopify_stores, data jsonb not null,
    fetched_at timestamptz)

ENCRYPTION
- backend/src/lib/crypto.js: encrypt(text)/decrypt(text) with AES-256-GCM, key from
  process.env.ENCRYPTION_KEY (64-hex → 32 bytes). Store iv+authTag+ciphertext together. Never log
  plaintext. FAIL FAST at boot if ENCRYPTION_KEY is missing or not 32 bytes — a wrong/rotated key
  silently corrupts every secret (see production rules).

SERVICE REFACTOR
- shopify.js: REMOVE global runtimeCredentials. Every exported fn (getShopInfo, getProducts,
  getCollections, getBlogs, getArticles, getPages, createArticle, updateArticle, deleteArticle,
  getArticle) takes a `creds` arg { storeUrl, accessToken } and builds headers/baseUrl from it.
- gemini.js / deepseek.js: accept an optional apiKey arg; use the user override if present, else the
  PLATFORM_* env key.

ROUTES (rewrite settings + businessDna per-user)
- POST /api/settings/connect    test store with url+token, encrypt + upsert shopify_stores, return shop info
- GET  /api/settings            user's connected store(s), token MASKED
- POST /api/settings/disconnect delete the user's store row
- POST /api/settings/ai-keys    save user's optional Gemini/DeepSeek keys (encrypted)
- POST /api/business-dna/fetch  use THIS user's creds, fetch DNA, upsert business_dna (jsonb) by user_id
- GET  /api/business-dna        this user's stored DNA (or null)
- DELETE /api/business-dna      delete this user's DNA row
- Update articles.js DNA consumers to load the current user's DNA from the DB.

FRONTEND
- Settings page: per-user store connect form + optional AI-key fields; shows connected store (masked).
- Business DNA page: reads/fetches the logged-in user's DNA.

ACCEPTANCE
- Two users connect two different stores and never see each other's data.
- No secret stored in plaintext; .env no longer holds per-user Shopify creds.
- Business DNA read/written in PostgreSQL (jsonb), not the JSON file.
- ONE-TIME MIGRATION NOTE: the existing single-tenant store creds (currently in the server .env) and
  the current businessDna.json should be migrated into the admin user's rows by a small seed/script so
  nothing is lost. Show me that script.
Show migrations + shopify.js signature changes first, then implement.
```

---

## PHASE 3 — Image-aware article generation

```
PHASE 3. Auto-include the most relevant EXISTING Shopify images from the user's products. Builds on
per-user DNA in DB (products[] each with image URL, title, handle, productType, tags).

BACKEND
- backend/src/services/imageMatcher.js:
    selectRelevantImages(topic, products, { max = 4 }) -> rank products vs the topic by keyword/tag/
    title overlap (simple TF-style scoring, no external API), return top N that HAVE an image as
    [{ title, handle, imageUrl, alt }]. Keep it cheap — runs in-process on a memory-tight server.
- gemini.js / deepseek.js prompt builders: give the model the selected images (URL + title + handle)
  and instruct it to embed real <img src alt> tags at sensible points + a contextual
  <a href="/products/{handle}"> near each. Keep placeholder behavior ONLY as a no-match fallback.
- /api/articles/generate: call selectRelevantImages with the user's DNA products before building the
  prompt; pass chosen images in; ensure bodyHtml contains real Shopify CDN <img> tags. Keep the SEO
  scorer working (counts <img>).

FRONTEND
- Generate page: after generation, show which product images were auto-inserted (thumbnail + title).
  (Manual swap out of scope — auto-pick only.)

ACCEPTANCE
- A topic matching my products embeds real Shopify image URLs (not placeholders) with good alt text +
  a product link near each. No match → graceful placeholder fallback, no error.
Show the matching algorithm + prompt changes first, then implement.
```

---

## PHASE 4 — Auto-publish: instant + scheduled queue

```
PHASE 4. Add both publish modes. Builds on Phases 1–3.

MIGRATION — add:
- scheduled_posts(id uuid pk default gen_random_uuid(), user_id uuid fk users,
    store_id uuid fk shopify_stores, blog_id text, topic text not null, word_count int, ai_model text,
    run_at timestamptz not null,
    status text not null default 'pending',   -- pending | processing | published | failed
    published_article_id text, error text, created_at timestamptz default now())

INSTANT MODE
- POST /api/articles/generate-and-publish: generate (Phase 3 image logic) then immediately publish to
  the user's chosen Shopify blog in one request; return the created article. Reuse existing generate +
  shopifyService.createArticle paths with the user's DB creds.

SCHEDULED QUEUE (user-scoped CRUD)
- POST   /api/scheduled-posts     create { topic, runAt, blogId, wordCount, aiModel }
- GET    /api/scheduled-posts     list this user's jobs + status
- DELETE /api/scheduled-posts/:id cancel a pending job

WORKER
- backend/src/workers/scheduler.js using node-cron, **runs inside the existing single PM2 process**
  (start it from server.js). Every minute: find scheduled_posts where status='pending' AND
  run_at <= now(), claim them with `UPDATE … SET status='processing' WHERE id=$1 AND status='pending'
  RETURNING *` (atomic claim — prevents double-processing), then generate + publish, then set
  'published' (+published_article_id) or 'failed' (+error).
- MEMORY GUARD (server is 908 MB): process **at most ONE job per tick**; never fan out concurrent AI
  generations. If a tick is still running, skip the next (a simple in-process `isRunning` lock).
- CONCURRENCY GUARD: this is safe ONLY because PM2 runs a single fork instance. Add a code comment
  saying so. Do NOT enable PM2 cluster / instances>1 without moving the worker to its own
  single-instance process.
- Leave a clearly marked hook for the Phase 5 monthly-limit check in both publish paths + the worker.

FRONTEND
- Generate page: add a "Generate & Publish now" button alongside the existing generate-then-review flow.
- New "Scheduled Posts" page: queue-a-topic form (date/time), table of jobs with status badges, cancel
  button for pending ones.

ACCEPTANCE
- One click generates + publishes live to my Shopify blog.
- Queue 3 future topics; the worker publishes each on time; the table reflects pending → published (or
  failed with a readable error). Killing/redeploying mid-run doesn't double-publish (atomic claim).
Show the migration, the worker loop + atomic-claim SQL, and the new routes first, then implement.
```

---

## PHASE 5 — Plans + monthly usage limits + admin plan assignment

```
PHASE 5. Subscription plans with a per-month article cap. No payment gateway (admin assigns plans),
but keep billing abstracted for a future Razorpay/Stripe add-on.

MIGRATIONS — add:
- plans(id text pk,            -- 'free' | 'pro' | 'business'
    name text not null, monthly_article_limit int not null, price_inr int default 0,
    features jsonb default '{}')
- subscriptions(user_id uuid pk fk users, plan_id text fk plans not null default 'free',
    status text not null default 'active', current_period_start date, created_at, updated_at)
- usage_counters(user_id uuid fk users, period text,   -- 'YYYY-MM'
    articles_generated int not null default 0, primary key(user_id, period))
- Seed plans: free=5, pro=50, business=200. New users default to 'free'.

ENFORCEMENT
- backend/src/services/usage.js:
    getCurrentUsage(userId)  -> { used, limit, period, planId }
    assertCanGenerate(userId)-> throws { code:'LIMIT_REACHED' } (HTTP 402) if used >= limit
    incrementUsage(userId)   -> bump the current 'YYYY-MM' counter (UPSERT)
- Call assertCanGenerate at the start of EVERY article-creating path: /api/articles/generate,
  /api/articles/generate-and-publish, and the Phase 4 worker (use the hook left there). Call
  incrementUsage only on SUCCESS. Decide + document whether enhancement/regeneration counts.
- Blocked → clear JSON error the frontend shows as an upgrade prompt.
- The worker marks limit-blocked jobs 'failed' with a limit message rather than over-publishing.

ADMIN (role='admin' from JWT)
- GET  /api/admin/users            list users + plan + current usage
- POST /api/admin/users/:id/plan   set a user's plan_id manually
- Seed one admin user (email/password from env or a one-off seed; the same admin owns the migrated
  legacy store/DNA from Phase 2).

FRONTEND
- "Plan & Usage" page: current plan, monthly limit, used/remaining progress bar, "Contact us to
  upgrade" note (future checkout placeholder).
- Generate page: show remaining quota; at the cap, disable generation + show the upgrade message.
- Minimal Admin page (admins only): user list + plan dropdown to reassign.

ACCEPTANCE
- A Free user is blocked after 5 articles in a calendar month with a clear message; admin bumps them to
  Pro and they can generate again. Usage resets at the new month (new 'YYYY-MM' row).
- The scheduled worker respects the limit too.
Show the migrations + usage service first, then implement.
```

---

## Running these (production notes)

1. **Do Phase 0 on the server first**, then Phases 1→5 in order, testing each phase's acceptance on
   BOTH local and the live server before moving on.
2. **Secrets workflow:** edit the server `.env` directly (or `scp` it up) — never commit it. After any
   `.env` change run `pm2 restart article-writer-backend`. The frontend has no secrets.
3. **Every deploy auto-migrates:** `deploy.sh` runs `npm run migrate --if-present` before the build,
   so pushing Phase 1 to `main` will create tables on the server automatically. Keep migrations
   idempotent so this is always safe.
4. **Watch memory** after Phases 4–5: `free -h`, `pm2 logs article-writer-backend`. If AI generation
   under load gets killed (OOM), that's the 908 MB ceiling — either keep the worker at 1 job/tick
   (already specified) or resize the instance.
5. **Back up the DB** (Phase 0 cron). The users table + encrypted credentials are unrecoverable if lost
   and `ENCRYPTION_KEY` is needed to read them — keep that key in a password manager.
6. **Future payments = Phase 6:** "Add Razorpay subscriptions wired to the existing subscriptions/plans
   tables; on successful payment set plan_id + status." The schema is already shaped for it.
```
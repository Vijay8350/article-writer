# Article Writer → SaaS — Build Prompts

These prompts turn your existing single-tenant **Shopify Article Writer** into a multi-user SaaS.
Paste them into your coding AI (Claude Code, Cursor, etc.) from inside the project root.

**Decisions locked in (so every prompt assumes these):**

- **Auth:** Email + password with JWT (custom, built into the Express backend).
- **Database:** PostgreSQL.
- **Payments:** None yet — plans are assigned manually by an admin. Architecture stays payment-ready.
- **Plan limit:** Articles generated per month (per user).
- **Images:** AI auto-picks the most relevant *existing* Shopify product images and embeds them in the article body.
- **Auto-publish:** Both modes — instant one-click publish AND a scheduled topic queue.

**Current state the AI must understand (give it this context every time):**

> This is a monorepo. `backend/` is Node + Express (ES modules, `"type":"module"`), port 5001, with routes in `backend/src/routes/`, services in `backend/src/services/` (`shopify.js`, `gemini.js`, `deepseek.js`), config in `backend/src/config/env.js`. `frontend/` is React 18 + Vite + React Router with pages in `frontend/src/pages/` and the API client in `frontend/src/lib/api.js`. Today the app is single-tenant: Shopify credentials live in `.env` and runtime memory (`shopify.js` `runtimeCredentials`), and "Business DNA" is cached in one file `backend/src/data/businessDna.json`. We are converting this to multi-tenant SaaS — every store/credential/DNA/article must become per-user and live in PostgreSQL instead of `.env` and the JSON file.

---

## ⭐ MASTER PROMPT (paste this first for the full overview)

```
You are upgrading my existing "Shopify Article Writer" app into a multi-tenant SaaS. Read the
whole repo first and respect the current structure before changing anything.

CURRENT ARCHITECTURE
- Monorepo run with `concurrently`. Root scripts: dev, build, start.
- backend/: Node + Express, ES modules ("type":"module"), port 5001.
  Routes: backend/src/routes/{settings,businessDna,articles}.js
  Services: backend/src/services/{shopify,gemini,deepseek}.js
  Config: backend/src/config/env.js (reads ../../../.env)
- frontend/: React 18 + Vite + React Router. Pages in frontend/src/pages/, API client in
  frontend/src/lib/api.js, layout in frontend/src/components/Layout.jsx.
- TODAY IT IS SINGLE-TENANT: one Shopify store's credentials live in .env and in-memory
  (shopify.js runtimeCredentials); Business DNA is cached to backend/src/data/businessDna.json.

GOAL — convert to SaaS with these capabilities:
1. AUTH: Email + password sign-up/login using JWT. Hashed passwords (bcrypt). Protected API routes.
2. DATABASE: PostgreSQL for all persistent data (users, shopify stores/credentials, business DNA,
   articles, usage, plans, scheduled jobs). Use the `pg` library with a small query helper and SQL
   migration files (no heavyweight ORM unless you justify it). Remove reliance on .env credentials
   and the businessDna.json file — those become per-user DB rows.
3. PER-USER CREDENTIALS: Each user connects their OWN Shopify store + their OWN AI keys
   (Gemini/DeepSeek optional override; fall back to platform keys). Encrypt secrets at rest
   (AES-256-GCM with a key from env). shopify.js must stop using global runtimeCredentials and
   instead take the current user's credentials per request.
4. IMAGE-AWARE ARTICLES: When generating, the AI auto-selects the most relevant images from the
   user's EXISTING Shopify products (from their Business DNA) and embeds real <img> tags with those
   Shopify CDN URLs and good alt text into the article body.
5. AUTO-PUBLISH — both modes:
   a) Instant: user enters topic + settings, one click generates AND publishes to their Shopify blog.
   b) Scheduled queue: user adds topics with a schedule; a background worker (node-cron) generates
      and publishes them automatically at the set times. Store jobs in DB with status tracking.
6. PLANS + USAGE LIMITS: Plans table (Free/Pro/Business) with a monthly article cap. Track each
   user's article count for the current calendar month and BLOCK generation when the cap is hit
   (clear error + upgrade hint). No payment gateway yet — an admin assigns plans manually. Keep the
   billing layer abstracted so a gateway (Razorpay/Stripe) can be added later.

CROSS-CUTTING REQUIREMENTS
- Every existing route under /api/articles, /api/business-dna, /api/settings must become
  user-scoped behind auth middleware (req.user from JWT). No data leaks between users.
- Add .env vars: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, plus existing PLATFORM_* AI keys.
- Migrations must be runnable (e.g. `npm run migrate`). Provide a seed for plans + one admin user.
- Frontend: add Login + Signup pages, an auth context that stores the JWT, an axios interceptor that
  attaches the token, route guards that redirect logged-out users to /login, a Plan/Usage page, and
  a Scheduled Posts page. Keep the existing pages but make them read the logged-in user's data.
- Don't break local dev. Update README with setup steps (create DB, run migrations, env vars).

Implement this in PHASES and pause after each phase so I can test:
Phase 1 Auth + PostgreSQL foundation
Phase 2 Per-user Shopify + AI credentials (encrypted) + per-user Business DNA
Phase 3 Image-aware article generation
Phase 4 Auto-publish (instant + scheduled queue)
Phase 5 Plans + monthly usage limits + admin plan assignment

Start with Phase 1. Show me the migration SQL and the list of files you'll add/change before writing code.
```

---

## PHASE 1 — Auth + PostgreSQL foundation

```
PHASE 1 of the SaaS upgrade. Add PostgreSQL and JWT email/password auth to the existing Express +
React app. Do NOT touch article/image/publish logic yet — only the foundation.

BACKEND
- Add deps: pg, bcrypt, jsonwebtoken. Add a DB helper backend/src/db/index.js that exports a `query`
  function using a pg Pool reading process.env.DATABASE_URL.
- Add SQL migrations in backend/src/db/migrations/ and an npm script "migrate" that runs them in order.
- Create the users table:
    users(id uuid pk default gen_random_uuid(), email citext unique not null,
           password_hash text not null, name text, role text not null default 'user',
           created_at timestamptz default now())
- Add backend/src/routes/auth.js with:
    POST /api/auth/register  -> validate email+password, hash with bcrypt, create user, return JWT
    POST /api/auth/login     -> verify, return JWT { sub: user.id, role }
    GET  /api/auth/me        -> returns the current user (protected)
- Add backend/src/middleware/auth.js: reads Bearer token, verifies JWT with process.env.JWT_SECRET,
  sets req.user = { id, role }. Return 401 on failure.
- Mount auth routes in server.js. Leave existing routes as-is for now but add the auth middleware
  import ready for Phase 2.
- Add JWT_SECRET to .env and env.js.

FRONTEND
- Add pages frontend/src/pages/Login.jsx and Signup.jsx (simple forms, use react-hot-toast for errors).
- Add an AuthContext (frontend/src/context/AuthContext.jsx) that stores the JWT in memory + a state
  flag, exposes login/logout/register/user.
- In frontend/src/lib/api.js add an axios request interceptor that attaches Authorization: Bearer
  <token>, and a response interceptor that logs the user out on 401.
- Add route guards in App.jsx: unauthenticated users hitting any app route redirect to /login;
  /login and /signup are public.
- Add a logout button + the user's email to Layout.jsx.

ACCEPTANCE
- I can sign up, log in, refresh and stay logged in (token persisted appropriately), and GET
  /api/auth/me returns my user. Hitting a protected route without a token returns 401.
- `npm run migrate` creates the users table on a fresh DB.
Show the migration SQL and the file list first, then implement. Update README with DB + env setup.
```

---

## PHASE 2 — Per-user Shopify + AI credentials (encrypted) + per-user Business DNA

```
PHASE 2. Make credentials and Business DNA per-user in PostgreSQL, replacing the .env credentials and
the backend/src/data/businessDna.json file. All routes below must be behind the auth middleware from
Phase 1 and scoped to req.user.id.

MIGRATIONS — add tables:
- shopify_stores(id uuid pk, user_id uuid fk users, store_url text not null,
    access_token_encrypted text not null, shop_name text, is_default boolean default true,
    created_at timestamptz default now())
- ai_credentials(id uuid pk, user_id uuid fk users unique, gemini_key_encrypted text,
    deepseek_key_encrypted text, created_at, updated_at)   -- optional per-user overrides
- business_dna(user_id uuid pk fk users, store_id uuid fk shopify_stores, data jsonb not null,
    fetched_at timestamptz)

ENCRYPTION
- Add backend/src/lib/crypto.js with encrypt(text) / decrypt(text) using AES-256-GCM and a key from
  process.env.ENCRYPTION_KEY (32-byte hex). Never store or log plaintext secrets.

SERVICE REFACTOR (important)
- Refactor backend/src/services/shopify.js: REMOVE the global runtimeCredentials pattern. Every
  exported function (getShopInfo, getProducts, getCollections, getBlogs, getArticles, getPages,
  createArticle, updateArticle, deleteArticle, getArticle) must accept a `creds` object
  { storeUrl, accessToken } (or a connected-store row) as an argument and build headers/baseUrl from it.
- gemini.js / deepseek.js: accept an optional apiKey arg; if a user override exists use it, else fall
  back to the platform key in env.

ROUTES (rewrite settings + businessDna to be per-user)
- POST /api/settings/connect  -> test the store with the given url+token, encrypt + upsert into
    shopify_stores for req.user.id, return shop info. (No more writing to .env.)
- GET  /api/settings          -> return the user's connected store(s), masked token.
- POST /api/settings/disconnect -> delete the user's store row.
- POST /api/settings/ai-keys  -> save the user's optional Gemini/DeepSeek keys (encrypted).
- POST /api/business-dna/fetch -> use THIS user's store creds, fetch DNA, upsert into business_dna
    (jsonb) keyed by user_id. Remove all reads/writes of businessDna.json.
- GET  /api/business-dna       -> return this user's stored DNA (or null).
- DELETE /api/business-dna     -> delete this user's DNA row.
- Update getBusinessDna() consumers in articles.js to load the current user's DNA from the DB.

FRONTEND
- Settings page: per-user store connect form + optional AI-key fields, shows connected store.
- Business DNA page: reads/fetches the logged-in user's DNA.

ACCEPTANCE
- Two different users can connect two different Shopify stores and never see each other's data.
- No secret is ever stored in plaintext; .env no longer holds per-user Shopify credentials.
- Business DNA is read from and written to PostgreSQL (jsonb), not the JSON file.
Show migrations + the shopify.js function-signature changes first, then implement.
```

---

## PHASE 3 — Image-aware article generation

```
PHASE 3. Make generated articles automatically include the most relevant EXISTING Shopify images
from the user's products. Build on Phases 1–2 (per-user DNA already in DB, which includes
products[] each with an `image` URL, title, handle, productType, tags).

BACKEND
- Add backend/src/services/imageMatcher.js:
    selectRelevantImages(topic, products, { max = 4 }) -> ranks the user's products against the topic
    using keyword/tag/title overlap (simple TF-style scoring is fine; no external API) and returns the
    top N products that HAVE an image, as [{ title, handle, imageUrl, alt }].
- Update the article prompt builders in gemini.js and deepseek.js so the model is given the selected
  images (URL + product title + handle) and is instructed to embed them as real
  <img src="..." alt="..."> tags at sensible points in the body, and to add a contextual product link
  (<a href="/products/{handle}">) near each image. Keep existing image-placeholder behavior as a
  fallback only when no relevant product image exists.
- In /api/articles/generate: call selectRelevantImages with the user's DNA products before building
  the prompt; pass the chosen images into the generator; ensure the returned bodyHtml contains the
  real Shopify CDN <img> tags. Keep the SEO scorer working (it already counts <img>).

FRONTEND
- On the Generate Article page, after generation show which product images were auto-inserted
  (thumbnails + product title). (Manual swap is out of scope for this phase per the chosen design —
  auto-pick only.)

ACCEPTANCE
- Generating an article about a topic that matches my products embeds those products' real Shopify
  image URLs (not placeholders) with descriptive alt text, plus a product link near each image.
- If no product matches, it degrades gracefully to placeholders without erroring.
Show the matching algorithm and the prompt changes first, then implement.
```

---

## PHASE 4 — Auto-publish: instant + scheduled queue

```
PHASE 4. Add both publish modes. Build on Phases 1–3.

MIGRATION — add:
- scheduled_posts(id uuid pk, user_id uuid fk users, store_id uuid fk shopify_stores, blog_id text,
    topic text not null, word_count int, ai_model text, run_at timestamptz not null,
    status text not null default 'pending',   -- pending | processing | published | failed
    published_article_id text, error text, created_at timestamptz default now())

INSTANT MODE
- Add POST /api/articles/generate-and-publish: generate (with Phase 3 image logic) then immediately
  publish to the user's chosen Shopify blog in one request; return the created article. Reuse existing
  generate + shopifyService.createArticle paths. Enforce the user's store creds from DB.

SCHEDULED QUEUE
- CRUD routes (all user-scoped):
    POST   /api/scheduled-posts        create a queued topic { topic, runAt, blogId, wordCount, aiModel }
    GET    /api/scheduled-posts        list this user's jobs with status
    DELETE /api/scheduled-posts/:id    cancel a pending job
- Add a background worker backend/src/workers/scheduler.js using node-cron (run every minute). It:
    finds scheduled_posts where status='pending' and run_at <= now(), marks them 'processing',
    loads that user's store creds + DNA, generates the image-aware article, publishes to Shopify,
    then sets status='published' (+ published_article_id) or 'failed' (+ error). Make it safe against
    double-processing (status guard / row lock). Start the worker from server.js.
- IMPORTANT: when Phase 5 lands, the worker and both publish paths must also check the monthly limit;
  leave a clearly marked hook for that check now.

FRONTEND
- Generate page: add a "Generate & Publish now" button (instant mode) alongside the existing
  generate-then-review flow.
- New "Scheduled Posts" page: form to queue a topic with a date/time, a table of upcoming/past jobs
  with status badges, and a cancel button for pending ones.

ACCEPTANCE
- One click can generate + publish an article live to my Shopify blog.
- I can queue 3 topics for future times; the worker publishes each at its time and the table reflects
  pending → published (or failed with a readable error).
Show the migration, the worker loop logic, and the new routes first, then implement.
```

---

## PHASE 5 — Plans + monthly usage limits + admin plan assignment

```
PHASE 5. Add subscription plans with a per-month article cap. No payment gateway — admin assigns
plans manually — but keep billing abstracted for a future Razorpay/Stripe add-on.

MIGRATIONS — add:
- plans(id text pk,            -- 'free' | 'pro' | 'business'
    name text not null, monthly_article_limit int not null, price_inr int default 0,
    features jsonb default '{}')
- subscriptions(user_id uuid pk fk users, plan_id text fk plans not null default 'free',
    status text not null default 'active', current_period_start date, created_at, updated_at)
- usage_counters(user_id uuid fk users, period text,   -- 'YYYY-MM'
    articles_generated int not null default 0, primary key(user_id, period))
- Seed plans: free=5, pro=50, business=200 articles/month. New users default to 'free'.

ENFORCEMENT
- Add backend/src/services/usage.js:
    getCurrentUsage(userId) -> { used, limit, period, planId }
    assertCanGenerate(userId) -> throws 402-style error { code:'LIMIT_REACHED' } if used >= limit
    incrementUsage(userId)   -> bumps the counter for the current 'YYYY-MM'
- Call assertCanGenerate at the start of EVERY article-creating path: /api/articles/generate,
  /api/articles/generate-and-publish, and inside the Phase 4 scheduler worker (use the hook left
  there). Call incrementUsage only on successful generation. Enhancement/regeneration counts too —
  decide and document the rule.
- When blocked, return a clear JSON error the frontend can show as an upgrade prompt.

ADMIN
- Add role-guarded admin routes (role='admin' from the JWT):
    GET  /api/admin/users               list users with plan + current usage
    POST /api/admin/users/:id/plan      set a user's plan_id manually
- Seed one admin user (email/password from env or migration seed).

FRONTEND
- "Plan & Usage" page: shows current plan, monthly limit, used/remaining with a progress bar, and a
  "Contact us to upgrade" note (placeholder for future checkout).
- Show remaining quota on the Generate page; if the limit is hit, disable generation and show the
  upgrade message.
- Minimal Admin page (visible only to admins): user list + a plan dropdown to reassign.

ACCEPTANCE
- A Free user is blocked after 5 articles in a calendar month with a clear message; an admin can bump
  them to Pro and they can generate again. Usage resets naturally at the start of a new month
  (new 'YYYY-MM' period row).
- The scheduled worker also respects the limit and marks jobs 'failed' with a limit message rather
  than over-publishing.
Show the migrations + the usage service first, then implement.
```

---

## Tips for running these

1. Run **Phase 1 → 5 in order**, and actually test each phase's acceptance criteria before moving on. The phases depend on each other (per-user DNA in Phase 2 is what Phase 3's image matcher reads, etc.).
2. Before Phase 1, make sure PostgreSQL is available (local install, Docker, or a managed one like Neon/Supabase/RDS) and put its connection string in `DATABASE_URL`.
3. Generate `ENCRYPTION_KEY` and `JWT_SECRET` as long random values, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. When you later want payments, add a Phase 6 prompt: "Add Razorpay subscriptions wired to the existing `subscriptions`/`plans` tables; on successful payment set plan_id and status." The schema above is already shaped for it.
5. Keep your real API keys out of git — `.env` is already gitignored; make sure it stays that way after the refactor.

# Shopify Article Writer → Full SaaS Product

*A product-manager's spec + ready-to-paste build prompts to take this tool from an internal app to a commercial, multi-tenant SaaS you can sell to anyone.*

---

## Part A — Product vision (read this first)

**What we're selling:** "AI blog writer for Shopify stores." A merchant signs up, connects their store, and the tool researches their catalog, writes SEO-optimized articles with their real product images, and publishes them to their Shopify blog — manually, instantly, or on an automatic schedule.

**Who buys it:** Solo Shopify merchants, dropshippers, agencies managing multiple stores, and content teams. Pricing is per workspace with monthly article quotas; agencies pay more for multiple stores and seats.

**How we make money:** Tiered monthly/annual subscriptions with a free trial, billed through Razorpay (India) and Stripe (international). Higher tiers unlock more articles/month, more connected stores, more team seats, scheduling, and premium AI models.

**The 12 pillars every sellable SaaS needs** (this is what the prompts below build):

1. **Multi-tenancy** — data isolated per workspace/organization, never leaks between customers.
2. **Authentication & account security** — signup, login, email verification, password reset, Google OAuth, optional 2FA, refresh tokens, rate limiting.
3. **Team & roles (RBAC)** — Owner / Admin / Member, invite teammates, per-role permissions.
4. **Subscription & billing manager** — plans, free trial, checkout, recurring billing, upgrades/downgrades with proration, cancellation, invoices, dunning, webhooks.
5. **Usage metering & quota enforcement** — count articles/stores/seats per period, block or warn at limits, show usage dashboards.
6. **Superadmin / platform console** — you (the vendor) manage all tenants: view/suspend accounts, change plans, issue coupons/credits, impersonate for support, see platform metrics, toggle feature flags.
7. **Core product** — per-tenant Shopify credentials, Business DNA, image-aware article generation, instant + scheduled auto-publish, article library, SEO scoring, multi-store.
8. **Onboarding** — guided first-run: connect store → fetch DNA → generate first article → publish.
9. **Transactional email & notifications** — welcome, verify, reset, invite, invoice/receipt, quota warnings, job-published, payment-failed; plus in-app notifications.
10. **Analytics & reporting** — customer dashboard (articles published, SEO trends, schedule calendar) and vendor analytics (signups, MRR, churn, trial conversion, active workspaces).
11. **Security, compliance & data rights** — encryption at rest, audit logs, GDPR data export/delete, ToS/Privacy, secrets management, backups.
12. **Infrastructure & operations** — config per environment, migrations, a background job queue/worker, structured logging, error monitoring, health checks, scalable deploy (your existing EC2 + PM2 + nginx + GitHub Actions).

**Assumptions baked into the prompts** (change them in the prompt text if you disagree):

- Tenancy model = **Workspace/Organization** (a paying account that can hold multiple users and multiple Shopify stores). One user can belong to multiple workspaces.
- Stack stays **Node/Express (ES modules) + React/Vite + PostgreSQL**, building on your current repo.
- Billing = **Razorpay primary (INR) + Stripe (international)**, abstracted behind one billing interface so either can be swapped.
- Background work = **BullMQ + Redis** (robust job queue for scheduled publishing, email, webhooks). If you'd rather avoid Redis, the prompt notes a `node-cron` fallback.
- Secrets encrypted with **AES-256-GCM**; passwords with **bcrypt**; sessions via **JWT access + refresh tokens**.

---

## Part B — Plan & pricing model (used by the billing prompts)

| Plan | Price (suggested) | Articles/mo | Stores | Seats | Scheduling | AI models | Support |
|------|------|------|------|------|------|------|------|
| **Free trial** | ₹0 / 7 days | 5 | 1 | 1 | No | DeepSeek | Email |
| **Starter** | ₹799 / mo | 30 | 1 | 1 | Yes | DeepSeek + Gemini | Email |
| **Growth** | ₹1,999 / mo | 100 | 3 | 3 | Yes | All + premium | Priority |
| **Agency** | ₹4,999 / mo | 400 | 10 | 10 | Yes | All + premium | Priority + onboarding |

(Annual = 2 months free. Numbers are editable; the schema stores them in a `plans` table so you change them without code.)

---

## ⭐ MASTER PROMPT — paste this first

```
You are the lead engineer turning my existing "Shopify Article Writer" app into a commercial,
multi-tenant SaaS I can sell publicly. Read the entire repo first and preserve what works.

CURRENT APP (single-tenant)
- Monorepo, run with concurrently. backend/ = Node + Express, ES modules ("type":"module"), port 5001.
  Routes: backend/src/routes/{settings,businessDna,articles}.js
  Services: backend/src/services/{shopify,gemini,deepseek}.js  Config: backend/src/config/env.js
- frontend/ = React 18 + Vite + React Router. Pages in frontend/src/pages/, API in frontend/src/lib/api.js,
  layout in frontend/src/components/Layout.jsx.
- Today: ONE Shopify store's creds live in .env + in-memory (shopify.js runtimeCredentials); Business DNA
  is cached in backend/src/data/businessDna.json. This must all become per-tenant and live in PostgreSQL.

TARGET: a sellable SaaS with these 12 pillars
1. MULTI-TENANCY — a "Workspace" (organization) is the billable account. It owns Shopify stores, business
   DNA, articles, scheduled jobs, subscription and usage. Every DB row that is tenant data carries a
   workspace_id. A user can belong to multiple workspaces (membership table). All queries are scoped by the
   caller's active workspace. Zero data leakage between workspaces — enforce in a middleware, not ad hoc.
2. AUTH & SECURITY — email/password (bcrypt) + Google OAuth; email verification; password reset; optional
   TOTP 2FA; JWT access token (short-lived) + refresh token (rotating, httpOnly cookie); express-rate-limit
   on auth endpoints; helmet already present.
3. TEAM & RBAC — roles Owner/Admin/Member per workspace; invite teammates by email; permission checks on
   sensitive actions (billing, member management, disconnecting stores).
4. BILLING & SUBSCRIPTIONS — plans table (Free trial, Starter, Growth, Agency), 7-day trial, checkout via a
   provider-agnostic BillingProvider interface with Razorpay (INR) and Stripe (intl) implementations,
   recurring billing, upgrade/downgrade with proration, cancel at period end, invoices/receipts, dunning on
   failed payments, and secure webhook handlers that update subscription state. Never trust the client for
   entitlements — derive them from the stored subscription.
5. USAGE METERING & QUOTAS — meter articles generated per billing period, connected stores, and seats.
   Enforce limits centrally (assertWithinQuota) on every consuming action. Warn at 80%, block at 100% with a
   clear upgrade CTA.
6. SUPERADMIN CONSOLE — a separate platform-admin area (role=superadmin, NOT a normal workspace role) to:
   list/search all workspaces & users, view a workspace's plan/usage/activity, suspend/reactivate, change a
   plan or grant credits/coupons, impersonate a user for support (audit-logged), toggle feature flags, and
   see platform KPIs (signups, trials, MRR, active workspaces, churn).
7. CORE PRODUCT (made per-tenant) — per-workspace encrypted Shopify creds + optional AI keys; Business DNA in
   Postgres (jsonb); image-aware generation that auto-embeds the workspace's real Shopify product images;
   instant generate-and-publish AND a scheduled topic queue run by a background worker; article library with
   history and re-publish; existing SEO scorer kept.
8. ONBOARDING — post-signup wizard: create workspace → connect Shopify → fetch Business DNA → generate a
   sample article → publish. Track completion so we can resurface it.
9. EMAIL & NOTIFICATIONS — transactional email via a pluggable mailer (Resend/SendGrid/SMTP): verify email,
   reset password, teammate invite, trial ending, payment receipt, payment failed, quota warning, scheduled
   post published/failed. Plus an in-app notifications table + bell menu.
10. ANALYTICS — customer dashboard (articles generated/published, avg SEO score over time, upcoming schedule)
    and superadmin analytics (signups, trial→paid conversion, MRR, churn, active workspaces).
11. SECURITY & COMPLIANCE — AES-256-GCM for stored secrets; audit_logs table for sensitive actions;
    GDPR-style data export + account deletion; ToS/Privacy pages; no secrets in logs.
12. INFRASTRUCTURE — typed env config with validation; SQL migrations (npm run migrate) + seeds; BullMQ+Redis
    job queue for scheduled publishing, emails, and webhook processing (fallback: node-cron if Redis is not
    available — make this a config switch); structured logging (pino) + request IDs; Sentry-ready error hook;
    /api/health; keep the existing EC2 + PM2 + nginx + GitHub Actions deploy working and update it.

CROSS-CUTTING RULES
- Every existing route (/api/articles, /api/business-dna, /api/settings) becomes workspace-scoped behind auth
  + workspace-resolver middleware. Add x-workspace-id header (or /w/:workspaceId) handling.
- Refactor shopify.js to stop using global runtimeCredentials — pass per-workspace creds per call.
- .env additions: DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY,
  GOOGLE_OAUTH_*, RAZORPAY_*, STRIPE_*, MAIL_* , APP_URL, plus existing PLATFORM AI keys as fallback.
- Provide seeds: the 4 plans, one superadmin user, and a demo workspace.
- Update README with full setup (DB, Redis, env, migrations, seeds, running the worker).

DELIVER IN PHASES and STOP after each so I can test. Before writing code in a phase, show me (a) the
migration SQL, (b) the list of files you'll add/modify, and (c) any new env vars.
Phase 1  Multi-tenancy + PostgreSQL foundation + auth (access/refresh, verify, reset)
Phase 2  Team, RBAC, invites, workspace switching
Phase 3  Per-workspace Shopify/AI credentials + Business DNA in DB (refactor services)
Phase 4  Image-aware generation + article library
Phase 5  Auto-publish: instant + scheduled queue (BullMQ worker)
Phase 6  Billing & subscriptions (Razorpay + Stripe, trials, webhooks, invoices)
Phase 7  Usage metering & quota enforcement tied to the active plan
Phase 8  Superadmin console (tenants, plans, impersonation, feature flags, KPIs)
Phase 9  Transactional email + in-app notifications
Phase 10 Analytics dashboards (customer + superadmin), audit logs, GDPR export/delete, onboarding wizard
Start with Phase 1.
```

---

## Detailed phase prompts

Run these one at a time, after the master prompt. Each is self-contained enough to paste on its own.

### PHASE 1 — Multi-tenancy + Postgres + auth

```
PHASE 1. Lay the SaaS foundation: PostgreSQL, the workspace tenancy model, and secure auth. No billing or
product changes yet.

DEPS: pg, bcrypt, jsonwebtoken, cookie-parser, express-rate-limit, zod (env + input validation), pino.
DB HELPER: backend/src/db/index.js exporting query() on a pg Pool from DATABASE_URL. Migrations in
backend/src/db/migrations/, runner script "migrate" + "seed".

MIGRATIONS:
- users(id uuid pk default gen_random_uuid(), email citext unique not null, password_hash text,
    name text, email_verified_at timestamptz, is_superadmin boolean default false,
    google_id text unique, created_at timestamptz default now())
- workspaces(id uuid pk default gen_random_uuid(), name text not null, slug citext unique not null,
    owner_user_id uuid references users(id), status text default 'active', created_at default now())
- memberships(workspace_id uuid fk workspaces, user_id uuid fk users, role text not null default 'member',
    primary key(workspace_id,user_id))   -- role: owner|admin|member
- refresh_tokens(id uuid pk, user_id uuid fk users, token_hash text, expires_at timestamptz, revoked_at,
    created_at)
- email_tokens(id uuid pk, user_id uuid fk users, type text, token_hash text, expires_at, used_at)
    -- type: verify|reset

AUTH (backend/src/routes/auth.js + middleware/auth.js):
- POST /api/auth/register  -> create user (unverified) + a default workspace + owner membership; send verify
  email token (stub the email send for now, log the link); return access+refresh.
- POST /api/auth/login     -> verify password; issue short-lived access JWT (15m, payload {sub,is_superadmin})
  + rotating refresh token stored hashed; refresh set as httpOnly cookie.
- POST /api/auth/refresh   -> rotate refresh, issue new access.
- POST /api/auth/logout    -> revoke refresh.
- GET  /api/auth/me        -> user + their workspaces + active membership roles.
- POST /api/auth/verify-email, POST /api/auth/request-reset, POST /api/auth/reset.
- Rate-limit login/register/reset.
- middleware/auth.js -> verifies access token, sets req.user.
- middleware/workspace.js -> reads x-workspace-id header, confirms req.user has a membership, sets
  req.workspace + req.membershipRole. Reusable guard requireRole('admin'|'owner').

FRONTEND: AuthContext (access token in memory, refresh via cookie + silent refresh on 401), Login/Signup/
VerifyEmail/ForgotPassword/ResetPassword pages, an axios layer that injects the token + active workspace id,
route guards, and a basic workspace switcher placeholder in Layout.

ACCEPTANCE: register creates a user + default workspace + owner membership; login/refresh/logout work;
unverified users are flagged; every protected request carries a workspace and is rejected if the user isn't a
member. `npm run migrate && npm run seed` builds schema + seeds a superadmin + demo workspace.
Show migrations, file list, env vars first.
```

### PHASE 2 — Team, RBAC, invites, workspace switching

```
PHASE 2. Build team management on the Phase 1 tenancy.
MIGRATIONS: invitations(id uuid pk, workspace_id fk, email citext, role text, token_hash text, invited_by fk
users, expires_at, accepted_at, created_at).
ROUTES (workspace-scoped, requireRole as noted):
- GET  /api/workspaces                      list my workspaces
- POST /api/workspaces                      create a new workspace (I become owner)
- PATCH /api/workspaces/:id                 rename (owner/admin)
- GET  /api/members                         list members + roles
- POST /api/members/invite  (owner/admin)   create invitation + email it (stub) 
- POST /api/members/accept                  accept via token (creates membership)
- PATCH /api/members/:userId/role (owner)   change role
- DELETE /api/members/:userId   (owner/admin) remove member
PERMISSIONS: only owner can delete workspace, transfer ownership, change billing; owner/admin manage members
and stores; member can generate/publish but not manage billing or members.
FRONTEND: Members page (list, invite form, role dropdown, remove), an Accept-Invite page, and a real workspace
switcher in the top bar that sets the active workspace id used by the API layer.
ACCEPTANCE: I can invite a teammate, they accept and land in the workspace with the right role; role gates work
(a member is blocked from billing/member management with a 403 + clear UI message).
```

### PHASE 3 — Per-workspace Shopify/AI credentials + Business DNA in DB

```
PHASE 3. Make all credentials and Business DNA per-workspace in Postgres, removing .env creds and
businessDna.json. Build on Phases 1–2; everything scoped to req.workspace.id.
MIGRATIONS:
- shopify_stores(id uuid pk, workspace_id fk, store_url text, access_token_encrypted text, shop_name text,
    is_default boolean default true, created_at)
- ai_credentials(workspace_id uuid pk fk workspaces, gemini_key_encrypted text, deepseek_key_encrypted text,
    updated_at)
- business_dna(workspace_id uuid pk fk workspaces, store_id fk shopify_stores, data jsonb, fetched_at)
CRYPTO: backend/src/lib/crypto.js encrypt/decrypt with AES-256-GCM from ENCRYPTION_KEY. Never log plaintext.
SERVICE REFACTOR: shopify.js — remove global runtimeCredentials; every function takes a creds arg
{storeUrl, accessToken}. gemini.js/deepseek.js — accept optional apiKey, else fall back to platform env key.
ROUTES: rewrite /api/settings (connect/disconnect/list stores, save AI keys) and /api/business-dna
(fetch/get/delete) to read/write these tables for the active workspace. Update articles.js to load the
workspace's DNA from DB.
FRONTEND: Settings page connects a store + optional AI keys per workspace; Business DNA page reads the active
workspace's DNA.
ACCEPTANCE: two workspaces hold two different stores with no cross-visibility; no plaintext secrets anywhere;
DNA is read/written in Postgres jsonb. Show migrations + shopify.js signature changes first.
```

### PHASE 4 — Image-aware generation + article library

```
PHASE 4. Auto-embed the workspace's existing Shopify product images, and persist generated articles.
BACKEND:
- backend/src/services/imageMatcher.js: selectRelevantImages(topic, products, {max=4}) ranks the workspace's
  DNA products (title/tags/type overlap, simple scoring, no external API) and returns top products that have
  an image as [{title, handle, imageUrl, alt}].
- Update gemini.js/deepseek.js prompt builders to receive the selected images and embed real
  <img src alt> tags + a nearby product link <a href="/products/{handle}">, with placeholder fallback only when
  nothing matches.
- /api/articles/generate (workspace-scoped) calls the matcher, generates, returns body with real CDN images,
  keeps the SEO scorer.
MIGRATION: articles(id uuid pk, workspace_id fk, title text, body_html text, tags text, seo_title text,
  seo_description text, seo_score int, ai_model text, word_count int, status text default 'draft',
  shopify_article_id text, shopify_blog_id text, created_by fk users, created_at, published_at).
ROUTES: save generated drafts; GET /api/articles (library, paginated, workspace-scoped); GET/:id; DELETE/:id.
FRONTEND: Generate page shows which product images were auto-inserted; new Article Library page lists drafts +
published with status badges, view, and re-publish.
ACCEPTANCE: matching-topic articles embed real product images + links; all generated articles appear in the
workspace's library and never in another workspace's.
```

### PHASE 5 — Auto-publish: instant + scheduled queue (worker)

```
PHASE 5. Both publish modes with a real background worker. Build on Phases 1–4.
INFRA: add BullMQ + Redis (REDIS_URL). Provide a config switch USE_REDIS=false that falls back to node-cron
(every minute) so it runs without Redis in dev.
MIGRATION: scheduled_posts(id uuid pk, workspace_id fk, store_id fk, blog_id text, topic text, word_count int,
  ai_model text, run_at timestamptz, status text default 'pending', article_id fk articles, error text,
  created_by fk users, created_at).  -- status: pending|processing|published|failed|canceled
INSTANT: POST /api/articles/generate-and-publish -> generate (with images) + publish to the workspace's chosen
blog in one call.
QUEUE: POST/GET/DELETE /api/scheduled-posts (workspace-scoped). A worker (backend/src/workers/publisher.js)
picks due pending jobs (status guard / row lock to avoid double-processing), loads that workspace's creds+DNA,
generates the image-aware article, publishes, updates status + article_id, and emits a notification + email
(stub until Phase 9). Leave a clearly marked hook to enforce quota (added in Phase 7). Start the worker
separately (add to PM2 ecosystem + an npm script).
FRONTEND: "Generate & Publish now" button; Scheduled Posts page (queue a topic with date/time, table with
status badges, cancel pending).
ACCEPTANCE: one click publishes live; queued topics publish at their times; statuses move pending→published or
failed with a readable error; no job double-publishes.
```

### PHASE 6 — Billing & subscriptions (Razorpay + Stripe)

```
PHASE 6. Add real subscription billing, provider-agnostic, with a 7-day trial. Build on Phases 1–5.
MIGRATIONS:
- plans(id text pk, name text, price_inr int, price_usd int, interval text default 'month',
    monthly_article_limit int, store_limit int, seat_limit int, scheduling boolean, premium_models boolean,
    features jsonb default '{}', is_active boolean default true)
- subscriptions(workspace_id uuid pk fk, plan_id text fk plans, provider text, provider_subscription_id text,
    status text, -- trialing|active|past_due|canceled|incomplete
    trial_ends_at timestamptz, current_period_start date, current_period_end date, cancel_at_period_end
    boolean default false, created_at, updated_at)
- invoices(id uuid pk, workspace_id fk, provider text, provider_invoice_id text, amount int, currency text,
    status text, hosted_url text, pdf_url text, period_start date, period_end date, created_at)
- coupons(id text pk, percent_off int, amount_off int, currency text, max_redemptions int, redeemed int,
    expires_at)  -- redemption tracking optional
SEED plans: Free trial / Starter / Growth / Agency per the pricing table in SAAS_UPGRADE_PROMPT.md.
BILLING ABSTRACTION: backend/src/services/billing/index.js exposes a BillingProvider interface
(createCheckout, create/cancelSubscription, syncFromWebhook, createBillingPortalSession). Implement
razorpay.js (INR, default for India) and stripe.js (intl). Pick provider by workspace currency/country or an
explicit choice at checkout.
ROUTES (owner-only for mutations):
- GET  /api/billing/plans                public plans list
- GET  /api/billing/subscription         current workspace subscription + entitlements
- POST /api/billing/checkout             start checkout/upgrade (returns provider session/order)
- POST /api/billing/change-plan          upgrade/downgrade with proration
- POST /api/billing/cancel               cancel at period end
- GET  /api/billing/invoices             list invoices
- POST /api/billing/portal               provider billing portal link
- POST /api/webhooks/razorpay  & /api/webhooks/stripe  -> VERIFY SIGNATURE, then sync subscription/invoice
  state into our tables. These endpoints are public but signature-guarded and idempotent. Mount them with the
  RAW body parser (not express.json) so signatures verify.
On signup, auto-create a 'trialing' subscription on Free trial with trial_ends_at = now()+7d.
FRONTEND: Pricing/Plans page, a Billing page (current plan, renew date, change plan, cancel, invoice list,
"manage billing" portal button), and an upgrade modal.
ACCEPTANCE: a new workspace starts on a 7-day trial; I can subscribe via Razorpay test mode (and Stripe test
mode), upgrade/downgrade, cancel-at-period-end, and webhooks correctly flip status and add invoices.
Entitlements are always read from the stored subscription, never the client.
```

### PHASE 7 — Usage metering & quota enforcement

```
PHASE 7. Meter usage and enforce the active plan's limits. Build on Phase 6.
MIGRATION: usage_counters(workspace_id fk, period text /* 'YYYY-MM' aligned to billing period */,
  articles_generated int default 0, primary key(workspace_id, period)).
SERVICE backend/src/services/entitlements.js:
- getEntitlements(workspaceId) -> merges subscription.plan limits (article/store/seat caps, scheduling,
  premium_models) into one object.
- assertWithinArticleQuota(workspaceId) -> throws { code:'QUOTA_REACHED', limit, used } when at cap.
- incrementArticleUsage(workspaceId) on successful generation only.
- assertCanAddStore / assertCanAddSeat using store_limit / seat_limit.
- assertFeature(workspaceId,'scheduling'|'premium_models').
ENFORCE: call the asserts in /api/articles/generate, generate-and-publish, the Phase 5 worker hook (mark job
'failed' with quota message instead of over-publishing), store-connect (store limit), member-invite (seat
limit), schedule creation + premium model selection (feature gates). Warn at 80% via notification/email.
FRONTEND: usage widget (used/limit + progress bar) on dashboard + generate page; disable actions at 100% with
upgrade CTA; show locked features with an "Upgrade to unlock" badge.
ACCEPTANCE: limits enforced everywhere (UI + API + worker); counters reset each billing period; upgrading a
plan immediately raises limits.
```

### PHASE 8 — Superadmin console

```
PHASE 8. Build the vendor (platform) admin area. Gate everything on users.is_superadmin (NOT a workspace
role); add a separate /admin route namespace and a separate frontend section.
ROUTES (all require superadmin):
- GET  /api/admin/metrics            KPIs: total users, workspaces, trials, active subs, MRR (sum of active
                                     plan prices), trial→paid conversion, churn (canceled/period), signups
                                     over time.
- GET  /api/admin/workspaces         search/paginate; show plan, status, usage, owner, created.
- GET  /api/admin/workspaces/:id     detail: members, stores, subscription, invoices, recent activity.
- POST /api/admin/workspaces/:id/plan        manually set/override plan (grant comp/credit).
- POST /api/admin/workspaces/:id/suspend     suspend/reactivate (suspended workspaces are blocked from the app
                                             with a message).
- GET  /api/admin/users              search users.
- POST /api/admin/impersonate/:userId  issue a scoped, time-limited impersonation token; WRITE an audit_log
                                       entry; show a persistent "viewing as" banner; provide stop-impersonation.
- GET/POST /api/admin/coupons        manage coupons.
- GET/POST /api/admin/feature-flags  toggle flags (e.g., enable a beta feature per workspace or globally).
MIGRATIONS: feature_flags(key text pk, description text, enabled_global boolean default false),
  feature_flag_overrides(workspace_id fk, key text, enabled boolean, primary key(workspace_id,key)).
FRONTEND: an /admin SPA section (only rendered for superadmins) with Dashboard (KPIs + charts), Workspaces
table + detail, Users, Coupons, Feature Flags, and the impersonation banner.
ACCEPTANCE: as superadmin I can see platform KPIs, open any workspace, change its plan, suspend it (and that
workspace is then locked out), impersonate a user (audit-logged with a visible banner) and stop; normal users
get 403 on every /api/admin route.
```

### PHASE 9 — Transactional email + in-app notifications

```
PHASE 9. Replace all email stubs with a real pluggable mailer and add in-app notifications.
MAILER: backend/src/services/mailer.js with a provider interface; implement Resend (or SendGrid) + an SMTP
fallback, chosen by MAIL_PROVIDER. HTML templates (backend/src/emails/) for: verify email, password reset,
teammate invite, trial-ending (T-2 days), payment receipt, payment failed/dunning, quota 80% warning,
scheduled-post published, scheduled-post failed, welcome. Send via the job queue so requests never block.
NOTIFICATIONS: notifications(id uuid pk, workspace_id fk, user_id fk nullable, type text, title text, body
text, read_at timestamptz, created_at). Emit on the same events. GET /api/notifications, POST
/api/notifications/:id/read, POST /api/notifications/read-all.
FRONTEND: a bell menu with unread count + dropdown; wire all the earlier stubbed sends to the real mailer.
ACCEPTANCE: verification/reset/invite/receipt/quota/job emails actually send in a test inbox; in-app bell shows
events and clears on read; email sending is queued and retried on failure.
```

### PHASE 10 — Analytics, audit logs, GDPR, onboarding wizard

```
PHASE 10. Final polish for a sellable product. Build on all prior phases.
AUDIT LOGS: audit_logs(id uuid pk, workspace_id fk nullable, actor_user_id fk, action text, target text,
  metadata jsonb, ip text, created_at). Write entries on: login, role change, store connect/disconnect, plan
  change, member add/remove, impersonation start/stop, data export, account deletion.
CUSTOMER ANALYTICS: GET /api/analytics/overview (workspace-scoped): articles generated & published over time,
  avg SEO score trend, scheduled vs published counts, top topics. Render on the Dashboard with charts
  (recharts).
GDPR / DATA RIGHTS: POST /api/account/export (queue a job that compiles the workspace's data to JSON and emails
  a download link) and POST /api/account/delete (owner-only; soft-delete + purge job; cancel subscription;
  confirm by typing the workspace name). Add ToS + Privacy pages and require acceptance at signup.
ONBOARDING WIZARD: a guided first-run flow (create workspace → connect Shopify → fetch DNA → generate sample →
  publish), with a progress checklist on the dashboard until complete; store onboarding_state on the workspace.
HEALTH/OPS: keep /api/health; add structured request logging (pino + request id) and a Sentry-ready error hook
  (no-op if DSN unset). Update PM2 ecosystem (web + worker processes), nginx, GitHub Actions, and the README.
ACCEPTANCE: dashboard charts populate from real data; sensitive actions appear in audit_logs; a user can export
and delete their data; new signups are walked through onboarding; the app deploys cleanly with web + worker.
```

---

## How to run this safely

1. Provision **PostgreSQL** and **Redis** first; fill every new env var (use test-mode keys for Razorpay/Stripe). Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Do phases **in order** — later phases (quotas, superadmin metrics, emails) depend on earlier tables (subscriptions, workspaces). After each phase, run its acceptance checks before continuing.
3. Use **provider test modes** for billing until the full flow (checkout → webhook → entitlement) works end to end; only then switch to live keys.
4. Keep `.env` out of git (it already is) and rotate any keys that were ever committed.
5. Before public launch, get a basic **ToS, Privacy Policy, and refund policy** in place (Phase 10 adds the pages; the legal text is on you or a lawyer), and turn on backups for Postgres.

If you want, I can next generate a **Phase 6/8 deep-dive prompt** (exact Razorpay + Stripe webhook event handling and the superadmin metrics SQL), or a **one-page pitch / pricing landing copy** to sell it.

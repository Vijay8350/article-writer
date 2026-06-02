# Landing Page + Auth Pages — Build Prompt

Paste this into your coding AI from the project root. It builds the public marketing landing page
for the "Shopify Article Writer" SaaS, plus the Sign-up and Login pages, wired to the backend auth.

> Context for the AI: this is the existing monorepo — `backend/` is Node + Express (ES modules, port
> 5001) and `frontend/` is React 18 + Vite + React Router with pages in `frontend/src/pages/` and the
> API client in `frontend/src/lib/api.js`. Auth endpoints `POST /api/auth/register` and
> `POST /api/auth/login` exist (or are being built in the SaaS upgrade Phase 1). The landing page is
> the public entry point; logged-out visitors see it at `/`.

---

## ⭐ THE PROMPT

```
Build a public marketing LANDING PAGE plus SIGN-UP and LOGIN pages for my "Shopify Article Writer"
SaaS, inside the existing React 18 + Vite + React Router frontend. Match the existing project
structure (pages in frontend/src/pages/, components in frontend/src/components/, API in
frontend/src/lib/api.js). Use only the libraries already installed (React, react-router-dom,
axios, lucide-react for icons, react-hot-toast for toasts) plus plain CSS or the existing styling
approach — do not add a UI framework unless one is already present.

PRODUCT THIS PAGE SELLS
"AI blog writer for Shopify stores." A merchant connects their Shopify store; the tool studies their
catalog ("Business DNA"), then writes SEO-optimized blog articles that automatically include the
store's real product images, and publishes them to the Shopify blog — instantly, or on an automatic
schedule.

ROUTING
- Public routes (visible when logged OUT): "/" (landing), "/login", "/signup". Also support anchor
  scrolling to sections: "/#features", "/#pricing", "/#how-it-works", "/#faq".
- If a logged-IN user visits "/", "/login", or "/signup", redirect them to the app dashboard.
- After successful signup or login, redirect to the app dashboard ("/app" or the existing dashboard
  route — detect and reuse it).
- Update App.jsx so the landing + auth pages are separate from the authenticated app shell (they must
  NOT render inside the logged-in Layout/sidebar).

================= LANDING PAGE (frontend/src/pages/Landing.jsx) =================
A modern, conversion-focused, fully responsive single page with these sections in order:

1) NAVBAR (sticky, transparent → solid on scroll)
   - Left: product logo/name "Article Writer".
   - Center: anchor links Features, How it works, Pricing, FAQ.
   - Right: a "Log in" button (ghost/outline, routes to /login) and a "Sign up free" button (primary,
     routes to /signup). On mobile collapse into a hamburger menu.

2) HERO
   - Big headline (e.g., "AI blog articles for your Shopify store — written, illustrated, and
     published on autopilot.") + supporting subheadline.
   - Primary CTA "Start free — 5 articles" -> /signup. Secondary CTA "See how it works" -> /#how-it-works.
   - A simple visual/mockup placeholder (a styled card or screenshot frame) on the side.
   - A trust line ("Connects directly to your Shopify store. No credit card to start.").

3) FEATURES (grid of cards, lucide icons). Include ALL of these, each with a short benefit blurb:
   - Business DNA — auto-analyzes your products, collections, tags & niche.
   - SEO-optimized writing — titles, meta, headings, internal links; built-in SEO score.
   - Auto product images — embeds your real Shopify product photos into each article.
   - Instant publish — generate and push to your Shopify blog in one click.
   - Scheduled auto-publish — queue topics and let it post automatically.
   - Multiple AI models — choose between fast and premium writing engines.
   - Multi-store / team — connect multiple stores and invite teammates (higher plans).
   - Article library — keep, edit, and re-publish everything in one place.

4) HOW IT WORKS (3–4 numbered steps)
   Connect your Shopify store → Fetch your Business DNA → Enter a topic (or schedule a queue) →
   Generate & publish SEO articles with your product images.

5) PRICING (responsive cards, highlight "Growth" as Most Popular). Render these tiers from a local
   data array (so it's easy to edit). Each card: name, price, "/month", a short tagline, a feature
   list with check icons, and a CTA button -> /signup?plan=<id>. Add a monthly/annual toggle where
   annual shows "2 months free".
     - Free trial — ₹0 (7 days) — 5 articles/mo, 1 store, 1 seat, no scheduling.   CTA "Start free".
     - Starter — ₹799/mo — 30 articles/mo, 1 store, 1 seat, scheduling, 2 AI models.
     - Growth (Most Popular) — ₹1,999/mo — 100 articles/mo, 3 stores, 3 seats, all + premium models.
     - Agency — ₹4,999/mo — 400 articles/mo, 10 stores, 10 seats, premium, priority support.

6) FAQ (accordion): Do I need coding? / Does it post to my real Shopify blog? / Are the images mine?
   / Can I cancel anytime? / Which AI models are used? — write sensible answers.

7) FINAL CTA band ("Start publishing SEO content this week") with a Sign-up button.

8) FOOTER: product name, nav links, Terms & Privacy links (route to /terms and /privacy — create simple
   placeholder pages), and a copyright line.

Design: clean SaaS aesthetic, generous spacing, a primary accent color (define CSS variables so it's
easy to rebrand), rounded cards with subtle shadows, smooth scroll on anchor links, hover states,
and FULLY responsive down to ~360px. Add light scroll-in animation if trivial (CSS only). No external
image/CDN dependencies — use CSS gradients/shapes and lucide icons for visuals.

================= SIGN-UP PAGE (frontend/src/pages/Signup.jsx) =================
- A centered card with: Name, Email, Password (with show/hide), Confirm Password, and a "I agree to
  the Terms & Privacy" checkbox. Read an optional ?plan= query param and show the chosen plan as a
  small badge ("You're signing up for: Growth").
- Client-side validation (valid email, password >= 8 chars, passwords match, terms checked) with
  inline error messages.
- On submit, POST to /api/auth/register with { name, email, password, plan }. This CREATES A NEW USER
  ACCOUNT (a user request). On success: store the returned auth token via the existing auth flow and
  redirect to the dashboard; show a success toast. If the backend returns "verify your email", show a
  "Check your inbox to verify" confirmation state instead of redirecting.
- Handle errors (email already exists, weak password, server error) with toasts/inline messages and a
  disabled+spinner state on the button while submitting.
- A "Already have an account? Log in" link -> /login. Optionally a "Continue with Google" button if
  Google OAuth exists; otherwise omit it.

================= LOGIN PAGE (frontend/src/pages/Login.jsx) =================
- A centered card with: Email, Password (show/hide), "Remember me", and a "Forgot password?" link
  (-> /forgot-password if it exists, else a toast "coming soon").
- On submit, POST to /api/auth/login. On success store the token via the existing auth flow and
  redirect to the dashboard. On failure (401 invalid credentials) show a clear inline error.
- Loading/disabled state on the button. A "New here? Sign up free" link -> /signup.

================= WIRING / SHARED =================
- Use the existing AuthContext / token handling if present; if not, create a minimal one that stores
  the token and exposes login/logout/user, and have api.js attach Authorization: Bearer <token>.
- Reuse one shared <AuthCard> layout component for Login and Signup to keep them consistent (logo on
  top, card in center, link at bottom, marketing tagline on a side panel for desktop).
- Add the routes in App.jsx and the logged-in/logged-out redirect logic described above.
- Keep everything accessible: labels tied to inputs, focus states, button aria-labels, keyboard-
  operable accordion and mobile menu.

DELIVERABLES: Landing.jsx, Signup.jsx, Login.jsx, a shared AuthCard component, Terms.jsx + Privacy.jsx
placeholders, any CSS, and the updated App.jsx routing. Show me the file list first, then implement.
Don't break the existing authenticated app.
```

---

### Notes you can tweak before pasting

- **"Sign up creates a user request"** is implemented as a real `POST /api/auth/register` (creates the account). If you'd rather it be a *waitlist / access request* (no instant account, you approve manually), change the Sign-up section to: *"POST to `/api/access-requests` storing { name, email, plan, status:'pending' } and show a 'Thanks, we'll email you when approved' confirmation"* — and add that table/route on the backend.
- The **prices and plan limits** mirror your `SAAS_UPGRADE_PROMPT.md` pricing table. Edit the array in the prompt if they change.
- If you haven't built **Phase 1 auth** yet, build that first (it provides `/api/auth/register` and `/api/auth/login`) — otherwise the Sign-up/Login forms will have nothing to call.
- Want a matching **public Pricing page** as its own route (not just the landing section) for ad links? Say so and I'll add a prompt for `/pricing`.

# Technical SEO + Logo — Build Prompts

Two ready-to-paste prompts for your Article Writer SaaS site:
1. **Technical SEO upgrade** — make the landing/marketing pages crawlable, fast, and AI-search ready.
2. **Powerful logo** — a design brief + an image-generation-ready prompt.

> Why this matters for your stack: your frontend is a **React + Vite SPA**, which is the single
> biggest SEO risk you have. Google renders JS in a delayed "second wave" (content can take days to
> index or never index), and **most AI crawlers — OpenAI's OAI-SearchBot, PerplexityBot, etc. — do
> not run JavaScript at all**, so a client-rendered marketing page is effectively invisible to AI
> search. The fix is server-rendered or static HTML for public pages. The prompt below handles that.

---

## ⭐ PROMPT 1 — Technical SEO upgrade (paste into your coding AI)

```
Improve the technical SEO of my "Article Writer" SaaS site. The frontend is React 18 + Vite + React
Router (an SPA); the public marketing pages are Landing, Pricing, Login, Signup, Terms, Privacy, and
(later) a blog. The app dashboard behind login should stay noindex. Implement the following and show
me the file list + any new deps first.

PRIORITY 0 — RENDERING (the SPA crawlability problem)
Public marketing pages MUST be served as real HTML to crawlers, because Google's JS rendering is
delayed and most AI crawlers don't execute JS at all. Pick ONE approach and justify it:
  (A) PREFERRED: pre-render/statically generate the public marketing routes at build time
      (e.g., add `vite-plugin-ssr`/`vite-react-ssg`, or a prerender step like `@prerenderer` /
      `react-snap`) so "/", "/pricing", "/login", "/signup", "/terms", "/privacy" ship as static HTML
      with full content, while the logged-in app stays a normal SPA.
  (B) If a framework migration is acceptable, move ONLY the marketing + blog pages to Next.js (App
      Router, SSG/ISR) and keep the dashboard as the existing SPA.
Whatever you choose, verify each public route returns meaningful HTML with `curl` (no JS executed).
Authenticated/app routes must NOT be prerendered and must send `<meta name="robots" content="noindex">`.

PER-PAGE METADATA
- Add `react-helmet-async` (or framework head API). Every public page sets a UNIQUE <title>
  (~50–60 chars) and <meta name="description"> (~150–160 chars). No two pages share metadata.
- Add a single source-of-truth SEO component <Seo title description canonical image noindex /> reused
  on every page.
- Canonical tags: self-referencing <link rel="canonical"> on every public page (absolute URL from
  APP_URL). Redirect non-canonical hosts (www vs non-www, http→https) at the server/nginx level.

OPEN GRAPH + TWITTER + SOCIAL
- Add Open Graph (og:title, og:description, og:type, og:url, og:image, og:site_name) and Twitter Card
  (summary_large_image) tags on every public page. Provide a 1200x630 default share image (generate a
  branded PNG placeholder if none exists) and per-page overrides where useful.

STRUCTURED DATA (JSON-LD — Google's preferred format)
Inject valid JSON-LD <script type="application/ld+json"> blocks. CRITICAL: the structured data must
match the visible content (avoid "schema drift" or Google distrusts all of it).
  - Organization (logo, name, url, sameAs social links) — site-wide.
  - WebSite + SearchAction (sitelinks search box) — site-wide.
  - SoftwareApplication / Product on the landing + pricing page, with `offers` (the plan prices in INR,
    priceCurrency "INR") and aggregateRating ONLY if you actually have real reviews — otherwise omit.
  - FAQPage on the landing FAQ section (mirror the exact visible Q&As).
  - BreadcrumbList where there's a hierarchy.
  - Article/BlogPosting schema for blog posts (when the blog exists).
Validate everything against Google's Rich Results test format (well-formed, required fields present).

CRAWLING & INDEXING
- Generate /robots.txt: allow public pages, DISALLOW the app/dashboard and any /api paths, and
  reference the sitemap URL. Don't block CSS/JS needed for rendering.
- Generate /sitemap.xml at build (and a build script to regenerate) listing all public URLs with
  lastmod; auto-include blog posts when present. Submit-ready for Google Search Console.
- Ensure clean, lowercase, hyphenated, canonical URLs; 301-redirect trailing-slash and duplicate
  variants consistently.
- Add a 404 page that returns a real 404 status (not 200) for unknown routes.

CORE WEB VITALS (2026 thresholds: INP < 200ms, LCP < 2.5s, CLS < 0.1)
- LCP: preload the hero font + hero image; inline critical CSS; lazy-load below-the-fold images
  (loading="lazy"), set explicit width/height on ALL images to prevent layout shift (CLS).
- INP: code-split routes (React.lazy/dynamic import), defer non-critical JS, avoid long main-thread
  tasks, debounce expensive handlers.
- Use modern image formats (WebP/AVIF) and responsive `srcset`; compress assets; enable gzip/brotli
  + long-cache headers for static assets in nginx.
- Add `<link rel="preconnect">`/`dns-prefetch` for required third-party origins; remove unused JS/CSS.
- Add font-display: swap to web fonts.

SEMANTIC HTML & ACCESSIBILITY (helps SEO + AI parsing)
- Exactly one <h1> per page; logical h2/h3 outline; use <header><nav><main><section><footer>; real
  <a href> for navigation (not onClick divs); descriptive alt text on every meaningful image; labels
  on all form fields. Use "BLUF" (bottom-line-up-front) copy in section intros so AI answer engines
  can extract and cite it.

TECH HOUSEKEEPING
- Add <html lang="en">, a meta viewport, theme-color, and favicons/manifest (PWA-lite: favicon set +
  webmanifest + apple-touch-icon).
- Add `APP_URL` env var used to build absolute canonical/OG/sitemap URLs.
- nginx: force HTTPS, www→non-www (or chosen canonical), HSTS, brotli/gzip, cache headers, and serve
  the prerendered HTML for public routes.

DELIVERABLES: the rendering setup, a reusable <Seo> component, JSON-LD components, robots.txt +
sitemap.xml generation, image/CWV optimizations, nginx config updates, and a short SEO_README.md
explaining how to add metadata to a new page and regenerate the sitemap. Confirm each public route
serves full HTML via curl and passes a Lighthouse SEO + performance check.
```

---

## ⭐ PROMPT 2 — Powerful logo

You can use this two ways: as a **brief for a designer**, or as an **image-generation prompt** (paste
the "Generation prompt" block into an AI image tool). Pick the concept you like, or generate a few.

### Design brief

```
Brand: "Article Writer" — an AI tool that writes and auto-publishes SEO blog articles for Shopify
stores, automatically including the store's real product images.
Personality: modern, trustworthy, intelligent, fast. SaaS / tech, not playful-cartoon.
Must work: as a tiny 32px favicon AND a large hero logo; in full color, solid black, and white-only
(reversed); as an app icon (square) and a horizontal lockup (icon + wordmark).
Color direction: a confident primary (deep indigo/violet #6D28D9 or electric blue) with optional
gradient to teal/cyan; clean neutral text. Provide a single-color version too.
Typography: a geometric, slightly rounded sans-serif wordmark (Inter / Plus Jakarta / Poppins vibe),
medium-to-bold weight, tight tracking.
Concept options (combine an AI cue + a writing/commerce cue):
  1. A stylized pen-nib / quill tip that doubles as an upward arrow (growth) or a spark/AI star.
  2. A speech-bubble or document "card" with a small AI sparkle and a subtle shopping-bag silhouette.
  3. A monogram "A" built from a pen stroke, with a glowing node/dot (AI) at the apex.
Deliverables: icon mark, horizontal lockup, stacked lockup, monochrome + reversed versions, favicon
set, and the hex codes + font used.
Avoid: clip-art robots, generic gears, overused "brain + circuit," heavy gradients that fail at 32px,
and anything resembling the actual Shopify trademark/logo.
```

### Generation prompt (paste into an AI image generator)

```
Minimalist vector logo icon for an AI SaaS brand called "Article Writer", a tool that writes SEO blog
articles for online stores. A clean geometric pen-nib that subtly forms an upward arrow, with a small
four-point AI sparkle at the tip. Flat design, bold simple shapes, deep indigo-to-cyan gradient
(#6D28D9 to #06B6D4) on a transparent/white background, crisp edges, high contrast, balanced
negative space, scalable, looks sharp at 32px favicon size. Professional modern tech branding, app
icon style, centered, no text, no photorealism, no 3D, no drop shadows. Vector, SVG-style.
```

```
Variation 2 — monogram: A bold geometric letter "A" constructed from a single smooth pen stroke,
with a glowing dot/node at the top point representing AI. Rounded modern sans-serif feel, electric
violet #6D28D9 flat color on white, minimal, high-contrast, favicon-safe, app-icon style, centered,
no extra text, vector look.
```

After you generate a mark you like, ask your coding AI to **add it to the site**:
*"Add this logo SVG/PNG as the favicon set (16/32/180px + webmanifest + apple-touch-icon), the navbar
logo, and the Organization JSON-LD `logo` field; provide a white reversed version for dark sections."*

---

### Quick reality check on your current setup

The most impactful single change is **Prompt 1's Priority 0** — getting public pages out of
client-only rendering. Everything else (meta tags, JSON-LD, sitemap) only pays off once crawlers and
AI engines can actually read the HTML. Do the rendering fix first, then layer the rest.

Sources for the 2026 best practices used above:
- [DebugBear — Technical SEO Checklist 2026](https://www.debugbear.com/blog/technical-seo-checklist)
- [Yotpo — Full Technical SEO Checklist 2026](https://www.yotpo.com/blog/full-technical-seo-checklist/)
- [LinkGraph — React SEO: SSR, Performance & Rankings (2026)](https://www.linkgraph.com/blog/seo-for-react-applications/)
- [FuelOnline — JavaScript SEO: Making SPAs Crawlable (2026)](https://fuelonline.com/seo/javascript-seo-guide-2026/)
- [Collaborator — JavaScript SEO: Optimize SPA Sites for SEO and AI](https://collaborator.pro/blog/javascript-seo-optimize-spa-sites)

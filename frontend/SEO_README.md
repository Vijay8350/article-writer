# SEO — how it's wired

## TL;DR

- Every page renders a `<Seo>` component (`frontend/src/components/Seo.jsx`) that sets title,
  description, canonical, robots, Open Graph, Twitter, and any page-level JSON-LD.
- Default `index.html` ships with `<meta name="robots" content="noindex, nofollow">`. Public
  pages overwrite it via `<Seo noindex={false}>` (the default).
- App routes inherit the default `noindex` automatically. Don't include `<Seo>` on them
  (or pass `noindex`).

## Adding metadata to a new page

```jsx
import Seo from '../components/Seo';

export default function Pricing() {
  return (
    <>
      <Seo
        title="Pricing"                    // becomes "Pricing — Article Writer"
        description="Plans from ₹0 to ₹4,999/mo. Pick the article quota and seats you need."
        path="/pricing"                    // → canonical https://tools.apanjob.com/pricing
        // image="https://.../share.png"   // optional, falls back to /favicon.svg
        // jsonLd={ { ... } }              // optional structured data
      />
      {/* page body */}
    </>
  );
}
```

## Page-level JSON-LD

Pass an object or an array of objects via the `jsonLd` prop. Each object is emitted as a
separate `<script type="application/ld+json">` block. Examples:

- `SoftwareApplication` + `offers` — on the landing page (already wired).
- `FAQPage` — must mirror the visible Q&A copy on the page (no schema drift).
- `BlogPosting` — wrap each blog post when the blog ships.

Site-wide `Organization` and `WebSite` are emitted from `index.html`, so don't repeat them
per page.

## Sitemap + robots

- `public/robots.txt` — allow-lists public marketing routes and disallows the authenticated
  app + `/api/`. Update when you add a public route.
- `public/sitemap.xml` — static list of public URLs with `lastmod`. Bump entries when content
  changes; future automation should regenerate this at build time when the blog exists.

## Logo / favicons

- `public/favicon.svg` — the single source of truth. Rendered as favicon, apple-touch-icon,
  manifest icon, and the inline nav logo.
- `public/logo.svg` — horizontal lockup (icon + wordmark) for share images / docs.
- `public/manifest.webmanifest` — PWA-lite metadata (theme color, icons).

If a designer ships a richer logo (PNG share image, dark/light variants), drop them under
`public/` and update `index.html` OG defaults + the per-page `image` prop on `<Seo>`.

## What's parked

**Full prerendering/SSG of the public pages is not yet wired.** Without it, AI crawlers that
don't execute JS (OAI-SearchBot, PerplexityBot, etc.) won't read this metadata — only Google
will, after its delayed JS render pass. The recommended next step is to add a build-time
prerender (e.g. `@prerenderer/rollup-plugin`) that produces real HTML for `/`, `/pricing`,
`/login`, `/signup`, `/terms`, `/privacy`. The `<Seo>` setup here is designed to slot into
that prerender step unchanged.

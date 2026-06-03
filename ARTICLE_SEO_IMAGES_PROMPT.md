# SEO-Friendly Articles + Main Image — Build Prompt

Paste this into your coding AI from the project root. It upgrades the article *generation* so every
article is SEO-optimized, properly structured, and ships with a **featured/main image** plus
well-placed inline images (using your store's real Shopify product images).

> Context for the AI: backend is Node + Express (ES modules). Generation lives in
> `backend/src/routes/articles.js` (the `/generate` route + `calculateSeoScore`), with prompt building
> + parsing in `backend/src/services/gemini.js` and `backend/src/services/deepseek.js`. Publishing is
> `shopify.js createArticle(blogId, {... image, seoTitle, seoDescription ...})` — the Shopify Article
> API supports a featured `image` field and `metafields_global_title_tag` /
> `metafields_global_description_tag` for SEO meta. Business DNA already contains `products[]` with
> `{ title, handle, image, productType, tags }`.

---

## ⭐ THE PROMPT

```
Upgrade my article generation so every generated article is SEO-friendly, cleanly organized, and has
a proper MAIN (featured) image plus well-placed inline images using the store's real Shopify product
images. Modify the generation prompt, the response schema, the publish payload, and the SEO scorer.
Show me the changed files + the new article JSON shape first, then implement.

============ 1) STRUCTURED, SEO-FRIENDLY ARTICLE OUTPUT ============
Rewrite the article-generation prompt (in gemini.js and deepseek.js buildArticlePrompt) so the model
ALWAYS returns this structure in the bodyHtml, in this order:
  - An H1 is NOT in the body (Shopify renders the title as H1) — body starts with a 2–3 sentence
    intro that states the value up front (BLUF) and naturally includes the primary keyword.
  - A short "In this article" table of contents with anchor links to the H2 sections (only for
    articles ≥ ~1200 words).
  - 4–7 logical <h2> sections, each 150–300 words, with <h3> sub-points where useful. Use the primary
    keyword in the first H2 and secondary/related keywords across others — naturally, no stuffing.
  - At least one bulleted or numbered list and, where relevant, one comparison <table>.
  - A "Frequently Asked Questions" section with 3–5 <h3> question/answer pairs (mirrors FAQ schema).
  - A short conclusion + a clear call-to-action linking to a relevant collection or product.
Keyword handling: accept an optional `primaryKeyword` (default = topic) and `secondaryKeywords[]`.
Enforce a sensible keyword density (~0.5–1.5%), keyword in intro, one H2, and the conclusion. Keep
sentences and paragraphs short and scannable. Output clean semantic HTML only (no <html>/<body>
wrapper, no markdown).

============ 2) MAIN / FEATURED IMAGE (the key ask) ============
Every article must have a single FEATURED image, separate from inline images:
  - Add backend/src/services/imageMatcher.js (or extend it): pickFeaturedImage(topic, products)
    returns the single most relevant product image as { src, alt, productHandle, productTitle }.
    Ranking: keyword/tag/title overlap with the topic; must have an image; prefer the product the
    article is most about.
  - Selection order for the featured image:
      a) best-matching Shopify PRODUCT image (preferred — it's the store's real photo),
      b) else the store's logo/brand image from Business DNA,
      c) else leave it null and flag it (do NOT invent a URL).
  - Return it in the generated article JSON as `featuredImage: { src, alt }` with descriptive,
    keyword-aware alt text (e.g., "<Product> — <topic> guide").
  - The featured image must NOT be duplicated as the first inline image in the body.

============ 3) ORGANIZED INLINE IMAGES ============
  - Extend the matcher: selectRelevantImages(topic, products, {max:3-4}) for the BODY, EXCLUDING the
    one used as featured.
  - Update the generation prompt so the model places these inline images at natural breaks (after a
    relevant H2, never two in a row, not in the intro), each as:
        <figure>
          <img src="{shopifyCdnUrl}" alt="{descriptive, keyword-aware alt}" loading="lazy"
               width="..." height="...">
          <figcaption>{1-line caption}</figcaption>
        </figure>
    and add a contextual product link <a href="/products/{handle}"> near each image.
  - Use REAL Shopify CDN URLs from Business DNA — never placeholders unless no product matches (then
    fall back to the existing image-placeholder behavior, clearly marked).
  - Always set alt text (never empty), explicit width/height (prevents layout shift / CLS), and
    loading="lazy" on inline images.

============ 4) SEO METADATA + SCHEMA ============
In the generated article JSON ensure these are produced and validated:
  - title: 50–60 chars, primary keyword near the front.
  - seoTitle (meta title): 50–60 chars.
  - seoDescription (meta description): 150–160 chars, compelling, includes primary keyword.
  - handle (slug): lowercase, hyphenated, keyword-based, < 60 chars, no stop-word clutter.
  - tags: 5–8 relevant tags.
  - summary: 1–2 sentence excerpt.
  - Generate JSON-LD for the article: BlogPosting/Article schema (headline, image=featuredImage.src,
    datePublished, author, publisher with logo) AND FAQPage schema built from the FAQ section. Return
    these as a `jsonLd` array of objects (the frontend/publish step will inject them).
Update parseArticleResponse in BOTH gemini.js and deepseek.js to read the new fields
(featuredImage, jsonLd, primaryKeyword) and be resilient if a field is missing.

============ 5) PUBLISH TO SHOPIFY WITH THE MAIN IMAGE ============
In articles.js publish path and shopify.js createArticle/updateArticle:
  - Set the Shopify article featured image from featuredImage:
      image: { src: featuredImage.src, alt: featuredImage.alt }
  - Set SEO meta via metafields:
      metafields_global_title_tag = seoTitle,
      metafields_global_description_tag = seoDescription
  - Keep tags, summary_html (summary), handle, author, body_html.
  - If featuredImage is null, publish without an image but include a warning in the API response so
    the UI can prompt the user to add one.

============ 6) UPGRADE THE SEO SCORE CHECKS ============
Extend calculateSeoScore (articles.js) with additional checks (rebalance to /100):
  - Featured image present (+ alt text non-empty).
  - Every <img> has non-empty alt text.
  - Primary keyword appears in title, first 100 words, one H2, and meta description.
  - Slug length/format ok and contains the keyword.
  - FAQ section present (for schema eligibility).
  - Reading structure: TOC for long posts, list/table present, sane paragraph length.
Each failed check returns an actionable tip (as the current scorer already does).

============ 7) FRONTEND ============
On the Generate Article page:
  - Show the auto-selected FEATURED image prominently (thumbnail + product name) with a note that
    it'll be set as the Shopify article image.
  - Show the inline images that were inserted (thumbnails).
  - Show the upgraded SEO score breakdown.
(Manual swapping is out of scope here unless already supported — auto-pick is fine.)

ACCEPTANCE
- A generated article has: a featured image (real Shopify product photo) returned separately, a clean
  intro→TOC→H2/H3→list/table→FAQ→conclusion+CTA structure, 2–4 inline <figure> images with alt text +
  captions + product links, valid meta title/description/slug, and BlogPosting+FAQPage JSON-LD.
- Publishing sets the Shopify article's featured image and SEO meta tags correctly.
- The SEO score reflects the new checks; missing alt text or a missing featured image lowers it with
  a clear tip.
- If no product matches, it degrades gracefully (placeholder featured image flagged, no broken URLs).
Show the new article JSON shape and the prompt-builder + shopify.js changes first, then implement.
```

---

### Notes

- The **featured image** is the headline change: Shopify's Article API has a dedicated `image` field
  (the thumbnail shown on the blog index and used by `og:image`), separate from images inside the body
  — this prompt sets both correctly and avoids duplicating them.
- All images use your store's **real Shopify product photos** from Business DNA, so they're licensed,
  on-brand, and double as internal links to the products (good for SEO and conversions).
- The **JSON-LD (Article + FAQPage)** makes the post eligible for rich results and easier for AI search
  engines to cite — it complements the site-wide SEO work in `SEO_AND_LOGO_PROMPT.md`.
- If you've already built the per-workspace `imageMatcher.js` from the SaaS phases, this extends it
  rather than duplicating — tell the AI to reuse the existing matcher.

Want me to also add a prompt for an **image-swap UI** (let users preview and change the featured/inline
images before publishing) or **AI-generated hero images** for topics with no matching product photo?

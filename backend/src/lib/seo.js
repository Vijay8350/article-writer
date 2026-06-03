export function countWords(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

// All <img> alts in the body (may include empty strings if alt="" was used).
function imgAlts(html) {
  const out = [];
  const re = /<img[^>]*\salt\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html || '')) !== null) out.push(m[1]);
  return out;
}

function countImgs(html) {
  return (html?.match(/<img\b/gi) || []).length;
}

function plainText(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function first100Words(html) {
  return plainText(html).split(' ').slice(0, 100).join(' ').toLowerCase();
}

function hasH2WithKeyword(html, kw) {
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const target = String(kw || '').toLowerCase();
  let m;
  while ((m = re.exec(html || '')) !== null) {
    if (m[1].toLowerCase().includes(target)) return true;
  }
  return false;
}

function hasFAQSection(html) {
  return /<h2[^>]*>[\s\S]*?(faq|frequently asked|q\s*&\s*a)[\s\S]*?<\/h2>/i.test(html || '');
}

// 50 weighted checks distributed across structure, keyword targeting, images, and meta.
export function calculateSeoScore(article) {
  const checks = [];
  let total = 0;
  const max = 100;
  const body = article.bodyHtml || '';
  const kw = String(article.primaryKeyword || article.title || '').toLowerCase().trim();
  const kwShort = kw.replace(/[^a-z0-9 ]/g, ' ').trim();
  const bodyLower = body.toLowerCase();

  const push = (name, status, score, tip) => { checks.push({ name, status, score, tip }); total += score; };

  // ─── Title (10) ───────────────────────────────────────────
  const titleLen = (article.title || '').length;
  if (titleLen >= 50 && titleLen <= 70) push('Title length', 'pass', 7, `${titleLen} chars — perfect!`);
  else if (titleLen >= 30 && titleLen <= 80) push('Title length', 'warn', 4, `${titleLen} chars — aim for 50-70`);
  else push('Title length', 'fail', 0, `${titleLen} chars — should be 50-70`);

  const titleHasKw = kwShort && (article.title || '').toLowerCase().includes(kwShort);
  push('Keyword in title', titleHasKw ? 'pass' : 'fail', titleHasKw ? 3 : 0, titleHasKw ? 'Primary keyword found in title' : 'Add the primary keyword to the title');

  // ─── SEO meta (10) ────────────────────────────────────────
  const seoTitleLen = (article.seoTitle || '').length;
  if (seoTitleLen >= 50 && seoTitleLen <= 60) push('SEO title', 'pass', 5, `${seoTitleLen} chars — perfect!`);
  else if (seoTitleLen > 0) push('SEO title', 'warn', 3, `${seoTitleLen} chars — aim for 50-60`);
  else push('SEO title', 'fail', 0, 'Missing — add a meta title');

  const metaLen = (article.seoDescription || '').length;
  const metaHasKw = kwShort && (article.seoDescription || '').toLowerCase().includes(kwShort);
  if (metaLen >= 150 && metaLen <= 160 && metaHasKw) push('Meta description', 'pass', 5, `${metaLen} chars + keyword — perfect!`);
  else if (metaLen >= 140 && metaLen <= 170) push('Meta description', 'warn', 3, `${metaLen} chars — ${metaHasKw ? 'aim for 150-160' : 'add the primary keyword'}`);
  else if (metaLen > 0) push('Meta description', 'warn', 2, `${metaLen} chars — aim for 150-160`);
  else push('Meta description', 'fail', 0, 'Missing — add a meta description');

  // ─── Slug (5) ─────────────────────────────────────────────
  const slug = String(article.handle || '');
  const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const slugHasKw = kwShort && slug.includes(kwShort.replace(/\s+/g, '-'));
  if (slugOk && slug.length > 0 && slug.length <= 60 && slugHasKw) push('URL slug', 'pass', 5, `${slug} — clean + keyword`);
  else if (slugOk && slug.length > 0) push('URL slug', 'warn', 3, `${slug} — add primary keyword`);
  else push('URL slug', 'fail', 0, 'Slug must be lowercase, hyphenated, with the keyword');

  // ─── Content depth (15) ───────────────────────────────────
  const words = countWords(body);
  if (words >= 1000) push('Word count', 'pass', 10, `${words} words — great depth!`);
  else if (words >= 500) push('Word count', 'warn', 6, `${words} words — aim for 1000+`);
  else push('Word count', 'fail', 3, `${words} words — too short`);

  const kwInIntro = kwShort && first100Words(body).includes(kwShort);
  push('Keyword in intro', kwInIntro ? 'pass' : 'fail', kwInIntro ? 5 : 0, kwInIntro ? 'Primary keyword found in first 100 words' : 'Include the primary keyword in the first paragraph');

  // ─── Structure (15) ───────────────────────────────────────
  const h2 = (body.match(/<h2/gi) || []).length;
  const h3 = (body.match(/<h3/gi) || []).length;
  if (h2 >= 4 && h3 >= 1) push('Heading structure', 'pass', 8, `${h2} H2s, ${h3} H3s — well organized`);
  else if (h2 >= 3) push('Heading structure', 'warn', 5, `${h2} H2s — add more subheadings`);
  else push('Heading structure', 'fail', 0, 'Need at least 4 H2 sections');

  const kwInH2 = hasH2WithKeyword(body, kwShort);
  push('Keyword in an H2', kwInH2 ? 'pass' : 'warn', kwInH2 ? 4 : 0, kwInH2 ? 'Found' : 'Include the primary keyword in at least one H2');

  const hasList = /<(ul|ol)\b/i.test(body);
  push('List or table', hasList ? 'pass' : 'fail', hasList ? 3 : 0, hasList ? 'List/table present' : 'Add a bulleted/numbered list');

  // ─── FAQ (5) ──────────────────────────────────────────────
  const faq = hasFAQSection(body);
  push('FAQ section', faq ? 'pass' : 'warn', faq ? 5 : 0, faq ? 'FAQ section present (eligible for FAQPage schema)' : 'Add a "Frequently Asked Questions" H2 with H3 Q/A pairs');

  // ─── Internal links (10) ──────────────────────────────────
  const links = (body.match(/<a\s+href/gi) || []).length;
  if (links >= 4) push('Internal links', 'pass', 10, `${links} links — great for SEO`);
  else if (links >= 2) push('Internal links', 'warn', 6, `${links} links — add more`);
  else push('Internal links', 'fail', 0, 'Add product/collection links');

  // ─── Images (20) ──────────────────────────────────────────
  const hasFeatured = !!article.featuredImage?.src;
  push('Featured image', hasFeatured ? 'pass' : 'fail', hasFeatured ? 8 : 0,
    hasFeatured ? 'Hero image set from your store' : 'No matching product image for the hero — Shopify article will publish without one');

  const inlineCount = countImgs(body);
  if (inlineCount >= 2) push('Inline images', 'pass', 6, `${inlineCount} images embedded`);
  else if (inlineCount === 1) push('Inline images', 'warn', 3, '1 image — add 1-2 more');
  else push('Inline images', 'fail', 0, 'No inline images embedded');

  const alts = imgAlts(body);
  const emptyAlts = alts.filter((a) => !a.trim()).length;
  if (alts.length === 0) push('Image alt text', 'warn', 0, 'No images to check');
  else if (emptyAlts === 0) push('Image alt text', 'pass', 6, 'All images have alt text');
  else push('Image alt text', 'fail', 2, `${emptyAlts} image(s) missing alt text`);

  // ─── Tags (5) ─────────────────────────────────────────────
  const tagCount = (article.tags || '').split(',').filter((t) => t.trim()).length;
  if (tagCount >= 5) push('Tags', 'pass', 5, `${tagCount} tags`);
  else if (tagCount >= 2) push('Tags', 'warn', 3, `${tagCount} tags — add more`);
  else push('Tags', 'fail', 0, 'Add 5-8 tags');

  return { score: Math.min(total, max), maxScore: max, checks };
}

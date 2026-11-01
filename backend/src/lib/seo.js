import { extractFaqs, stripTags, TAKEAWAYS_RE } from './articleStructure.js';

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
    hasFeatured ? 'Hero image set' : 'No hero image — the Shopify article will publish without one');

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

// ─── AEO: how easily AI assistants and answer boxes can quote the article ───

const QUESTION_RE = /\?\s*$|^(how|what|why|which|when|where|who|can|do|does|is|are|should|will)\b/i;
const VAGUE_START_RE = /^(it|this|that|these|those|they)\b/i;
const NOT_AN_ANSWER_RE = /key takeaways?|quick answer|at a glance|tl;?dr|faq|frequently asked|q\s*&\s*a|conclusion|final thoughts|wrapping up/i;
const CLAIM_RE = /\b\d{1,3}(?:\.\d+)?\s?%|\b(?:studies show|study found|research shows|according to|surveys? (?:show|found)|experts say)\b/gi;
const QUOTABLE_WORDS = [25, 75]; // an answer short enough to lift, long enough to stand alone
const MAX_INTRO_WORDS = 80;
const MAX_FAQ_ANSWER_WORDS = 90;
const MIN_FAQS = 3;

function splitSections(html) {
  const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  return {
    intro: heads.length ? html.slice(0, heads[0].index) : html,
    sections: heads.map((m, i) => ({
      title: stripTags(m[1]),
      body: html.slice(m.index + m[0].length, heads[i + 1]?.index ?? html.length),
    })),
  };
}

const firstParagraph = (html) => stripTags(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1] || '');

function averageSentenceLength(text) {
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 1);
  return sentences.length ? text.split(' ').length / sentences.length : 0;
}

export function calculateAeoScore(article) {
  const checks = [];
  let total = 0;
  const push = (name, status, score, tip) => { checks.push({ name, status, score, tip }); total += score; };

  const body = String(article.bodyHtml || article.body_html || '').replace(/<nav class="article-toc">[\s\S]*?<\/nav>/gi, '');
  const { intro, sections } = splitSections(body);

  // ─── Direct answer up front (15) ──────────────────────────
  const introWords = countWords(firstParagraph(intro));
  const keyword = String(article.primaryKeyword || '').toLowerCase().trim();
  const hasKeyword = !keyword || firstParagraph(intro).toLowerCase().includes(keyword);
  if (introWords > 0 && introWords <= MAX_INTRO_WORDS && hasKeyword) push('Direct answer first', 'pass', 15, `Opens with a ${introWords}-word answer`);
  else if (introWords > 0) push('Direct answer first', 'warn', 8, hasKeyword ? `${introWords} words: answer the topic in under ${MAX_INTRO_WORDS}` : 'Name the topic in the opening paragraph');
  else push('Direct answer first', 'fail', 0, 'Open with a short paragraph that answers the topic');

  // ─── Key takeaways (10) ───────────────────────────────────
  const takeaways = sections.find((s) => TAKEAWAYS_RE.test(s.title));
  if (takeaways && /<(ul|ol)\b/i.test(takeaways.body)) push('Key takeaways', 'pass', 10, 'Summary list found');
  else push('Key takeaways', 'fail', 0, 'Add a Key Takeaways list near the top');

  // ─── Question headings (15) ───────────────────────────────
  const content = sections.filter((s) => !NOT_AN_ANSWER_RE.test(s.title));
  const questions = content.filter((s) => QUESTION_RE.test(s.title)).length;
  const share = content.length ? questions / content.length : 0;
  if (share >= 0.5) push('Question headings', 'pass', 15, `${questions} of ${content.length} headings are questions`);
  else if (share >= 0.25) push('Question headings', 'warn', 8, `${questions} of ${content.length}: phrase more headings as questions`);
  else push('Question headings', 'fail', 0, 'Phrase headings as the questions shoppers ask');

  // ─── A quotable answer under each heading (20) ────────────
  const answered = content.filter((s) => {
    const text = firstParagraph(s.body);
    const words = countWords(text);
    return words >= QUOTABLE_WORDS[0] && words <= QUOTABLE_WORDS[1] && !VAGUE_START_RE.test(text);
  }).length;
  const answeredShare = content.length ? answered / content.length : 0;
  if (answeredShare >= 0.75) push('Quotable answers', 'pass', 20, `${answered} of ${content.length} sections open with a self-contained answer`);
  else if (answeredShare >= 0.4) push('Quotable answers', 'warn', 10, `${answered} of ${content.length}: open each section with a ${QUOTABLE_WORDS[0]}-${QUOTABLE_WORDS[1]} word answer`);
  else push('Quotable answers', 'fail', 0, `Open each section with a ${QUOTABLE_WORDS[0]}-${QUOTABLE_WORDS[1]} word answer that makes sense on its own`);

  // ─── FAQ, published as schema (15) ────────────────────────
  const faqs = extractFaqs(body);
  const shortAnswers = faqs.filter((f) => countWords(f.answer) <= MAX_FAQ_ANSWER_WORDS).length;
  if (faqs.length >= MIN_FAQS && shortAnswers === faqs.length) push('FAQ schema', 'pass', 15, `${faqs.length} questions, published as FAQ schema`);
  else if (faqs.length >= MIN_FAQS) push('FAQ schema', 'warn', 10, `${faqs.length - shortAnswers} answers are too long to quote: keep them under ${MAX_FAQ_ANSWER_WORDS} words`);
  else if (faqs.length) push('FAQ schema', 'warn', 5, `Only ${faqs.length}: add at least ${MIN_FAQS} questions`);
  else push('FAQ schema', 'fail', 0, 'Add a Frequently Asked Questions section with H3 questions');

  // ─── Structured content (10) ──────────────────────────────
  if (/<(table|ol)\b/i.test(body)) push('Steps or tables', 'pass', 10, 'Numbered steps or a table found');
  else if (/<ul\b/i.test(body)) push('Steps or tables', 'warn', 5, 'Add numbered steps or a comparison table');
  else push('Steps or tables', 'fail', 0, 'Add a list, numbered steps or a table');

  // ─── Plain language (10) ──────────────────────────────────
  const plain = stripTags(body);
  const avg = averageSentenceLength(plain);
  if (avg && avg <= 22) push('Plain language', 'pass', 10, `${Math.round(avg)} words per sentence`);
  else if (avg <= 28) push('Plain language', 'warn', 5, `${Math.round(avg)} words per sentence: aim for under 22`);
  else push('Plain language', 'fail', 0, `${Math.round(avg)} words per sentence: too long to quote`);

  // ─── Claims a person should check (5) ─────────────────────
  const claims = plain.match(CLAIM_RE) || [];
  if (!claims.length) push('Claims to verify', 'pass', 5, 'No statistics or cited sources to check');
  else push('Claims to verify', 'warn', 0, `Check ${claims.length} statistic or source claim(s) are true before publishing`);

  return { score: Math.min(total, 100), maxScore: 100, checks };
}

// What makes an article easy for search engines and AI answer engines to read and quote.
// The writer follows ANSWER_ENGINE_RULES; everything a model can't be trusted to do
// exactly (heading ids, the table of contents, meta lengths, FAQ schema) is done here.

const TOC_MIN_WORDS = 1000;
const TOC_MIN_SECTIONS = 4;
const MIN_FAQS = 2;
const MAX_SEO_TITLE = 60;
const MAX_SEO_DESCRIPTION = 160;
const MAX_HANDLE = 60;

const H2_RE = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi;
const OUR_TOC_RE = /<nav class="article-toc">[\s\S]*?<\/nav>\s*/gi;
const FAQ_SCHEMA_RE = /<script[^>]*application\/ld\+json[^>]*>(?:(?!<\/script>)[\s\S])*?FAQPage(?:(?!<\/script>)[\s\S])*?<\/script>\s*/gi;
export const TAKEAWAYS_RE = /key takeaways?|quick answer|at a glance|tl;?dr/i;

export const stripTags = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const escapeHtml = (s) => String(s).replace(/&(?!\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wordCount = (html) => stripTags(html).split(' ').filter(Boolean).length;

const slugify = (text) => String(text).toLowerCase().replace(/&[a-z]+;/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const answerEngineRules = (storeName) => `ANSWER ENGINE OPTIMIZATION (AI assistants and Google AI Overviews quote pages like this one, so write to be quoted):
- Right after the intro, add <h2>Key Takeaways</h2> with a <ul> of 3-5 one-sentence facts that answer the topic on their own.
- Phrase most H2s as the exact question a shopper would ask, such as "How do you ...?", "What is the best ...?" or "Is ... worth it?".
- Open every H2 section with a <p> of 40-60 words that directly answers that heading. It must make sense quoted alone: name the subject, never start with "it", "this" or "they", and give the answer in the first sentence. Details come after it.
- Define key terms plainly ("X is ...").
- Use <ol> for steps, <ul> for options, and a <table> with <th> headers for any comparison.
- Be specific: name the product type, material, occasion and ${storeName || 'the store'} rather than using vague pronouns.
- FAQ answers are 40-60 words, self-contained, with the direct answer first.
- FACTS ONLY: never invent statistics, percentages, studies, experts, quotes, awards, prices, discounts or sources, and never claim personal testing. Product facts may come only from the store data above. If you have no number, make the point without one.`;

export const ENHANCE_RULES = `- Keep every existing <img>, <figure> and link exactly as it is, and do not change what the products are or what they cost
- Do not add image placeholders, a table of contents, or anchor ids: those are handled for you`;

function addHeadingIds(html) {
  const used = new Set([...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((m) => m[1]));
  return html.replace(H2_RE, (full, attrs, inner) => {
    if (/\sid=["']/i.test(attrs)) return full;
    const base = slugify(stripTags(inner)).slice(0, MAX_HANDLE).replace(/-+$/, '') || 'section';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return `<h2 id="${id}"${attrs}>${inner}</h2>`;
  });
}

const listHeadings = (html) => [...html.matchAll(H2_RE)].map((m) => ({
  id: m[1].match(/\sid=["']([^"']+)["']/i)?.[1],
  text: stripTags(m[2]),
}));

// In-page links only work if the target exists: point them at the heading they name, or unlink them.
function repairAnchors(html) {
  const byText = new Map(listHeadings(html).map((h) => [h.text.toLowerCase(), h.id]));
  return html.replace(/<a\b([^>]*)href="#([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi, (full, before, target, after, label) => {
    if (target && new RegExp(`\\sid=["']${target.replace(/[^\w-]/g, '\\$&')}["']`, 'i').test(html)) return full;
    const id = byText.get(stripTags(label).toLowerCase());
    return id ? `<a${before}href="#${id}"${after}>${label}</a>` : label;
  });
}

function addTableOfContents(html) {
  const sections = listHeadings(html).filter((h) => !TAKEAWAYS_RE.test(h.text));
  const hasOwnToc = (html.match(/href="#/g) || []).length >= TOC_MIN_SECTIONS - 1;
  if (hasOwnToc || sections.length < TOC_MIN_SECTIONS || wordCount(html) < TOC_MIN_WORDS) return html;
  const items = sections.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('');
  const at = html.search(new RegExp(`<h2\\b[^>]*id="${sections[0].id}"`));
  return at < 0 ? html : `${html.slice(0, at)}<nav class="article-toc"><p><strong>In this article</strong></p><ul>${items}</ul></nav>${html.slice(at)}`;
}

export function structureBody(html) {
  const body = String(html || '').replace(OUR_TOC_RE, '').replace(/<(\/?)h1\b/gi, '<$1h2');
  return addTableOfContents(repairAnchors(addHeadingIds(body)));
}

// ─── FAQ schema ─────────────────────────────────────────────────────────────

export function extractFaqs(html) {
  const headings = [...String(html || '').matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => ({ index: m.index, end: m.index + m[0].length, text: stripTags(m[1]) }));
  const at = headings.findIndex((h) => /faq|frequently asked|q\s*&\s*a/i.test(h.text));
  if (at < 0) return [];
  const section = html.slice(headings[at].end, headings[at + 1]?.index ?? html.length);
  return [...section.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi)]
    .map((m) => ({ question: stripTags(m[1]), answer: stripTags(m[2]) }))
    .filter((f) => f.question && f.answer);
}

export const stripFaqSchema = (html) => String(html || '').replace(FAQ_SCHEMA_RE, '');

// The article body as published: its FAQ as schema, built from the final text. Themes
// already output Article schema, so only what they're missing is added.
export function withFaqSchema(html) {
  const body = stripFaqSchema(html);
  const faqs = extractFaqs(body);
  if (faqs.length < MIN_FAQS) return body;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  };
  return `${body}\n<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

const DANGLING_END_RE = /(?:[\s,;:|–—-]+|\s(?:and|or|for|to|the|a|an|of|with|in|on|at|your|&))+$/i;

function fitText(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(DANGLING_END_RE, '');
}

// A meta title keeps its "| Brand" ending and gives up words from the main part instead.
function fitTitle(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const at = clean.lastIndexOf(' | ');
  if (clean.length <= max || at < 0) return fitText(clean, max);
  const brand = clean.slice(at);
  return `${fitText(clean.slice(0, at), max - brand.length)}${brand}`;
}

const BRAND_SUFFIX_RE = /\s+\|\s+[^|]+$/;
const validHandle = (handle) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle || '') && handle.length <= MAX_HANDLE;

// Meta title and description at lengths search engines show in full. `keepHandle` is for
// published articles, whose URL must never change.
export function tidySeoFields(article, { primaryKeyword, keepHandle = false } = {}) {
  const handle = validHandle(article.handle) || keepHandle
    ? article.handle
    : slugify(primaryKeyword || article.handle || article.title).slice(0, MAX_HANDLE).replace(/-+$/, '');
  return {
    handle,
    title: String(article.title || '').replace(BRAND_SUFFIX_RE, ''), // the brand belongs in the meta title only
    seoTitle: fitTitle(article.seoTitle || article.title, MAX_SEO_TITLE),
    seoDescription: fitText(article.seoDescription || article.summary, MAX_SEO_DESCRIPTION),
  };
}

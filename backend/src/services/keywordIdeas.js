import * as gemini from './gemini.js';
import * as deepseek from './deepseek.js';

// Normalizes a title to a comparable token set for duplicate detection.
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'your', 'you', 'how', 'best', 'guide', 'tips', 'ways']);
function tokens(s) {
  return new Set(
    String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
  );
}
function similarity(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / new Set([...ta, ...tb]).size; // Jaccard
}

// True if `title` is too close to anything already covered.
export function isDuplicate(title, coveredTitles, threshold = 0.6) {
  return coveredTitles.some((t) => {
    const sim = similarity(title, t);
    return sim >= threshold;
  });
}

function buildPrompt({ collectionTitle, niche, productTitles, excludeTitles, count }) {
  const products = (productTitles || []).slice(0, 25).map((t) => `- ${t}`).join('\n') || '(none)';
  const exclude = (excludeTitles || []).slice(0, 80).map((t) => `- ${t}`).join('\n') || '(none yet)';
  return `You are an SEO strategist for an e-commerce store${niche ? ` in the "${niche}" niche` : ''}.

Suggest ${count} blog article ideas for the product category "${collectionTitle}".

Requirements:
- Target LONG-TAIL, LOW-COMPETITION search queries (specific, intent-driven, question/how-to/comparison/buying-guide style). Avoid broad head terms.
- Each idea must be genuinely useful to shoppers and naturally relate to the category's products.
- Do NOT duplicate or closely overlap any of these existing/already-covered titles:
${exclude}

Products in this category (for relevance):
${products}

Return ONLY a JSON array, no markdown, of objects:
[{"keyword":"the primary long-tail keyword","title":"A compelling 50-70 char article title"}]
Exactly ${count} items.`;
}

function parseIdeas(raw) {
  try {
    let cleaned = String(raw).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
    const arr = JSON.parse(cleaned);
    return (Array.isArray(arr) ? arr : [])
      .filter((x) => x && x.title)
      .map((x) => ({ keyword: x.keyword || x.title, title: String(x.title).trim() }));
  } catch {
    return [];
  }
}

// Returns [{ keyword, title }] candidate ideas for a category.
export async function getKeywordIdeas({ collectionTitle, niche, productTitles, excludeTitles, count = 8, aiModel, apiKey }) {
  const svc = aiModel === 'deepseek' ? deepseek : gemini;
  const prompt = buildPrompt({ collectionTitle, niche, productTitles, excludeTitles, count });
  const raw = await svc.complete(prompt, apiKey, { temperature: 0.9, maxTokens: 1500 });
  return parseIdeas(raw);
}

export default { getKeywordIdeas, isDuplicate };

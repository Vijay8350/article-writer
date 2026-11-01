// What makes an article worth reading: the writing rules, the editor pass that follows
// the first draft, and the check that an edit didn't damage what the draft got right.

export const WRITING_RULES = `WRITING QUALITY:
- Write like a knowledgeable shop assistant helping one customer: clear, warm, practical and specific.
- Every paragraph must teach something new. Give concrete examples, decision rules and real situations, such as what to wear with what, for which occasion, and what to avoid.
- When you mention a product, use only the details listed beside it. Never invent materials, sizes, durability, stock or offers. Recommend different products rather than repeating the same few, and link each one once.
- Say something once. Do not restate a point in new words, and do not pad to reach a length: a useful shorter section beats a long empty one.
- Avoid hype and filler: gorgeous, stunning, perfect, must-have, game-changer, elevate, effortless, timeless, versatile, "let's break down", "in this guide", "when it comes to", "not just X but Y".
- Vary how sentences start, and use dashes rarely. Use contractions naturally. Do not add forced openers such as "Honestly" or "Look", or rhetorical questions outside the headings.
- Bold only the few phrases a skimming reader needs.`;

export const EDITOR_SYSTEM = 'You are a senior ecommerce editor. You make good drafts better without changing their structure. You return ONLY valid JSON, never markdown code blocks or explanations.';

const productLines = (ctx) => (ctx?.products || []).slice(0, 24).map((p) => `- ${p.title}${p.facts ? `: ${p.facts}` : ''}`).join('\n') || 'None';

export function buildEditPrompt(article, ctx) {
  return `Edit this blog article draft for ${ctx?.storeName || 'an online store'}.

KNOWN PRODUCT FACTS (the only product details that may be stated):
${productLines(ctx)}

${WRITING_RULES}

EDITOR'S CHECKLIST:
1. Delete filler, repeated points and generic advice that could appear on any site. Replace them with something specific and useful.
2. Delete or fix any claim the facts above don't support, and any statistic, study, expert or source.
3. Fix sentences that start the same way, and anything that sounds machine-written.
4. Keep the opening answer, each 40-60 word answer under a heading, the Key Takeaways and the FAQ self-contained and quotable.

DO NOT CHANGE:
- The number or order of <h2> headings. You may reword them slightly, keeping them as questions.
- Any <a> link, <img>, <figure>, or <div class="article-image-placeholder"> block. Keep them exactly as they are.
- The overall length: stay within 10% of the draft.

Title: ${article.title}
Summary: ${article.summary || ''}
Body HTML:
${article.bodyHtml}

Return ONLY JSON: {"title":"","bodyHtml":"","summary":""}`;
}

const count = (html, re) => (String(html || '').match(re) || []).length;
const words = (html) => String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

const MIN_LENGTH_KEPT = 0.85;
const MAX_LENGTH_GROWTH = 1.25;

// An edit only replaces the draft if everything the draft had survived it.
export function acceptEdit(draft, edited) {
  if (!edited?.bodyHtml) return false;
  const same = (re) => count(edited.bodyHtml, re) === count(draft.bodyHtml, re);
  const ratio = words(edited.bodyHtml) / Math.max(words(draft.bodyHtml), 1);
  return same(/<h2\b/gi) && same(/<img\b/gi) && same(/article-image-placeholder/g)
    && count(edited.bodyHtml, /<a\s/gi) >= count(draft.bodyHtml, /<a\s/gi) * 0.8
    && ratio >= MIN_LENGTH_KEPT && ratio <= MAX_LENGTH_GROWTH;
}

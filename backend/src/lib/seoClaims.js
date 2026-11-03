// Promises in product text that the store's own facts say aren't true (free shipping,
// Cash on Delivery), and how to take them out while keeping every other word. Pure logic,
// so it can be tested without a store.
//
// facts: { cod: true | false | null, freeShipping: 'none' | 'all' | 'over' | null, freeShippingMin: number }

const RUPEES = '(?:₹|&#8377;|rs\\.?|inr)\\s?';
const FREE = `free\\s+(?:shipping|delivery)(?:\\s+on\\s+(?:all\\s+)?orders)?(?:\\s+(?:over|above)\\s+${RUPEES}(?<amount>[\\d,]+))?`;
const COD = '(?:cash\\s+on\\s+delivery|\\bcod\\b)(?:\\s+(?:available|availability))?(?:\\s+(?:across|in)\\s+india)?';
// What joins a promise to the words around it: "A, B", "A & B", "A + B", "A and B".
const JOIN = '(?:\\s*,\\s*(?:and\\s+)?|\\s*&(?:amp;)?\\s*|\\s*\\+\\s*|\\s+and\\s+)';
const LEAF_RE = /<(p|li|h[1-6]|td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const NESTED_BLOCK_RE = /<(?:p|li|ul|ol|div|table|h[1-6])\b/i;
const MIN_WORDS_LEFT = 2; // a line left with less than this was only the promise
const MIN_DESCRIPTION = 40;

// Which promises are false for this store. Nothing is checked until the owner says.
function falseKinds(facts) {
  const kinds = [];
  if (facts?.freeShipping === 'none' || facts?.freeShipping === 'over') {
    const min = Number(facts.freeShippingMin);
    kinds.push({
      label: 'free shipping',
      source: FREE,
      // "Free shipping over ₹999" is true when ₹999 is the real threshold.
      isFalse: (amount) => facts.freeShipping === 'none' || !amount || Number(amount.replace(/,/g, '')) !== min,
    });
  }
  if (facts?.cod === false) kinds.push({ label: 'Cash on Delivery', source: COD, isFalse: () => true });
  return kinds;
}

export const checksClaims = (facts) => falseKinds(facts).length > 0;

const textOf = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const words = (text) => (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

function matchClaims(text, facts) {
  const found = [];
  for (const kind of falseKinds(facts)) {
    for (const m of String(text || '').matchAll(new RegExp(kind.source, 'gi'))) {
      if (kind.isFalse(m.groups?.amount)) found.push(m[0].replace(/\s+/g, ' ').trim());
    }
  }
  return found;
}

// The false promises in a piece of text or HTML, as a reader sees them.
export const findClaims = (text, facts) => matchClaims(textOf(text), facts);

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Left-over joiners and punctuation once a promise is gone: "Order now with !" → "Order now!".
function tidy(text, original) {
  let t = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.!?,;:])/g, '$1')
    .replace(/(?:\s*(?:,|&amp;|&|\+|:|\band\b|\bwith\b|\bor\b))+\s*(?=[.!?]|$)/gi, '')
    .replace(/([.!?])(?:\s*[.!?])+/g, '$1')
    .replace(/^\s*(?:,|&amp;|&|\+|and\b)\s*/i, '')
    .trim();
  if (/^\p{Lu}/u.test(original.trim()) && /^\p{Ll}/u.test(t)) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

// Takes each false promise out of a run of text, with the joiner that tied it to its
// neighbours, so "Easy returns and Cash on Delivery available" becomes "Easy returns".
function strip(text, facts) {
  let out = text;
  for (const kind of falseKinds(facts)) {
    const drop = (m, ...args) => (kind.isFalse(args.at(-1)?.amount) ? '' : m);
    for (let pass = 0; pass < 5; pass++) {
      const before = out;
      out = out.replace(new RegExp(`${JOIN}(?:${kind.source})`, 'gi'), drop);
      out = out.replace(new RegExp(`(?:${kind.source})${JOIN}`, 'gi'), drop);
      out = out.replace(new RegExp(`(?:${kind.source})`, 'gi'), drop);
      if (out === before) break;
    }
  }
  return out === text ? text : tidy(out, text);
}

// A Google description without the false promises, or the reason it needs a person.
export function cleanDescription(description, facts) {
  if (!findClaims(description, facts).length) return { changed: false, text: description };
  const text = strip(description, facts);
  if (findClaims(text, facts).length) return { changed: false, error: 'The promise is worded in a way that can\'t be removed safely. Edit this description yourself.' };
  if (text.length < MIN_DESCRIPTION) return { changed: false, error: 'Little would be left once the promise is removed. Write a new description yourself.' };
  return { changed: true, text };
}

// Product HTML without the false promises. A line that was only the promise goes; any
// other line keeps all its other words. Formatting is kept unless the promise spans it.
export function cleanBody(html, facts) {
  if (!findClaims(html, facts).length) return { changed: false, html, lines: [] };
  const lines = [];
  const next = String(html).replace(new RegExp(`${LEAF_RE.source}(\\s*\\n)?`, 'gi'), (full, tag, attrs, inner) => {
    const claims = findClaims(inner, facts);
    if (NESTED_BLOCK_RE.test(inner) || !claims.length) return full;
    // A promise split by formatting ("<b>Free shipping</b> on all orders") can't be cut out of
    // the HTML cleanly, so that one line is rebuilt from its plain text instead.
    const splitByTags = matchClaims(inner, facts).join('|').toLowerCase() !== claims.join('|').toLowerCase();
    const cleaned = splitByTags ? strip(escapeHtml(textOf(inner).replace(/\s+/g, ' ').trim()), facts) : strip(inner, facts);
    const before = textOf(inner).replace(/\s+/g, ' ').trim();
    if (words(textOf(cleaned)) < MIN_WORDS_LEFT) {
      lines.push({ before, after: null });
      return '';
    }
    lines.push({ before, after: textOf(cleaned).replace(/\s+/g, ' ').trim() });
    return full.replace(inner, () => cleaned);
  });
  if (findClaims(next, facts).length) {
    return { changed: false, lines, error: 'Some of the promise sits outside a normal paragraph or list item. Edit this product\'s text yourself.' };
  }
  return { changed: true, html: next, lines };
}

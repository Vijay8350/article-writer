// Recovering an article from an AI response that isn't quite valid JSON.

// Models sometimes leave raw line breaks or tabs inside JSON strings, which
// JSON.parse rejects. This escapes them without touching anything outside a string.
export function escapeControlChars(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
    } else if (escaped) {
      escaped = false;
      out += ch;
    } else if (ch === '\\') {
      escaped = true;
      out += ch;
    } else if (ch === '"') {
      inString = false;
      out += ch;
    } else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch >= ' ') out += ch;
  }
  return out;
}

// Never invent a placeholder article: campaigns and scheduled posts publish without a
// person looking, so an unreadable response has to fail, not go live as "Generated Article".
export const unreadableArticle = (provider) =>
  Object.assign(new Error(`${provider} returned an article that couldn't be read. Please try again.`), { status: 502 });

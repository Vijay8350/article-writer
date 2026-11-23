// A small in-memory limit on how often one visitor may try something (sign up, log in).
// The backend is one process (PM2 single fork), so memory is the whole picture.

// The visitor's address. Behind our nginx (which connects from this machine) it's the
// X-Real-IP nginx sets; a direct connection uses its own address, so a forged header
// from outside counts for nothing.
export function clientIp(req) {
  const peer = req.socket?.remoteAddress || '';
  const local = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  return (local && (req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || peer;
}

// Express middleware: at most `max` requests per `windowMs` for each key (by default the
// visitor's address); beyond that a 429 with `message`.
export function rateLimit({ windowMs, max, message, key = clientIp }) {
  const hits = new Map(); // key → timestamps inside the window
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, list] of hits) {
      const kept = list.filter((t) => t > cutoff);
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
  }, Math.min(windowMs, 10 * 60 * 1000)).unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const list = (hits.get(k) || []).filter((t) => t > now - windowMs);
    if (list.length >= max) {
      res.set('Retry-After', String(Math.ceil((list[0] + windowMs - now) / 1000)));
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', error: message });
    }
    list.push(now);
    hits.set(k, list);
    return next();
  };
}

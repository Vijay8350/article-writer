import sharp from 'sharp';
import { CANVAS, SHAPES, OFFSET, grow, footprintOf } from '../lib/postDesigns.js';

// Puts the store's REAL product photos into a designed post (lib/postDesigns.js plans
// where). Photos are only scaled, cropped to empty backdrop, or masked to their window,
// never redrawn. Also draws the guide the image model designs around.

const svg = (w, h, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${w} ${h}">${inner}</svg>`);
const pathAt = (win) => `<path transform="translate(${win.x},${win.y})" d="${SHAPES[win.shape].path(win.w, win.h, win.r || 0)}"`;

// ─── Photo analysis ─────────────────────────────────────────────────────────
// Done on a sharp, unblurred copy up to 1024px, so a 1px chain still counts as product.
const ANALYSE = 1024;
const CELL = 4;           // mask px per cell: the placement solver's grid
const RING = 2;           // border mask px sampled for the backdrop
const NEAR = 20;          // colour distance still counted as backdrop
const PLAIN_SHARE = 0.9;  // this share of the border near one light colour = plain backdrop
const PRODUCT = 20;       // colour distance from the backdrop counted as product (low = cautious)
const EDGE_TRACE = 12;    // fainter traces at a border (a thin chain) still mark that edge as cut
const median = (values) => { const s = Float64Array.from(values).sort(); return s[s.length >> 1]; };
const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// A rough colour name for the product, so the model can choose colours that suit it.
function colourName({ r, g, b }) {
  const max = Math.max(r, g, b) / 255; const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2; const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    h = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
    if (h < 0) h += 360;
  }
  if (s < 0.15) return l > 0.8 ? 'white' : l < 0.22 ? 'black' : 'silver';
  if (h < 12 || h >= 340) return l < 0.35 ? 'deep red' : 'rose';
  if (h < 30) return l < 0.35 ? 'brown' : 'rose gold';
  if (h < 65) return l < 0.35 ? 'bronze' : 'gold';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

// Plain (one light backdrop colour around the edges) or busy; for a plain photo, where
// the product is: a pixel mask (`mask`, for the final check), a grid of cells around it
// grown by one cell (`box`, `points` on its outline, `cell` = cell size in photo px), and
// the edges the photographer cut it at.
export async function analysePhoto(buf) {
  const meta = await sharp(buf).metadata();
  const upright = (meta.orientation || 1) >= 5;
  const W = upright ? meta.height : meta.width; const H = upright ? meta.width : meta.height;
  const { data, info } = await sharp(buf).rotate().resize(ANALYSE, ANALYSE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width; const h = info.height; const scale = W / w; // photo px per mask px

  const ring = []; // the photo's outer RING pixels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y >= RING && y < h - RING && x === RING) x = w - RING; // skip the inside of the row
      ring.push((y * w + x) * 3);
    }
  }
  const bg = [0, 1, 2].map((c) => median(ring.map((i) => data[i + c])));
  const dist2 = (i) => (data[i] - bg[0]) ** 2 + (data[i + 1] - bg[1]) ** 2 + (data[i + 2] - bg[2]) ** 2;
  const nearShare = ring.filter((i) => dist2(i) <= NEAR * NEAR).length / ring.length;
  const plain = nearShare >= PLAIN_SHARE && Math.min(...bg) >= 200; // light studio backdrops only

  // The product, pixel by pixel, and per cell (2+ pixels, so one stray pixel is noise).
  const bits = new Uint8Array(w * h);
  const gw = Math.ceil(w / CELL); const gh = Math.ceil(h / CELL);
  const counts = new Uint16Array(gw * gh);
  const sum = [0, 0, 0]; let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (dist2(i) > PRODUCT * PRODUCT) {
        bits[y * w + x] = 1; counts[((y / CELL) | 0) * gw + ((x / CELL) | 0)]++;
        sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++;
      }
    }
  }
  // Grow by one cell all round: a margin around everything that was seen.
  const cells = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      if (counts[cy * gw + cx] < 2) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = cy + dy; const xx = cx + dx;
        if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) cells[yy * gw + xx] = 1;
      }
    }
  }
  // The pixel mask keeps only what the grid kept, so the final check and the solver
  // agree on what's product: a lone speck far from it is noise for both.
  for (let y = 0; y < h; y++) {
    const row = ((y / CELL) | 0) * gw;
    for (let x = 0; x < w; x++) if (bits[y * w + x] && !cells[row + ((x / CELL) | 0)]) bits[y * w + x] = 0;
  }
  let x0 = gw; let x1 = -1; let y0 = gh; let y1 = -1;
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) if (cells[cy * gw + cx]) { x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy); }

  const cell = CELL * scale;
  let box = null; const points = [];
  let edges = { top: false, right: false, bottom: false, left: false };
  if (x1 >= 0) {
    // An edge is cut if the product reaches it, or if even a faint trace of it does:
    // better to keep such a photo out of a curved window than to cut a thin chain.
    const traces = (inBand) => {
      let k = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inBand(x, y) && dist2((y * w + x) * 3) > EDGE_TRACE * EDGE_TRACE) k++;
      return k >= 3;
    };
    edges = {
      top: y0 === 0 || traces((x, y) => y < RING),
      left: x0 === 0 || traces((x) => x < RING),
      right: x1 === gw - 1 || traces((x) => x >= w - RING),
      bottom: y1 === gh - 1 || traces((x, y) => y >= h - RING),
    };
    box = {
      left: edges.left ? 0 : x0 * cell, top: edges.top ? 0 : y0 * cell,
      right: edges.right ? W : Math.min(W, (x1 + 1) * cell), bottom: edges.bottom ? H : Math.min(H, (y1 + 1) * cell),
    };
    // The cells on the outline (every window is convex, so they decide what fits).
    const on = (cx, cy) => cx >= 0 && cy >= 0 && cx < gw && cy < gh && cells[cy * gw + cx];
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        if (on(cx, cy) && !(on(cx - 1, cy) && on(cx + 1, cy) && on(cx, cy - 1) && on(cx, cy + 1))) {
          points.push([Math.min(W, (cx + 0.5) * cell), Math.min(H, (cy + 0.5) * cell)]);
        }
      }
    }
  }
  const mean = { r: sum[0] / (n || 1), g: sum[1] / (n || 1), b: sum[2] / (n || 1) };
  return {
    width: W, height: H, aspect: W / H, plain: plain && Boolean(box), backdrop: { r: bg[0], g: bg[1], b: bg[2] },
    box, edges, points, cell, colour: n ? `${colourName(mean)} (${hex(mean)})` : null,
    mask: { w, h, scale, bits },
  };
}

// ─── Layers ─────────────────────────────────────────────────────────────────
// sharp refuses a layer larger than the image under it, so oversized layers are cut
// to the part that shows. Layers hanging off an edge are clipped by sharp itself.
async function visible(layer, W, H) {
  const { width, height } = await sharp(layer.input).metadata();
  if (width <= W && height <= H) return layer;
  const x0 = Math.max(0, layer.left); const y0 = Math.max(0, layer.top);
  const x1 = Math.min(W, layer.left + width); const y1 = Math.min(H, layer.top + height);
  if (x1 <= x0 || y1 <= y0) return null;
  const input = await sharp(layer.input).extract({ left: x0 - layer.left, top: y0 - layer.top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  return { input, left: x0, top: y0 };
}

// An alpha mask that fades each uncut side of a photo over its own width (f.l, f.r, f.t,
// f.b px) and is fully opaque everywhere else, so it never touches the product.
function featherMask(pw, ph, f) {
  const ramp = (d, width) => { if (width <= 0) return 1; const t = Math.min(1, Math.max(0, d / width)); return t * t * (3 - 2 * t); };
  const cols = new Float32Array(pw);
  for (let x = 0; x < pw; x++) cols[x] = ramp(x, f.l) * ramp(pw - 1 - x, f.r);
  const mask = Buffer.alloc(pw * ph);
  for (let y = 0; y < ph; y++) {
    const ry = ramp(y, f.t) * ramp(ph - 1 - y, f.b);
    for (let x = 0; x < pw; x++) mask[y * pw + x] = Math.round(255 * ry * cols[x]);
  }
  return mask;
}

// One photo in its window: masked to the window's shape. A plain photo sits on its own
// backdrop colour with its uncut edges faded out inside the empty margin (never into
// the product); a cropped or busy photo fills the window.
async function windowPixels(photoBuf, info, p) {
  const w = Math.round(p.win.w); const h = Math.round(p.win.h);
  let layer;
  if (p.mode === 'extend') {
    const { place } = p;
    const pw = Math.max(1, Math.round(place.w)); const ph = Math.max(1, Math.round(place.h));
    const gap = { l: place.box.left - place.x, r: place.x + place.w - place.box.right, t: place.box.top - place.y, b: place.y + place.h - place.box.bottom };
    const side = { l: 'left', r: 'right', t: 'top', b: 'bottom' };
    const fade = Object.fromEntries(Object.keys(gap).map((k) => [k, info.edges[side[k]] ? 0 : Math.max(0, Math.min(40, gap[k] * 0.5))]));
    const rgb = await sharp(photoBuf).rotate().resize(pw, ph, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const photo = await sharp(rgb, { raw: { width: pw, height: ph, channels: 3 } })
      .joinChannel(featherMask(pw, ph, fade), { raw: { width: pw, height: ph, channels: 1 } }).png().toBuffer();
    const placed = await visible({ input: photo, left: Math.round(place.x), top: Math.round(place.y) }, w, h);
    layer = await sharp({ create: { width: w, height: h, channels: 4, background: { ...info.backdrop, alpha: 1 } } })
      .composite(placed ? [placed] : []).png().toBuffer();
  } else if (p.mode === 'aspect') {
    layer = await sharp(photoBuf).rotate().extract(p.crop).resize(w, h, { fit: 'fill' }).ensureAlpha().png().toBuffer();
  } else {
    layer = await sharp(photoBuf).rotate().resize(w, h, { fit: 'cover' }).ensureAlpha().png().toBuffer();
  }
  const radius = p.mode === 'extend' ? (p.win.r || 0) : Math.min(p.win.r || 0, 0.04 * Math.min(w, h));
  const shape = svg(w, h, `<path d="${SHAPES[p.win.shape].path(w, h, radius)}" fill="#fff"/>`);
  return sharp(layer).composite([{ input: shape, blend: 'dest-in' }]).png().toBuffer();
}

// A soft shadow under a shape, blurred on a small canvas around it (never the whole post).
async function shadowOf(win, look, { blur = 22, opacity = 0.26 } = {}) {
  const [dx, dy] = look.light === 'top-right' ? [-10, 16] : look.light === 'top' ? [0, 18] : [10, 16];
  const pad = Math.ceil(blur * 3);
  const alpha = opacity * (look.tone === 'dark' ? 1.5 : look.tone === 'mid' ? 1.2 : 1);
  const shape = svg(win.w + pad * 2, win.h + pad * 2, `<path transform="translate(${pad},${pad})" d="${SHAPES[win.shape].path(win.w, win.h, win.r || 0)}" fill="rgba(0,0,0,${alpha.toFixed(3)})"/>`);
  return { input: await sharp(shape).blur(blur).png().toBuffer(), left: Math.round(win.x - pad + dx), top: Math.round(win.y - pad + dy) };
}
const strokeOf = (win, colour, width, opacity = 1) => `${pathAt(win)} fill="none" stroke="${colour}" stroke-width="${width}" stroke-opacity="${opacity}"/>`;

// The decorations around the photo, in the look's colours: back = under the photos.
async function trimsFor(plan, look) {
  const { w: W, h: H } = CANVAS;
  const back = []; const svgBack = []; const svgFront = [];
  const win = plan.window;
  for (const trim of plan.trims) {
    if (trim === 'shadow') {
      back.push(await shadowOf(plan.frame ? { shape: 'rect', ...plan.frame } : win, look));
      for (const e of plan.extra) back.push(await shadowOf(e, look, { blur: 16, opacity: 0.2 }));
    }
    if (trim === 'hairline') svgFront.push(strokeOf(grow(win, 18), look.accent, 2, 0.9));
    if (trim === 'ring') { svgFront.push(strokeOf(grow(win, 20), look.accent, 2.5, 0.95)); svgFront.push(strokeOf(grow(win, 30), look.accent, 1, 0.6)); }
    if (trim === 'gilded') { svgFront.push(strokeOf(grow(win, 14), look.accent, 4, 1)); svgFront.push(strokeOf(grow(win, 26), look.accent, 1.5, 0.8)); }
    if (trim === 'offset') svgBack.push(`<rect x="${win.x + OFFSET}" y="${win.y + OFFSET}" width="${win.w}" height="${win.h}" fill="none" stroke="${look.accent}" stroke-width="3"/>`);
    if (trim === 'seam') {
      // a thin accent rule where a full-bleed photo panel meets the design
      if (win.x > 0) svgFront.push(`<rect x="${win.x - 2}" y="${win.y}" width="4" height="${win.h}" fill="${look.accent}"/>`);
      if (win.x + win.w < W) svgFront.push(`<rect x="${win.x + win.w - 2}" y="${win.y}" width="4" height="${win.h}" fill="${look.accent}"/>`);
      if (win.y + win.h < H) svgFront.push(`<rect x="${win.x}" y="${win.y + win.h - 2}" width="${win.w}" height="4" fill="${look.accent}"/>`);
    }
    if (trim === 'stack') {
      const cx = win.x + win.w / 2; const cy = win.y + win.h / 2;
      for (const [deg, paper] of [[-6, look.paper[1]], [3.5, look.paper[0]]]) {
        const shadow = `<rect x="${win.x + 8}" y="${win.y + 14}" width="${win.w}" height="${win.h}" fill="rgba(0,0,0,${look.tone === 'dark' ? 0.35 : 0.16})" transform="rotate(${deg} ${cx} ${cy})"/>`;
        back.push({ input: await sharp(svg(W, H, shadow)).blur(14).png().toBuffer(), left: 0, top: 0 });
        svgBack.push(`<rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" fill="${paper}" transform="rotate(${deg} ${cx} ${cy})"/>`);
      }
    }
    if (trim === 'mat') {
      const f = plan.frame; const t = f.moulding || 0;
      if (t) svgBack.push(`<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="${look.frame}"/>`);
      svgBack.push(`<rect x="${f.x + t}" y="${f.y + t}" width="${f.w - 2 * t}" height="${f.h - 2 * t}" fill="${look.mat}"/>`);
      // the bevel of the mat's opening
      svgFront.push(`<rect x="${win.x - 3}" y="${win.y - 3}" width="${win.w + 6}" height="${win.h + 6}" fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity="0.9"/>`);
      svgFront.push(`<rect x="${win.x - 4.5}" y="${win.y - 4.5}" width="${win.w + 9}" height="${win.h + 9}" fill="none" stroke="#000" stroke-width="1" stroke-opacity="0.12"/>`);
    }
  }
  return {
    back: [...back, ...(svgBack.length ? [{ input: svg(W, H, svgBack.join('')), left: 0, top: 0 }] : [])],
    front: svgFront.length ? [{ input: svg(W, H, svgFront.join('')), left: 0, top: 0 }] : [],
  };
}

// The designed background (1080×1350) + the store's photos → the finished post.
// `photos`/`analyses` line up with plan.plans (cover first).
export async function composePost(art, plan, photos, analyses, look) {
  const { w: W, h: H } = CANVAS;
  const trims = await trimsFor(plan, look);
  const layers = [...trims.back];
  for (let i = 0; i < plan.plans.length; i++) {
    const p = plan.plans[i];
    layers.push({ input: await windowPixels(photos[i], analyses[i], p), left: Math.round(p.win.x), top: Math.round(p.win.y) });
  }
  layers.push(...trims.front);
  const fitted = (await Promise.all(layers.map((l) => visible(l, W, H)))).filter(Boolean);
  return sharp(art).resize(W, H, { fit: 'fill' }).composite(fitted).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

// ─── The guide the model designs around ─────────────────────────────────────
// Mid grey = the design area; light grey = exactly where photos and their frames go.
// A '2:3' engine image is cut to 4:5 afterwards, so its guide marks those bands dark.
export async function guideImage(plan, frame = '4:5') {
  const E = frame === '2:3' ? { w: 1024, h: 1536 } : { w: 1024, h: 1280 };
  const k = E.w / CANVAS.w;
  const top = (E.h - CANVAS.h * k) / 2;
  const at = (b) => ({ ...b, x: b.x * k, y: b.y * k + top, w: b.w * k, h: b.h * k, r: (b.r || 0) * k });
  const zones = footprintOf(plan).map((b) => `${pathAt(at(b))} fill="#9c9c9c"/>`).join('');
  const bands = top > 0 ? `<rect x="0" y="0" width="${E.w}" height="${top}" fill="#2e2e2e"/><rect x="0" y="${E.h - top}" width="${E.w}" height="${top}" fill="#2e2e2e"/>` : '';
  const jpeg = await sharp(svg(E.w, E.h, `<rect width="100%" height="100%" fill="#6e6e6e"/>${zones}${bands}`)).jpeg({ quality: 90 }).toBuffer();
  return { data: jpeg.toString('base64'), mimeType: 'image/jpeg' };
}

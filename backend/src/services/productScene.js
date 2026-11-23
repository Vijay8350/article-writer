import sharp from 'sharp';
import { CANVAS } from '../lib/postDesigns.js';

// Scene posts: the image model designs a whole new scene (backdrop, set, frame, props,
// light and text) around the store's REAL product. It is shown the product photo where
// the product will stand, on the photo's own plain backdrop, and replaces everything
// else. Afterwards the product is found again in the model's picture and the real
// photo's pixels are laid back over it, so its design can't change whatever the model
// drew. What can't be laid back safely fails the attempt instead (fail closed): a
// product the model moved, turned or broke apart, or a stone or pale part it changed.
// Plain-backdrop photos only (lib/postScenes.js plans where the product goes).

const { w: W, h: H } = CANVAS;
const FEATHER = 40;        // px over which an uncut side of the photo fades into the canvas backdrop...
const FEATHER_SHARE = 0.5; // ...at most half the empty margin there, so the product is never faded
const NOISE = 10;          // colour distance from the backdrop still counted as backdrop
const CHROMA = 45;         // this much colour (max - min channel) is the product's own colour...
const LIGHT = 175;         // ...unless it's lighter than this luma
const SMOOTH = 8;          // ...and smoother than this (3×3 luma range): a tinted reflection
const DEEP = 90;           // luma at or below this is the product (a stone, dark metal)
const DETAIL = 40;         // a 3×3 luma range at least this, inside the product, is its own detail
const SPECK = 12;          // certain specks smaller than this (px) are noise in a shadow
const STRUCTURE = 12;      // mean 3×3 luma range inside a pale region: facets (a stone, silver)
const STONE_MIN = 30;      // px: smaller pale regions are judged by the model's agreement only
const HOLE_MAX = 200;      // px: a facet patch this small, enclosed by a stone and its setting, is the stone's...
const STONE_BORDER = 0.3;  // ...when at least this share of its border is the stone
const AGREE = 26;          // a pale region the model kept within this mean colour distance...
const AGREE_TAIL = 0.15;   // ...with at most this share further off than 2 × AGREE, is the product's
const LOCAL = 1.5;         // px: how far each region may sit off the overall fit (sub-pixel drift)
const ODD = 60;            // a smooth pale part painted this far from both the photo and the scene...
const ODD_MIN = 1500;      // ...over at least this many px fails (the model recoloured a pearl)
const SHIFT_MIN = 300;     // px: a pale part this big that matches only a few px away was moved...
const SHIFT_RANGE = 24;    // ...looked for this far around its place (3 px steps)
const SHIFT_GAIN = 0.6;    // ...when it matches there this much better (mean colour distance)...
const SHIFT_DIFF = 6;      // ...and by at least this much
const DISAGREE = 60;       // a certain pixel this far from the model's (blurred) was drawn differently
const BODY_RUN = 3;        // agreeing certain pixels in a row (per column) = the product's body
const MIRROR = 0.45;       // brightness correlation with the product mirrored above = a reflection...
const MIRROR_PALE = 0.9;   // ...that is paler than what it mirrors
const AXIS = 12;           // px below the lowest kept part of the product the floor line may lie
const SOFTER = 0.5;        // a softer group than this share of the body's sharpness...
const FADED = 0.75;        // ...and paler than this share of what it mirrors is a soft reflection
const MIN_MATCH = 0.6;     // how closely the model's product must match the real one (NCC)
const PIECE_SHIFT = 2;     // px: a part of the product found this far from the fit has moved
const PIECE_GAIN = 0.04;   // ...when the better spot also matches clearly better
const BLUR = 1.5;          // pictures are compared slightly blurred: fine texture never lines up
const COLOUR_BLUR = 1.2;   // the same for the colour comparisons
const OUTLINE = 4;         // px around the product whose edges are matched too (its outline)
const FLAT = 6;            // a product whose brightness varies less than this (sd) has no texture
const WEAK = 0.2;          // certain pixels under this share of the product: anchor on all of it
const COARSE = { range: 72, step: 6, scales: [0.92, 0.95, 0.98, 1, 1.02, 1.05, 1.08], points: 2000 };
// around the coarse best: scale ±2%, the picture stretched up to 3% one way, shift ±6 px
const MID = { scales: [0.98, 0.99, 1, 1.01, 1.02], stretches: [0.97, 0.98, 0.99, 1, 1.01, 1.02, 1.03], range: 6, step: 2 };
const FINE = { scales: [0.995, 1, 1.005], stretches: [0.995, 1, 1.005], range: 2, step: 0.5, points: 6000 };

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const NONE = 0; const CERTAIN = 1; const DOUBT = 2;
const clampX = (x) => (x < 0 ? 0 : x >= W ? W - 1 : x);
const clampY = (y) => (y < 0 ? 0 : y >= H ? H - 1 : y);

// The photo's plain backdrop, in words for the prompt (analysePhoto only calls light ones plain).
export function backdropName({ r, g, b }) {
  if (Math.max(r, g, b) - Math.min(r, g, b) > 10) return 'light-coloured';
  return (r + g + b) / 3 >= 238 ? 'white' : 'light grey';
}

// ─── The stage the model edits ──────────────────────────────────────────────

// The photo at its place on a canvas of its own backdrop colour. `place` = { s, x, y, w, h }
// in canvas px. An uncut side fades into the canvas within the photo's empty margin only;
// a side the photographer cut sits on the canvas edge and isn't faded.
async function stageCanvas(photoBuf, info, place) {
  const B = info.backdrop;
  const rgb = await sharp(photoBuf).rotate().resize(place.w, place.h, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const canvas = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { canvas[i * 3] = B.r; canvas[i * 3 + 1] = B.g; canvas[i * 3 + 2] = B.b; }
  const s = place.w / info.width;
  const margin = { l: info.box.left * s, r: (info.width - info.box.right) * s, t: info.box.top * s, b: (info.height - info.box.bottom) * s };
  const cut = { l: info.edges.left, r: info.edges.right, t: info.edges.top, b: info.edges.bottom };
  const fade = Object.fromEntries(Object.keys(margin).map((k) => [k, cut[k] ? 0 : Math.max(0, Math.min(FEATHER, margin[k] * FEATHER_SHARE))]));
  const ramp = (d, f) => (f <= 0 ? 1 : Math.min(1, Math.max(0, d / f)));
  for (let py = 0; py < place.h; py++) {
    const Y = place.y + py;
    if (Y < 0 || Y >= H) continue;
    const ry = ramp(py, fade.t) * ramp(place.h - 1 - py, fade.b);
    for (let px = 0; px < place.w; px++) {
      const X = place.x + px;
      if (X < 0 || X >= W) continue;
      const a = ry * ramp(px, fade.l) * ramp(place.w - 1 - px, fade.r);
      const si = (py * place.w + px) * 3; const di = (Y * W + X) * 3;
      for (let k = 0; k < 3; k++) canvas[di + k] = Math.round(rgb[si + k] * a + canvas[di + k] * (1 - a));
    }
  }
  return canvas;
}

// Connected regions (8-neighbour) of pixels in `kind` → label per pixel (0 = none) + sizes.
function regions(kind, want, rect) {
  const labels = new Int32Array(W * H);
  const sizes = [0];
  const stack = [];
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const start = y * W + x;
      if (kind[start] !== want || labels[start]) continue;
      const label = sizes.length; let size = 0;
      labels[start] = label; stack.push(start);
      while (stack.length) {
        const i = stack.pop(); size++;
        const cx = i % W; const cy = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = cy + dy;
          if (yy < rect.y0 || yy >= rect.y1) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = cx + dx;
            if (xx < rect.x0 || xx >= rect.x1) continue;
            const j = yy * W + xx;
            if (kind[j] === want && !labels[j]) { labels[j] = label; stack.push(j); }
          }
        }
      }
      sizes.push(size);
    }
  }
  return { labels, sizes };
}

// Sorts the photo's pixels: CERTAIN = surely the product (strongly coloured, deep, or a
// detail inside it), always laid back unless it turns out to be a mirror reflection under
// it; DOUBT = could be the product (a pearl, a pale stone, silver) or could be the
// photo's own shadow, a reflection on its white surface or the backdrop seen through a
// gap; NONE = backdrop. Pixels on the canvas edge are judged too (with the edge
// repeated), so a product the photographer cut reaches the edge of the post.
function classify(canvas, B, rect) {
  const kind = new Uint8Array(W * H);
  const dist = new Float32Array(W * H);
  const lum = new Float32Array(W * H);
  const range = new Float32Array(W * H);
  const core = new Uint8Array(W * H);
  const chromaB = Math.max(B.r, B.g, B.b) - Math.min(B.r, B.g, B.b);
  const gx0 = Math.max(0, rect.x0 - 1); const gx1 = Math.min(W, rect.x1 + 1);
  const gy0 = Math.max(0, rect.y0 - 1); const gy1 = Math.min(H, rect.y1 + 1);
  for (let y = gy0; y < gy1; y++) {
    for (let x = gx0; x < gx1; x++) {
      const i = y * W + x; const r = canvas[i * 3]; const g = canvas[i * 3 + 1]; const b = canvas[i * 3 + 2];
      dist[i] = Math.hypot(r - B.r, g - B.g, b - B.b);
      lum[i] = luma(r, g, b);
    }
  }
  const at = (x, y) => lum[clampY(y) * W + clampX(x)];
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * W + x;
      if (dist[i] <= NOISE) continue;
      let lo = 255; let hi = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = at(x + dx, y + dy); if (v < lo) lo = v; if (v > hi) hi = v; }
      range[i] = hi - lo;
      const r = canvas[i * 3]; const g = canvas[i * 3 + 1]; const b = canvas[i * 3 + 2];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b) - chromaB;
      const reflection = lum[i] > LIGHT && range[i] < SMOOTH;
      core[i] = (chroma >= CHROMA && !reflection) || lum[i] <= DEEP ? 1 : 0;
    }
  }
  // Plus the fine detail INSIDE it (a sparkle on textured metal): a sharp pixel mostly
  // surrounded by the product. A pale pixel just outside an edge is sharp too, but sits
  // beside the old backdrop, so it stays in doubt.
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * W + x;
      if (dist[i] <= NOISE) continue;
      let around = 0;
      if (!core[i] && range[i] >= DETAIL) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) around += core[clampY(y + dy) * W + clampX(x + dx)];
      kind[i] = core[i] || around >= 5 ? CERTAIN : DOUBT;
    }
  }
  // A few stray "certain" pixels in a shadow are noise, not product.
  const specks = regions(kind, CERTAIN, rect);
  for (let i = 0; i < W * H; i++) if (specks.labels[i] && specks.sizes[specks.labels[i]] < SPECK) kind[i] = DOUBT;
  // How sharp each certain pixel is (Laplacian): a soft reflection is softer than the product.
  const sharpness = new Float32Array(W * H);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * W + x;
      if (kind[i] === CERTAIN) sharpness[i] = Math.abs(4 * lum[i] - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1));
    }
  }
  return { kind, dist, range, sharpness };
}

// The pale regions, and which of them are part of the product's body. Pale pixels are
// split at the product's base (the lowest certain pixel of each column): above it they
// are inside the product; at or below it they lie on the floor (a shadow, a reflection),
// and a region never spans both. Inside AND faceted (detail all through it) is a stone or
// silver: always the product, laid back whatever the model drew. A smooth region inside
// (a pearl, enamel, or the backdrop seen through a hoop) is decided by what the model
// drew there. Small backdrop-white facets enclosed by a stone join it.
const FLOOR = 3;
function paleParts(kind, range, rect) {
  const base = new Int32Array(W).fill(-1);
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) if (kind[y * W + x] === CERTAIN) base[x] = y;
  const side = new Uint8Array(W * H);
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) { const i = y * W + x; if (kind[i] === DOUBT) side[i] = y < base[x] ? DOUBT : FLOOR; }
  const up = regions(side, DOUBT, rect); const down = regions(side, FLOOR, rect);
  const firstFloor = up.sizes.length;
  const labels = up.labels;
  for (let i = 0; i < W * H; i++) if (down.labels[i]) labels[i] = firstFloor - 1 + down.labels[i];
  const doubt = { labels, sizes: [...up.sizes, ...down.sizes.slice(1)] };
  const n = doubt.sizes.length;
  const inner = new Uint32Array(n); const innerRange = new Float64Array(n);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * W + x; const l = labels[i];
      if (!l) continue;
      let alone = true;
      for (let dy = -1; dy <= 1 && alone; dy++) for (let dx = -1; dx <= 1; dx++) if (labels[clampY(y + dy) * W + clampX(x + dx)] !== l) { alone = false; break; }
      if (alone) { inner[l]++; innerRange[l] += range[i]; }
    }
  }
  const inside = new Uint8Array(n); const stone = new Uint8Array(n);
  for (let l = 1; l < n; l++) {
    inside[l] = l < firstFloor ? 1 : 0;
    const structure = inner[l] >= 15 ? innerRange[l] / inner[l] : 0;
    stone[l] = inside[l] && doubt.sizes[l] >= STONE_MIN && structure >= STRUCTURE ? 1 : 0;
  }
  // A stone's white or smooth facets: a small patch that isn't surely product, enclosed by
  // product, a good part of it the stone itself, belongs to the stone. A gap between chain
  // links, closed by metal alone, stays the model's scene.
  const loose = new Uint8Array(W * H);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) { const i = y * W + x; if (kind[i] === NONE || (kind[i] === DOUBT && !stone[labels[i]])) loose[i] = 1; }
  }
  const holes = regions(loose, 1, rect);
  const touches = new Uint32Array(holes.sizes.length); const byStone = new Uint32Array(holes.sizes.length);
  const open = new Uint8Array(holes.sizes.length);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const h = holes.labels[y * W + x];
      if (!h || holes.sizes[h] > HOLE_MAX) continue;
      if (x === rect.x0 || y === rect.y0 || x === rect.x1 - 1 || y === rect.y1 - 1) open[h] = 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = clampY(y + dy) * W + clampX(x + dx);
          if (loose[j]) continue;
          touches[h]++; // the patch's border is product: a stone or certain metal
          if (kind[j] === DOUBT) byStone[h]++;
        }
      }
    }
  }
  const holeStone = new Uint8Array(holes.sizes.length);
  for (let h = 1; h < holes.sizes.length; h++) holeStone[h] = holes.sizes[h] <= HOLE_MAX && !open[h] && byStone[h] >= STONE_BORDER * touches[h] ? 1 : 0;
  return { doubt, inside, stone, holes: holes.labels, holeStone };
}

// Two views of a picture for finding the product in it: its brightness, slightly blurred
// (fine texture never lines up exactly), and the strength of its edges, which shows the
// product's outline whatever is behind it (a dark new scene as well as the old white).
async function views(rgb) {
  const l = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) l[i] = Math.round(luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]));
  // (sharp hands a one-channel image back as three unless told otherwise)
  const lum = await sharp(l, { raw: { width: W, height: H, channels: 1 } }).blur(BLUR).extractChannel(0).raw().toBuffer();
  const edges = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) { const i = y * W + x; edges[i] = Math.hypot(lum[i + 1] - lum[i - 1], lum[i + W] - lum[i - W]); }
  }
  return { lum, edges };
}

const softColours = (rgb) => sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).blur(COLOUR_BLUR).raw().toBuffer();

// `mask` grown by R px in every direction (rows, then columns), within rect ± R.
function grow(mask, rect, R) {
  const x0 = Math.max(0, rect.x0 - R); const x1 = Math.min(W, rect.x1 + R);
  const y0 = Math.max(0, rect.y0 - R); const y1 = Math.min(H, rect.y1 + R);
  const row = new Uint8Array(W * H); const out = new Uint8Array(W * H);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!mask[y * W + x]) continue;
      for (let k = Math.max(x0, x - R); k <= Math.min(x1 - 1, x + R); k++) row[y * W + k] = 1;
    }
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!row[y * W + x]) continue;
      for (let k = Math.max(y0, y - R); k <= Math.min(y1 - 1, y + R); k++) out[k * W + x] = 1;
    }
  }
  return out;
}

// Up to `want` points spread evenly over a mask (within rect ± R), each with its value in `view`.
function spread(mask, view, rect, want, R = 0) {
  const all = [];
  for (let y = Math.max(1, rect.y0 - R); y < Math.min(H - 1, rect.y1 + R); y += 2) {
    for (let x = Math.max(1, rect.x0 - R); x < Math.min(W - 1, rect.x1 + R); x += 2) if (mask[y * W + x]) all.push(y * W + x);
  }
  const step = Math.max(1, all.length / want);
  const pts = [];
  for (let k = 0; k < all.length; k += step) { const i = all[Math.floor(k)]; pts.push([i % W, (i / W) | 0, view[i]]); }
  return pts;
}

// The points the product is found by. outline: edge strength over the product and a band
// just around it. texture: brightness well inside it, away from its edges (where the old
// backdrop blurs in); none for a flat-coloured product. The product here is its certain
// pixels, or, when those are few (silver, pearls, clear stones), all of its body.
function anchors(body, v, rect, want) {
  const outline = spread(grow(body, rect, OUTLINE), v.edges, rect, want, OUTLINE);
  const away = grow(Uint8Array.from(body, (b) => 1 - b), rect, OUTLINE);
  const deep = Uint8Array.from(body, (b, i) => (b && !away[i] ? 1 : 0));
  let texture = spread(deep, v.lum, rect, want);
  const mean = texture.reduce((a, p) => a + p[2], 0) / (texture.length || 1);
  const sd = Math.sqrt(texture.reduce((a, p) => a + (p[2] - mean) ** 2, 0) / (texture.length || 1));
  if (texture.length < 200 || sd < FLAT) texture = [];
  return { outline, texture };
}

// What the model is given: the stage at the engine's size. A '2:3' engine is shown the
// 4:5 stage between dark bands that are cut off afterwards (igMedia.toPortraitJpeg).
async function engineInput(canvas, frame) {
  const stage = sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).resize(1024, 1280);
  let jpeg;
  if (frame === '2:3') {
    const inner = await stage.png().toBuffer();
    jpeg = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#2e2e2e' } })
      .composite([{ input: inner, left: 0, top: 128 }]).jpeg({ quality: 94 }).toBuffer();
  } else jpeg = await stage.jpeg({ quality: 94 }).toBuffer();
  return { data: jpeg.toString('base64'), mimeType: 'image/jpeg' };
}

// Everything about one product on its stage. `place` comes from lib/postScenes.js
// ({ s, x, y, w, h } of the photo, `box` = the product's box, all in canvas px).
export async function buildStage(photoBuf, info, place, frame = '4:5') {
  const canvas = await stageCanvas(photoBuf, info, place);
  const rect = { x0: Math.max(0, place.x), y0: Math.max(0, place.y), x1: Math.min(W, place.x + place.w), y1: Math.min(H, place.y + place.h) };
  const { kind, dist, range, sharpness } = classify(canvas, info.backdrop, rect);
  const pale = paleParts(kind, range, rect);
  // the product's body: certain pixels, its stones, and the pale parts inside it
  const body = new Uint8Array(W * H); let certain = 0; let all = 0;
  for (let i = 0; i < W * H; i++) {
    if (kind[i] === CERTAIN) { certain++; all++; body[i] = 1; } else if (kind[i] === DOUBT && pale.inside[pale.doubt.labels[i]]) all++;
  }
  if (certain < WEAK * all || certain < 600) for (let i = 0; i < W * H; i++) if (kind[i] === DOUBT && pale.inside[pale.doubt.labels[i]]) body[i] = 1;
  const v = await views(canvas);
  const box = place.box;
  return {
    canvas, soft: await softColours(canvas), lum: v.lum, kind, dist, sharpness, rect, pale, backdrop: info.backdrop, edges: { ...info.edges },
    box: { left: Math.max(0, box.left), top: Math.max(0, box.top), right: Math.min(W, box.right), bottom: Math.min(H, box.bottom) },
    centre: { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 },
    coarse: anchors(body, v, rect, COARSE.points),
    fine: anchors(body, v, rect, FINE.points),
    input: frame ? await engineInput(canvas, frame) : null,
  };
}

// Just the picture the model is given (cheap: no masks), for the minutes it spends drawing.
export async function stageImage(photoBuf, info, place, frame = '4:5') {
  return engineInput(await stageCanvas(photoBuf, info, place), frame);
}

// The stage's masks take ~150 MB while a paste runs, so they're built only then, and one
// paste at a time across the whole process (a daily job and a manual post at once, or a
// carousel, never add up on the small server). → pasteProduct's result.
let pasting = Promise.resolve();
export function layProductBack(art, photoBuf, info, place) {
  const run = pasting.then(async () => pasteProduct(art, await buildStage(photoBuf, info, place, null)));
  pasting = run.catch(() => {});
  return run;
}

// ─── Finding the product in the model's picture ────────────────────────────

// Where a stage point lands in the model's picture under fit t (x scale sc, y scale sy
// about the product's centre, then the shift).
const mapX = (c, t, x) => c.x + t.sc * (x - c.x) + t.dx;
const mapY = (c, t, y) => c.y + t.sy * (y - c.y) + t.dy;

// How well points of the real product match a view of the picture under fit t:
// normalised cross-correlation.
function matchAt(art, pts, c, t) {
  if (!pts.length) return -1;
  let n = 0; let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0;
  for (const [x, y, v] of pts) {
    const X = mapX(c, t, x); const Y = mapY(c, t, y);
    if (X < 0 || Y < 0 || X >= W - 1 || Y >= H - 1) continue;
    const xi = X | 0; const yi = Y | 0; const fx = X - xi; const fy = Y - yi; const i = yi * W + xi;
    const o = art[i] * (1 - fx) * (1 - fy) + art[i + 1] * fx * (1 - fy) + art[i + W] * (1 - fx) * fy + art[i + W + 1] * fx * fy;
    n++; sa += v; sb += o; saa += v * v; sbb += o * o; sab += v * o;
  }
  if (n < pts.length * 0.9) return -1; // most of the product would be off the canvas
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2; const vb = sbb / n - (sb / n) ** 2;
  return cov / Math.sqrt(va * vb + 1e-6);
}

// Whichever of its texture or its outline matches better (a flat product has only its
// outline; a textured one is told apart best by its texture).
const scoreOf = (art, set, c, t) => Math.max(matchAt(art.lum, set.texture, c, t), matchAt(art.edges, set.outline, c, t));

// The fit that best puts the real product on the model's drawing of it. Three rounds: a
// coarse grid; then around it, finer and with the picture stretched a few percent one
// way (an engine whose frame isn't exactly 4:5, like Gemini's 896×1152, may have drawn
// it so); then to half a pixel. → { r, sc, sy, dx, dy }.
export function register(art, stage) {
  const c = stage.centre;
  let best = { r: -2, sc: 1, sy: 1, dx: 0, dy: 0 };
  if (!stage.coarse.outline.length) return best;
  const tryAll = (set, candidates) => {
    for (const t of candidates) { const r = scoreOf(art, set, c, t); if (r > best.r) best = { ...t, r }; }
  };
  const around = function* (t, { scales, stretches, range, step }) {
    for (const ks of scales) for (const k of stretches) {
      for (let x = -range; x <= range + 1e-9; x += step) for (let y = -range; y <= range + 1e-9; y += step) yield { sc: t.sc * ks, sy: t.sy * ks * k, dx: t.dx + x, dy: t.dy + y };
    }
  };
  tryAll(stage.coarse, around(best, { scales: COARSE.scales, stretches: [1], range: COARSE.range, step: COARSE.step }));
  tryAll(stage.coarse, around(best, MID));
  tryAll(stage.fine, around(best, FINE));
  return best;
}

// One fit can't hide a part that moved: each ninth of the product (3×3 tiles of its box)
// is looked for on its own around the fit. A tile that matches clearly better a couple
// of px away means a piece moved or the product turned, and laying it back would leave a
// double edge. → problem text or null.
function movedPiece(art, stage, fit) {
  const c = stage.centre; const { box } = stage;
  const tw = (box.right - box.left) / 3; const th = (box.bottom - box.top) / 3;
  for (let ty = 0; ty < 3; ty++) {
    for (let tx = 0; tx < 3; tx++) {
      const inTile = ([x, y]) => x >= box.left + tx * tw && x < box.left + (tx + 1) * tw && y >= box.top + ty * th && y < box.top + (ty + 1) * th;
      const set = { outline: stage.fine.outline.filter(inTile), texture: stage.fine.texture.filter(inTile) };
      if (set.outline.length < 120) continue;
      if (set.texture.length < 120) set.texture = [];
      const here = scoreOf(art, set, c, fit);
      let best = { r: here, dx: 0, dy: 0 };
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          const r = scoreOf(art, set, c, { ...fit, dx: fit.dx + dx, dy: fit.dy + dy });
          if (r > best.r) best = { r, dx, dy };
        }
      }
      if (Math.hypot(best.dx, best.dy) >= PIECE_SHIFT && best.r - here >= PIECE_GAIN) {
        return `Part of the product moved or turned in the AI image (by about ${Math.round(Math.hypot(best.dx, best.dy))} px): it must stay exactly as in the photo.`;
      }
    }
  }
  return null;
}

// ─── Laying the real product back ───────────────────────────────────────────

// A colour of a soft (blurred) picture at a fractional position, bilinear, into `out`.
const scratch = new Float64Array(3);
function colourAt(img, X, Y, out = scratch) {
  const xi = Math.floor(X); const yi = Math.floor(Y); const fx = X - xi; const fy = Y - yi;
  const a = (clampY(yi) * W + clampX(xi)) * 3; const b = (clampY(yi) * W + clampX(xi + 1)) * 3;
  const c = (clampY(yi + 1) * W + clampX(xi)) * 3; const d = (clampY(yi + 1) * W + clampX(xi + 1)) * 3;
  const w0 = (1 - fx) * (1 - fy); const w1 = fx * (1 - fy); const w2 = (1 - fx) * fy; const w3 = fx * fy;
  for (let k = 0; k < 3; k++) out[k] = img[a + k] * w0 + img[b + k] * w1 + img[c + k] * w2 + img[d + k] * w3;
  return out;
}
const outside = (X, Y) => X < 0 || Y < 0 || X > W - 1 || Y > H - 1;

// How each pale region compares with the model's drawing (both slightly blurred), at the
// fit and up to LOCAL px around it (each region may drift a little on its own): its best
// mean colour distance and the share of it further off than 2 × AGREE there, plus the
// model's mean colour over it and the photo's.
function paleAgreement(stage, soft, fit) {
  const { pale, rect, centre: c } = stage;
  const { labels, sizes } = pale.doubt;
  const n = sizes.length;
  const pixels = Array.from({ length: n }, () => []);
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) { const l = labels[y * W + x]; if (l) pixels[l].push(y * W + x); }
  const out = [];
  for (let l = 1; l < n; l++) {
    const all = pixels[l];
    const sample = all.length > 4000 ? all.filter((_, k) => k % Math.ceil(all.length / 4000) === 0) : all;
    const meanAt = (ox, oy, list) => {
      let sum = 0; let far = 0; const model = [0, 0, 0]; const photo = [0, 0, 0];
      for (const i of list) {
        const x = i % W; const y = (i / W) | 0;
        const X = mapX(c, fit, x) + ox; const Y = mapY(c, fit, y) + oy;
        if (outside(X, Y)) { sum += 255; far++; continue; }
        const m = colourAt(soft, X, Y); const p0 = stage.soft[i * 3]; const p1 = stage.soft[i * 3 + 1]; const p2 = stage.soft[i * 3 + 2];
        const d = Math.hypot(p0 - m[0], p1 - m[1], p2 - m[2]);
        sum += d; if (d > 2 * AGREE) far++;
        model[0] += m[0]; model[1] += m[1]; model[2] += m[2]; photo[0] += p0; photo[1] += p1; photo[2] += p2;
      }
      return { mean: sum / list.length, far: far / list.length, model: model.map((v) => v / list.length), photo: photo.map((v) => v / list.length) };
    };
    let best = { mean: Infinity }; let bo = [0, 0];
    for (let ox = -LOCAL; ox <= LOCAL + 1e-9; ox += 0.5) {
      for (let oy = -LOCAL; oy <= LOCAL + 1e-9; oy += 0.5) {
        const r = meanAt(ox, oy, sample);
        if (r.mean < best.mean) { best = r; bo = [ox, oy]; }
      }
    }
    out[l] = sample.length === all.length ? best : meanAt(bo[0], bo[1], all);
    // A sizeable part inside the product that matches clearly better a few px away than
    // where it should be: the model moved it (a pearl slid along its setting). A smooth
    // pearl still half-matches in place, so it's the comparison that tells.
    if (pale.inside[l] && sizes[l] >= SHIFT_MIN) {
      const few = all.length > 1500 ? all.filter((_, k) => k % Math.ceil(all.length / 1500) === 0) : all;
      const here = meanAt(bo[0], bo[1], few).mean;
      let moved = null;
      for (let ox = -SHIFT_RANGE; ox <= SHIFT_RANGE; ox += 3) {
        for (let oy = -SHIFT_RANGE; oy <= SHIFT_RANGE; oy += 3) {
          if (Math.hypot(ox, oy) < 3) continue;
          const r = meanAt(ox, oy, few);
          if (r.mean <= AGREE && r.far <= AGREE_TAIL && r.mean < SHIFT_GAIN * here && here - r.mean >= SHIFT_DIFF && (!moved || r.mean < moved.mean)) moved = { ...r, ox, oy };
        }
      }
      out[l].moved = moved;
    }
  }
  return out;
}

// The model's colour of the scene right around a pale region: what it painted where the
// photo showed plain backdrop, within 12 px of the region (inside a hoop, that's the
// scene seen through it). null if there's too little of it to tell.
function sceneAround(stage, soft, fit, l) {
  const { pale, kind, rect, centre: c } = stage;
  let x0 = W; let y0 = H; let x1 = 0; let y1 = 0;
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) if (pale.doubt.labels[y * W + x] === l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sum = [0, 0, 0]; let count = 0;
  for (let y = Math.max(0, y0 - 12); y <= Math.min(H - 1, y1 + 12); y += 2) {
    for (let x = Math.max(0, x0 - 12); x <= Math.min(W - 1, x1 + 12); x += 2) {
      if (kind[y * W + x] !== NONE || pale.holeStone[pale.holes[y * W + x]]) continue;
      const X = mapX(c, fit, x); const Y = mapY(c, fit, y);
      if (outside(X, Y)) continue;
      const m = colourAt(soft, X, Y); sum[0] += m[0]; sum[1] += m[1]; sum[2] += m[2]; count++;
    }
  }
  return count >= 30 ? sum.map((v) => v / count) : null;
}

// Which pale regions are laid back, and what can't be: a stone (faceted, inside the
// product) always is, so a stone the model redrew or recoloured is covered by the real
// one; a smooth one only where the model kept it (a pearl it kept is the real pearl; the
// backdrop seen through a hoop, or a shadow, that it replaced stays replaced). A smooth
// part inside the product painted as neither the photo's colour nor the scene's around
// it was recoloured (a pink pearl): that fails the attempt.
function judgePale(stage, soft, fit) {
  const { pale } = stage;
  const agree = paleAgreement(stage, soft, fit);
  const keep = new Uint8Array(pale.doubt.sizes.length);
  const problems = [];
  for (let l = 1; l < pale.doubt.sizes.length; l++) {
    const a = agree[l]; const size = pale.doubt.sizes[l];
    const kept = a.mean <= AGREE && a.far <= AGREE_TAIL;
    if (pale.stone[l]) { keep[l] = 1; continue; }
    keep[l] = kept ? 1 : 0;
    if (a.moved) problems.push(`Part of the product moved in the AI image (by about ${Math.round(Math.hypot(a.moved.ox, a.moved.oy))} px): it must stay exactly as in the photo.`);
    if (!kept && pale.inside[l] && size >= ODD_MIN) {
      const scene = sceneAround(stage, soft, fit, l);
      const far = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (scene && far(a.model, scene) > ODD && far(a.model, a.photo) > ODD) problems.push('The image model recoloured a pale part of the product (a pearl, enamel or a white stone): it must stay exactly as in the photo.');
    }
  }
  return { keep, problems: [...new Set(problems)] };
}

// A studio photo's mirror reflection under the product: as coloured as the product, but
// on the old glossy surface, where the model (rightly) paints the new scene. Per column,
// the certain pixels below the lowest part of the product the model kept, which the
// model drew differently, form groups; a group is a reflection if, about a floor line
// just under that part, it is a paler mirrored copy of the product above it, or softer
// and much paler than what it mirrors.
// Anything else down there is a real part (a dangling drop the model left out) and is
// laid back. → mask of reflection pixels.
function reflections(stage, soft, fit) {
  const { kind, sharpness, lum, dist, rect, centre: c } = stage;
  const disputed = new Uint8Array(W * H);
  const contact = new Int32Array(W).fill(-1); // per column: the lowest kept body pixel
  let bodySharp = 0; let bodyCount = 0;
  const differs = (i, x, y) => {
    const X = mapX(c, fit, x); const Y = mapY(c, fit, y);
    if (outside(X, Y)) return true;
    const m = colourAt(soft, X, Y);
    return Math.hypot(stage.soft[i * 3] - m[0], stage.soft[i * 3 + 1] - m[1], stage.soft[i * 3 + 2] - m[2]) > DISAGREE;
  };
  for (let x = rect.x0; x < rect.x1; x++) {
    let run = 0; const below = []; let lowest = -1;
    for (let y = rect.y1 - 1; y >= rect.y0; y--) {
      const i = y * W + x;
      if (kind[i] !== CERTAIN) continue;
      if (run >= BODY_RUN) { if (run < BODY_RUN + 12) { bodySharp += sharpness[i]; bodyCount++; run++; } continue; }
      if (differs(i, x, y)) { run = 0; below.push(i); lowest = -1; } else { if (!run) lowest = y; run++; bodySharp += sharpness[i]; bodyCount++; }
    }
    if (run >= BODY_RUN) { contact[x] = lowest; for (const i of below) disputed[i] = 1; } // only under a body the model kept
  }
  const surface = new Uint8Array(W * H);
  if (!bodyCount) return surface;
  const body = bodySharp / bodyCount;
  const groups = regions(disputed, 1, rect);
  const n = groups.sizes.length;
  const members = Array.from({ length: n }, () => []);
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) { const g = groups.labels[y * W + x]; if (g) members[g].push(y * W + x); }
  for (let g = 1; g < n; g++) {
    const list = members[g];
    if (list.length < SPECK) continue; // a speck under a kept body: laid back
    let low = -1; // the lowest kept body pixel over the group's columns: the floor line is just below
    for (const i of list) low = Math.max(low, contact[i % W]);
    if (low < 0) continue;
    let sharp = 0;
    for (const i of list) sharp += sharpness[i];
    const softer = sharp / list.length <= SOFTER * body;
    let mirrored = false;
    for (let floor = low; floor <= low + AXIS && !mirrored; floor++) {
      let n2 = 0; let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0; let pale = 0; let solid = 0;
      for (const i of list) {
        const x = i % W; const y = (i / W) | 0;
        const my = 2 * floor + 1 - y; // this row mirrored above the floor line
        if (my < 0 || my >= H || my > floor) continue;
        const j = my * W + x;
        if (kind[j] !== CERTAIN || disputed[j]) continue; // only what the model kept can be mirrored
        const a = lum[i]; const b = lum[j];
        n2++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
        pale += dist[i]; solid += dist[j];
      }
      if (n2 < SPECK || n2 < 0.3 * list.length) continue;
      const cov = sab / n2 - (sa / n2) * (sb / n2);
      const r = cov / Math.sqrt((saa / n2 - (sa / n2) ** 2) * (sbb / n2 - (sb / n2) ** 2) + 1e-6);
      mirrored = (r >= MIRROR && pale <= MIRROR_PALE * solid) || (softer && pale <= FADED * solid);
    }
    if (mirrored) for (const i of list) surface[i] = 1;
  }
  return surface;
}

// How much of each pixel the real product covers: 1 inside, a share at its edges, softened
// inwards only. An edge pixel mixes the product with what was beside it in the photo
// (the white backdrop, or a shadow or reflection on it): that colour is measured next to
// each edge pixel (`under`), so its share can be taken back out (pasteProduct) and the
// old surface never comes back as a pale fringe. Edge pixels of the canvas count too
// (with the edge repeated), so a product the photographer cut runs to the edge of the post.
function pasteAlpha(stage, keep, surface) {
  const { kind, pale, rect, canvas, backdrop: B } = stage;
  const on = new Uint8Array(W * H);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * W + x;
      on[i] = (kind[i] === CERTAIN && !surface[i]) || (kind[i] === DOUBT && keep[pale.doubt.labels[i]])
        || pale.holeStone[pale.holes[i]] ? 1 : 0;
    }
  }
  const at = (arr, x, y) => arr[clampY(y) * W + clampX(x)];
  const raw = new Float32Array(W * H);
  const interior = new Uint8Array(W * H);
  const under = Buffer.alloc(W * H * 3);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * W + x;
      if (!on[i]) continue;
      let inside = true;
      for (let dy = -1; dy <= 1 && inside; dy++) for (let dx = -1; dx <= 1; dx++) if (!at(on, x + dx, y + dy)) { inside = false; break; }
      // a facet laid back with its stone is the stone's: fully covered
      if (inside || pale.holeStone[pale.holes[i]]) { raw[i] = 1; interior[i] = inside ? 1 : 0; continue; }
      // what lay beside it (the mean of the nearby pixels not laid back) and the most
      // product-like pixel near it: its share of product lies between the two
      const bg = [0, 0, 0]; let nb = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const j = clampY(y + dy) * W + clampX(x + dx);
          if (on[j]) continue;
          bg[0] += canvas[j * 3]; bg[1] += canvas[j * 3 + 1]; bg[2] += canvas[j * 3 + 2]; nb++;
        }
      }
      const b = nb ? bg.map((v) => v / nb) : [B.r, B.g, B.b];
      let peak = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const j = clampY(y + dy) * W + clampX(x + dx);
          if (on[j]) peak = Math.max(peak, Math.hypot(canvas[j * 3] - b[0], canvas[j * 3 + 1] - b[1], canvas[j * 3 + 2] - b[2]));
        }
      }
      const own = Math.hypot(canvas[i * 3] - b[0], canvas[i * 3 + 1] - b[1], canvas[i * 3 + 2] - b[2]);
      raw[i] = peak > 0 ? Math.min(1, own / peak) : 1;
      under[i * 3] = Math.round(b[0]); under[i * 3 + 1] = Math.round(b[1]); under[i * 3 + 2] = Math.round(b[2]);
    }
  }
  const alpha = new Float32Array(W * H);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * W + x;
      if (interior[i]) { alpha[i] = 1; continue; }
      if (!raw[i]) continue;
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += at(raw, x + dx, y + dy);
      alpha[i] = Math.min(raw[i], s / 9 + 0.2);
    }
  }
  return { alpha, under };
}

// The model's picture (1080×1350 JPEG) with the real product laid over its drawing of
// it. → { jpeg, match, problems }: any problem means the attempt must not be used (the
// model moved, turned or broke up the product, or changed a stone or pale part of it).
export async function pasteProduct(art, stage) {
  const rgb = await sharp(art).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const v = await views(rgb);
  const match = register(v, stage);
  const problems = [];
  if (match.r < MIN_MATCH) problems.push(`The image model moved or redrew the product (match ${match.r.toFixed(2)}): it must stay exactly as in the photo.`);
  else {
    const moved = movedPiece(v, stage, match);
    if (moved) problems.push(moved);
  }
  const soft = await softColours(rgb);
  const pale = judgePale(stage, soft, match);
  problems.push(...pale.problems);
  const { alpha, under } = pasteAlpha(stage, pale.keep, reflections(stage, soft, match));

  const { canvas, rect, backdrop: B, centre: c, edges } = stage;
  const out = Buffer.from(rgb);
  // the stage pixel under output pixel (X, Y), bilinear, with the canvas edge repeated
  const back = (X, Y) => [c.x + (X - match.dx - c.x) / match.sc, c.y + (Y - match.dy - c.y) / match.sy];
  const corners = [[rect.x0, rect.y0], [rect.x1, rect.y1]].map(([x, y]) => [mapX(c, match, x), mapY(c, match, y)]);
  // a side the photographer cut runs on to the edge of the post
  const X0 = edges.left && rect.x0 === 0 ? 0 : Math.max(0, Math.floor(corners[0][0]) - 1);
  const X1 = edges.right && rect.x1 === W ? W : Math.min(W, Math.ceil(corners[1][0]) + 1);
  const Y0 = edges.top && rect.y0 === 0 ? 0 : Math.max(0, Math.floor(corners[0][1]) - 1);
  const Y1 = edges.bottom && rect.y1 === H ? H : Math.min(H, Math.ceil(corners[1][1]) + 1);
  for (let Y = Y0; Y < Y1; Y++) {
    for (let X = X0; X < X1; X++) {
      const [u, w] = back(X, Y);
      const xi = Math.floor(u); const yi = Math.floor(w); const fx = u - xi; const fy = w - yi;
      const idx = [clampY(yi) * W + clampX(xi), clampY(yi) * W + clampX(xi + 1), clampY(yi + 1) * W + clampX(xi), clampY(yi + 1) * W + clampX(xi + 1)];
      const wts = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const a = alpha[idx[0]] * wts[0] + alpha[idx[1]] * wts[1] + alpha[idx[2]] * wts[2] + alpha[idx[3]] * wts[3];
      if (a <= 0.004) continue;
      const o = (Y * W + X) * 3;
      // what lay beside the product there in the photo (the nearest edge pixel's measure)
      const near = idx[wts.indexOf(Math.max(...wts))];
      const edge = alpha[near] < 1 && (under[near * 3] || under[near * 3 + 1] || under[near * 3 + 2]);
      for (let k = 0; k < 3; k++) {
        const C = canvas[idx[0] * 3 + k] * wts[0] + canvas[idx[1] * 3 + k] * wts[1] + canvas[idx[2] * 3 + k] * wts[2] + canvas[idx[3] * 3 + k] * wts[3];
        // the product's own colour, without the share of the old surface in an edge pixel
        const b = edge ? under[near * 3 + k] : [B.r, B.g, B.b][k];
        const F = Math.min(255, Math.max(0, (C - (1 - a) * b) / a));
        out[o + k] = Math.round(F * a + rgb[o + k] * (1 - a));
      }
    }
  }
  const jpeg = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { jpeg, match, problems, alpha };
}

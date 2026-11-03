import { WORDS } from "./words";

export const PRESETS = [
  { name: "Woodland", colors: ["#223020", "#3e4e2a", "#605836", "#1c1e18", "#766c48"] },
  { name: "Urban", colors: ["#303432", "#585c56", "#202220", "#807e76", "#161816"] },
  { name: "Desert", colors: ["#5c4a30", "#8c744a", "#403222", "#a89060", "#282018"] },
  { name: "Navy", colors: ["#162430", "#28404e", "#485860", "#10161c", "#6e7a80"] },
  { name: "Snow", colors: ["#d9dde2", "#aeb6be", "#7d868e", "#f4f7f8", "#5c656c"] },
  { name: "Jungle", colors: ["#14301c", "#245c32", "#6a7030", "#0e2014", "#8a7840"] },
  { name: "Night", colors: ["#12141c", "#242838", "#3c4258", "#0c0e14", "#6a6278"] },
  { name: "Autumn", colors: ["#6a341c", "#a85a28", "#c48a48", "#3c2418", "#e0c080"] },
  { name: "Stone", colors: ["#6e6a64", "#8e8880", "#4e4a46", "#b2aea6", "#2e2c2a"] },
  { name: "Marsh", colors: ["#3c4630", "#6a6840", "#245058", "#2a261c", "#98a070"] },
] as const;

const WORD_SET = new Set<string>(WORDS);

export function isMnemonicWord(word: string) {
  return WORD_SET.has(word.trim().toLowerCase());
}

export type Visibility = "public" | "private" | "unlisted";

export function randomMnemonic() {
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => WORDS[n % WORDS.length]!).join(" ");
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fingerprint(hex: string) {
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export async function serialBytes(mnemonic: string, name: string, index: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(mnemonic),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`camokey-serial-v1\0${name}\0${index}`),
  );
  return new Uint8Array(sig).slice(0, 16);
}

export function patternId(bytes: Uint8Array) {
  return [...bytes.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function checkPass(password: string) {
  if (password.length < 16) return "Use at least 16 characters.";
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  if (classes < 3) return "Use 3 kinds: small letters, big letters, numbers, symbols.";
  return "";
}

export function cmykToHex(c: number, m: number, y: number, k: number) {
  const ch = (v: number) => Math.round(255 * (1 - v) * (1 - k)).toString(16).padStart(2, "0");
  return `#${ch(c)}${ch(m)}${ch(y)}`;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb(c: [number, number, number]) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function luma(c: [number, number, number]) {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Smallest brightness gap, on a 0–255 scale, that still scanned. */
export const MEASURED_LUMA_GAP = 16;
/** Ten percent stricter than the measured floor. ceil(16 × 1.1). */
export const MIN_LUMA_GAP = 18;
/** Share of the full brightness scale the dyes must keep between darkest and lightest. */
export const MIN_LUMA_PERCENT = (MIN_LUMA_GAP / 255) * 100;

export function colorLuma(hex: string) {
  return luma(hexToRgb(hex));
}

export function lumaSpan(colors: readonly string[]) {
  let lo = 255;
  let hi = 0;
  for (const hex of colors) {
    const value = colorLuma(hex);
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  return hi - lo;
}

/** Ideal print repeat. About the span of a woodland blotch cluster on cloth. */
export const IDEAL_TILE = 320;
const COLS = 12;
const ROWS = 8;
const CELLS = COLS * ROWS;
const SYNC = [1, 0, 1, 1, 0, 0, 1, 0];

export function clothTile(w: number, h: number) {
  return Math.max(48, Math.min(IDEAL_TILE, Math.floor(w / 4), Math.floor(h / 2)));
}

export function clothRepeats(w: number, h: number) {
  const tile = clothTile(w, h);
  return { tile, x: Math.floor(w / tile), y: Math.floor(h / tile) };
}

function crc16(bytes: Uint8Array) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}

function serialSeed(bytes: Uint8Array) {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  return h >>> 0;
}

function organic(
  ctx: CanvasRenderingContext2D,
  tile: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  turn: number,
  color: [number, number, number],
  alpha: number,
  wobble: readonly number[],
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgb(color);
  ctx.beginPath();
  const n = wobble.length;
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  const reach = Math.max(rx, ry) * 1.35;
  for (const ox of [-tile, 0, tile]) {
    for (const oy of [-tile, 0, tile]) {
      const x = cx + ox;
      const y = cy + oy;
      if (x > tile + reach || y > tile + reach || x < -reach || y < -reach) continue;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = Math.cos(a) * rx * wobble[i]!;
        const py = Math.sin(a) * ry * wobble[i]!;
        pts.push([x + px * cs - py * sn, y + px * sn + py * cs]);
      }
      const last = pts[n - 1]!;
      const first = pts[0]!;
      ctx.moveTo((last[0]! + first[0]!) / 2, (last[1]! + first[1]!) / 2);
      for (let i = 0; i < n; i++) {
        const p = pts[i]!;
        const q = pts[(i + 1) % n]!;
        ctx.quadraticCurveTo(p[0]!, p[1]!, (p[0]! + q[0]!) / 2, (p[1]! + q[1]!) / 2);
      }
      ctx.closePath();
    }
  }
  ctx.fill();
  ctx.restore();
}

function sway(rand: () => number, n: number, lo: number, hi: number) {
  return Array.from({ length: n }, () => lo + rand() * (hi - lo));
}

function cellNorm(i: number): [number, number] {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const j = mulberry(0x51f15e + i * 131);
  const jx = (j() - 0.5) * 0.36;
  const jy = (j() - 0.5) * 0.36;
  const brick = row % 2 ? 0.42 : 0;
  return [(col + 0.5 + jx + brick) / COLS, (row + 0.5 + jy) / ROWS];
}

const CELL_POS: Array<[number, number]> = Array.from({ length: CELLS }, (_, i) => cellNorm(i));

function patternBits(bytes: Uint8Array) {
  const data = bytes.slice(0, 8);
  const crc = crc16(data);
  const bits = new Uint8Array(CELLS);
  SYNC.forEach((bit, i) => {
    bits[i] = bit;
  });
  let p = 8;
  for (let i = 0; i < 8; i++) {
    for (let b = 7; b >= 0; b--) bits[p++] = (data[i]! >> b) & 1;
  }
  for (let b = 15; b >= 0; b--) bits[p++] = (crc >> b) & 1;
  for (let i = 0; i < 8; i++) bits[p++] = bits[8 + i]!;
  return bits;
}

function paletteEnds(colors: readonly string[]) {
  const sorted = colors.map(hexToRgb).sort((a, b) => luma(a) - luma(b));
  const dark = sorted[0]!;
  const light = sorted[sorted.length - 1]!;
  return { pal: sorted, ink: dark, wash: light };
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: number,
  bytes: Uint8Array,
  colors: readonly string[],
) {
  const { pal, ink, wash } = paletteEnds(colors);
  const rand = mulberry(serialSeed(bytes));
  const dye = () => pal[Math.floor(rand() * pal.length)]!;
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgb(dye());
  ctx.fillRect(-tile, -tile, tile * 3, tile * 3);
  for (let n = 0; n < 4; n++) {
    const color = dye();
    let x = rand() * tile;
    let y = rand() * tile;
    let ang = rand() * Math.PI * 2;
    const steps = 5 + Math.floor(rand() * 3);
    for (let s = 0; s < steps; s++) {
      ang += (rand() - 0.45) * 1.5;
      x = (x + Math.cos(ang) * tile * (0.1 + rand() * 0.06) + tile) % tile;
      y = (y + Math.sin(ang) * tile * (0.1 + rand() * 0.06) + tile) % tile;
      const r = tile * (0.08 + rand() * 0.07);
      organic(ctx, tile, x, y, r, r * (0.86 + rand() * 0.14), ang, color, 0.92, sway(rand, 12, 0.78, 1.16));
    }
  }
  for (let n = 0; n < 6; n++) {
    const r = tile * (0.045 + rand() * 0.04);
    organic(
      ctx,
      tile,
      rand() * tile,
      rand() * tile,
      r,
      r * (0.8 + rand() * 0.2),
      rand() * Math.PI,
      dye(),
      0.88,
      sway(rand, 10, 0.8, 1.15),
    );
  }
  const bits = patternBits(bytes);
  const cell = Math.min(tile / COLS, tile / ROWS);
  for (let i = 0; i < CELLS; i++) {
    const bit = bits[i]!;
    const [nx, ny] = CELL_POS[i]!;
    const j = mulberry(0xb10b + i * 17);
    const rad = (bit ? 0.34 : 0.2) * cell * (0.92 + j() * 0.16);
    const turn = j() * 0.6;
    const color = bit ? ink : wash;
    const cx = nx * tile;
    const cy = ny * tile;
    organic(ctx, tile, cx, cy, rad, rad * (0.9 + j() * 0.1), turn, color, 1, sway(j, 6, 0.9, 1.08));
    organic(
      ctx,
      tile,
      cx + (j() - 0.5) * rad * 0.25,
      cy + (j() - 0.5) * rad * 0.25,
      rad * 0.62,
      rad * 0.56,
      turn + 0.4,
      color,
      0.9,
      sway(j, 6, 0.88, 1.1),
    );
  }
}

export function drawCamo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bytes: Uint8Array,
  colors: readonly string[],
) {
  const tile = clothTile(w, h);
  const bleed = Math.ceil(tile * 0.45);
  const big = document.createElement("canvas");
  big.width = tile + bleed * 2;
  big.height = tile + bleed * 2;
  const bctx = big.getContext("2d");
  if (!bctx) return;
  bctx.translate(bleed, bleed);
  drawTile(bctx, tile, bytes, colors);
  const off = document.createElement("canvas");
  off.width = tile;
  off.height = tile;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.drawImage(big, bleed, bleed, tile, tile, 0, 0, tile, tile);
  ctx.globalAlpha = 1;
  for (let y = 0; y < h; y += tile) {
    for (let x = 0; x < w; x += tile) ctx.drawImage(off, x, y);
  }
}

function sampleLuma(data: Uint8ClampedArray, w: number, h: number, x: number, y: number) {
  const vals: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) vals.push(pixelLuma(data, w, h, x + dx, y + dy));
  }
  vals.sort((a, b) => a - b);
  return vals[4]!;
}
function pixelLuma(data: Uint8ClampedArray, w: number, h: number, x: number, y: number) {
  const ix = Math.max(0, Math.min(w - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(h - 1, Math.round(y)));
  const i = (iy * w + ix) * 4;
  return 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
}

function periodGuesses(data: Uint8ClampedArray, w: number, h: number) {
  const step = 4;
  const gw = Math.floor(w / step);
  const gh = Math.floor(h / step);
  const g = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) g[y * gw + x] = pixelLuma(data, w, h, x * step + 1, y * step + 1);
  }
  const max = Math.floor(Math.min(gw, gh) * 0.72);
  let best = Infinity;
  const minima: Array<{ lag: number; score: number }> = [];
  let prev = Infinity;
  let prev2 = Infinity;
  let prevLag = 0;
  for (let lag = 10; lag <= max; lag++) {
    let sad = 0;
    let n = 0;
    for (let y = 0; y < gh; y += 2) {
      const row = y * gw;
      for (let x = 0; x + lag < gw; x += 2) {
        sad += Math.abs(g[row + x]! - g[row + x + lag]!);
        n++;
      }
    }
    let vs = 0;
    let vn = 0;
    for (let x = 0; x < gw; x += 2) {
      for (let y = 0; y + lag < gh; y += 2) {
        vs += Math.abs(g[y * gw + x]! - g[(y + lag) * gw + x]!);
        vn++;
      }
    }
    const score = sad / Math.max(1, n) + vs / Math.max(1, vn);
    if (lag > 11 && prev <= score && prev < prev2) minima.push({ lag: prevLag, score: prev });
    if (score < best) best = score;
    prev2 = prev;
    prev = score;
    prevLag = lag;
  }
  minima.sort((a, b) => a.score - b.score);
  const picks: number[] = [];
  for (const m of minima) {
    const px = m.lag * step;
    if (picks.some((p) => Math.abs(p - px) < 16)) continue;
    picks.push(px);
    if (picks.length === 4) break;
  }
  if (!picks.length && minima[0]) picks.push(minima[0].lag * step);
  return picks;
}

function syncMargin(data: Uint8ClampedArray, w: number, h: number, ox: number, oy: number, period: number) {
  let dark = 0;
  let nd = 0;
  let light = 0;
  let nl = 0;
  for (let i = 0; i < SYNC.length; i++) {
    const [nx, ny] = CELL_POS[i]!;
    for (let ty = oy - period; ty < h; ty += period) {
      for (let tx = ox - period; tx < w; tx += period) {
        const x = tx + nx * period;
        const y = ty + ny * period;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const sample = sampleLuma(data, w, h, x, y);
        if (SYNC[i]) {
          dark += sample;
          nd++;
        } else {
          light += sample;
          nl++;
        }
      }
    }
  }
  if (nd < 1 || nl < 1) return -999;
  return light / nl - dark / nd;
}

function lockPhase(data: Uint8ClampedArray, w: number, h: number, period: number) {
  const coarse = Math.max(4, Math.round(period / 36));
  let best = { margin: -999, ox: 0, oy: 0 };
  for (let oy = 0; oy < period; oy += coarse) {
    for (let ox = 0; ox < period; ox += coarse) {
      const margin = syncMargin(data, w, h, ox, oy, period);
      if (margin > best.margin) best = { margin, ox, oy };
    }
  }
  for (let oy = best.oy - coarse; oy <= best.oy + coarse; oy += 2) {
    for (let ox = best.ox - coarse; ox <= best.ox + coarse; ox += 2) {
      const px = ((ox % period) + period) % period;
      const py = ((oy % period) + period) % period;
      const margin = syncMargin(data, w, h, px, py, period);
      if (margin > best.margin) best = { margin, ox: px, oy: py };
    }
  }
  return best;
}

function readAligned(data: Uint8ClampedArray, w: number, h: number, ox: number, oy: number, period: number) {
  let dark = 0;
  let nd = 0;
  let light = 0;
  let nl = 0;
  for (let i = 0; i < SYNC.length; i++) {
    const [nx, ny] = CELL_POS[i]!;
    for (let ty = oy - period; ty < h; ty += period) {
      for (let tx = ox - period; tx < w; tx += period) {
        const x = tx + nx * period;
        const y = ty + ny * period;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const sample = sampleLuma(data, w, h, x, y);
        if (SYNC[i]) {
          dark += sample;
          nd++;
        } else {
          light += sample;
          nl++;
        }
      }
    }
  }
  if (!nd || !nl) return null;
  const mid = (dark / nd + light / nl) / 2;
  const votes = Array.from({ length: CELLS }, () => [0, 0]);
  for (let i = 0; i < CELLS; i++) {
    const [nx, ny] = CELL_POS[i]!;
    for (let ty = oy - period; ty < h; ty += period) {
      for (let tx = ox - period; tx < w; tx += period) {
        const x = tx + nx * period;
        const y = ty + ny * period;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const sample = sampleLuma(data, w, h, x, y);
        if (Math.abs(sample - mid) < 6) continue;
        votes[i]![sample < mid ? 1 : 0] += 1;
      }
    }
  }
  const bits = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const [off, on] = votes[i]!;
    if (off === 0 && on === 0) return null;
    bits[i] = on > off ? 1 : 0;
  }
  return bits;
}

function payloadFromBits(bits: Uint8Array) {
  for (let i = 0; i < SYNC.length; i++) if (bits[i] !== SYNC[i]) return null;
  const data = new Uint8Array(8);
  let p = 8;
  for (let i = 0; i < 8; i++) {
    let value = 0;
    for (let b = 7; b >= 0; b--) value |= bits[p++]! << b;
    data[i] = value;
  }
  let crc = 0;
  for (let b = 15; b >= 0; b--) crc = (crc << 1) | bits[p++]!;
  if (crc !== crc16(data)) return null;
  return patternId(data);
}

function decodeData(data: Uint8ClampedArray, w: number, h: number) {
  const guesses = periodGuesses(data, w, h).slice(0, 3);
  let winner: string | null = null;
  for (const guess of guesses) {
    for (const period of [guess - 2, guess, guess + 2]) {
      if (period < 48 || period > Math.min(w, h) * 0.92) continue;
      const phase = lockPhase(data, w, h, period);
      if (phase.margin < 12) continue;
      const bits = readAligned(data, w, h, phase.ox, phase.oy, period);
      if (!bits) continue;
      const id = payloadFromBits(bits);
      if (id) return id;
    }
  }
  return winner;
}

function canvasData(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: frame.data, w: canvas.width, h: canvas.height };
}

export function readCanvas(canvas: HTMLCanvasElement, rotations = true) {
  const first = canvasData(canvas);
  if (!first) return null;
  const hit = decodeData(first.data, first.w, first.h);
  if (hit || !rotations) return hit;
  for (const deg of [-8, 8, -15, 15]) {
    const turned = document.createElement("canvas");
    turned.width = canvas.width;
    turned.height = canvas.height;
    const ctx = turned.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#6e6a64";
    ctx.fillRect(0, 0, turned.width, turned.height);
    ctx.translate(turned.width / 2, turned.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    const next = canvasData(turned);
    if (!next) continue;
    const id = decodeData(next.data, next.w, next.h);
    if (id) return id;
  }
  return null;
}

export function renderPng(bytes: Uint8Array, colors: readonly string[], w = 960, h = 540) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  drawCamo(ctx, w, h, bytes, colors);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the picture."))), "image/png");
  });
}

export async function readPattern(file: Blob): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0);
  return readCanvas(canvas);
}

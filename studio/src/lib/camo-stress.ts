import { IDEAL_TILE, clothRepeats, drawCamo, patternId, readCanvas } from "./camo";

// Last sweep (1280×800 woodland, 3 trials):
// repeat 320px, 4 across by 2 down.
// All trials passed at 5% cover. Every trial failed at 30% cover.
// One tuck fails. Center crop works at 70% of the frame, not at 55%.
// Zoom works at 0.75×, 1.4×, and 1.8×, not at 0.55×.
// A 2px wave inside the repeat fails. An 8° tilt still scans.

const COLORS = ["#223020", "#3e4e2a", "#605836", "#1c1e18", "#766c48"];

function canvasOf(w: number, h: number, bytes: Uint8Array, colors: readonly string[] = COLORS) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  drawCamo(ctx, w, h, bytes, colors);
  return canvas;
}

function clone(src: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(src, 0, 0);
  return canvas;
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

function occlude(src: HTMLCanvasElement, pct: number, seed: number) {
  const canvas = clone(src);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = mulberry(seed + pct * 17);
  let covered = 0;
  const target = canvas.width * canvas.height * (pct / 100);
  while (covered < target) {
    const rx = 8 + rand() * 64;
    const ry = 6 + rand() * 48;
    ctx.fillStyle = rand() > 0.5 ? "#141414" : "#e4dccd";
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(rand() * canvas.width, rand() * canvas.height, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    covered += Math.PI * rx * ry;
  }
  return canvas;
}

function fold(src: HTMLCanvasElement, folds: number) {
  const canvas = clone(src);
  const ctx = canvas.getContext("2d");
  if (!ctx || folds <= 0) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  const srcData = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const gap = Math.max(2, Math.round(Math.min(w, h) * 0.035));
  const creases: Array<{ at: number; axis: "x" | "y" }> = [];
  for (let i = 0; i < folds; i++) {
    const axis = i % 2 === 0 ? "y" : "x";
    const span = axis === "y" ? h : w;
    creases.push({ at: Math.round(((i + 1) / (folds + 1)) * span), axis });
  }
  const shift = (v: number, span: number, axis: "x" | "y") => {
    let extra = 0;
    for (const crease of creases) {
      if (crease.axis === axis && v > crease.at) extra += gap;
    }
    return Math.max(0, Math.min(span - 1, v + extra));
  };
  for (let y = 0; y < h; y++) {
    const sy = shift(y, h, "y");
    for (let x = 0; x < w; x++) {
      const sx = shift(x, w, "x");
      const di = (y * w + x) * 4;
      const si = (sy * w + sx) * 4;
      dst.data[di] = srcData.data[si]!;
      dst.data[di + 1] = srcData.data[si + 1]!;
      dst.data[di + 2] = srcData.data[si + 2]!;
      dst.data[di + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 3;
  for (const crease of creases) {
    ctx.beginPath();
    if (crease.axis === "y") {
      ctx.moveTo(0, crease.at);
      ctx.lineTo(w, crease.at);
    } else {
      ctx.moveTo(crease.at, 0);
      ctx.lineTo(crease.at, h);
    }
    ctx.stroke();
  }
  return canvas;
}

function wave(src: HTMLCanvasElement, amp: number) {
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx || !sctx) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  const srcData = sctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const dx = Math.round(amp * Math.sin((y / h) * Math.PI * 4));
    for (let x = 0; x < w; x++) {
      const dy = Math.round(amp * 0.45 * Math.sin((x / w) * Math.PI * 4));
      const sx = Math.max(0, Math.min(w - 1, x + dx));
      const sy = Math.max(0, Math.min(h - 1, y + dy));
      const di = (y * w + x) * 4;
      const si = (sy * w + sx) * 4;
      dst.data[di] = srcData.data[si]!;
      dst.data[di + 1] = srcData.data[si + 1]!;
      dst.data[di + 2] = srcData.data[si + 2]!;
      dst.data[di + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
  return canvas;
}

function crop(src: HTMLCanvasElement, frac: number, ox = 0.5, oy = 0.5) {
  const canvas = document.createElement("canvas");
  const w = Math.max(32, Math.round(src.width * frac));
  const h = Math.max(32, Math.round(src.height * frac));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const sx = Math.max(0, Math.min(src.width - w, Math.round((src.width - w) * ox)));
  const sy = Math.max(0, Math.min(src.height - h, Math.round((src.height - h) * oy)));
  ctx.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  return canvas;
}

function zoom(src: HTMLCanvasElement, scale: number) {
  const canvas = document.createElement("canvas");
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

function ok(canvas: HTMLCanvasElement, id: string) {
  return readCanvas(canvas, false) === id;
}

export async function runCamoStress() {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = (i * 37 + 11) & 255;
  const id = patternId(bytes);
  const cloth = canvasOf(1280, 800, bytes);
  const repeats = clothRepeats(1280, 800);
  const clean = ok(cloth, id);

  let reliablePct = 0;
  let failPct = 100;
  for (let pct = 5; pct <= 70; pct += 5) {
    let hits = 0;
    for (let trial = 0; trial < 3; trial++) if (ok(occlude(cloth, pct, 100 + trial * 13), id)) hits++;
    if (hits === 3) reliablePct = pct;
    if (hits === 0) {
      failPct = pct;
      break;
    }
  }

  let maxFolds = 0;
  let failFolds = 0;
  for (let folds = 1; folds <= 10; folds++) {
    if (ok(fold(cloth, folds), id)) maxFolds = folds;
    else {
      failFolds = folds;
      break;
    }
  }

  const crops: Array<{ frac: number; hit: boolean }> = [];
  for (const frac of [0.85, 0.7, 0.55, 0.45, 0.35]) {
    crops.push({ frac, hit: ok(crop(cloth, frac), id) });
  }
  const randomCrop = [0.2, 0.55, 0.8].map((ox, i) => ok(crop(cloth, 0.5, ox, 0.15 + i * 0.3), id));

  const zooms = [0.55, 0.75, 1.4, 1.8].map((scale) => ({ scale, hit: ok(zoom(cloth, scale), id) }));

  let maxWave = 0;
  let failWave = 0;
  for (const amp of [2, 4, 8, 12, 18]) {
    if (ok(wave(cloth, amp), id)) maxWave = amp;
    else {
      failWave = amp;
      break;
    }
  }

  const turned = document.createElement("canvas");
  turned.width = cloth.width;
  turned.height = cloth.height;
  const tctx = turned.getContext("2d");
  let rotate8 = false;
  if (tctx) {
    tctx.translate(turned.width / 2, turned.height / 2);
    tctx.rotate((8 * Math.PI) / 180);
    tctx.drawImage(cloth, -cloth.width / 2, -cloth.height / 2);
    rotate8 = readCanvas(turned, true) === id;
  }

  const rule = [
    `The print repeat is ${repeats.tile}px and shows ${repeats.x} by ${repeats.y} times in a 1280×800 view (ideal tile ${IDEAL_TILE}px).`,
    clean ? "A straight photo of the whole cloth scans." : "A straight photo did not scan. The rule below is not valid.",
    `All 3 trials still scanned at ${reliablePct}% cover. At ${failPct}% cover, every trial failed. Between those, the scan is not reliable.`,
    maxFolds
      ? `It still scans with ${maxFolds} tuck${maxFolds === 1 ? "" : "s"}. The first total failure is ${failFolds} tucks.`
      : `A single tuck, which hides about 3.5% of the cloth and leaves a shadow line, is enough to make the scan fail. Hold the cloth flat.`,
    `A centered crop still scans down to ${Math.round((crops.filter((c) => c.hit).at(-1)?.frac ?? 0) * 100)}% of the frame.`,
    `Zoom still scans at ${zooms.filter((z) => z.hit).map((z) => `${z.scale}×`).join(", ") || "none"}.`,
    maxWave
      ? `A wave still scans when the cloth shifts by ${maxWave}px. ${failWave}px is the first total failure.`
      : `A wave of ${failWave}px inside one repeat is enough to make the scan fail.`,
    `An ${rotate8 ? "8° tilt still scans" : "8° tilt does not scan"}.`,
  ].join(" ");

  return {
    repeats,
    clean,
    occlusion: { reliablePct, failPct },
    folds: { maxOk: maxFolds, failAt: failFolds },
    crops,
    randomCropHits: randomCrop.filter(Boolean).length,
    zooms,
    wave: { maxPx: maxWave, failPx: failWave },
    rotate8,
    rule,
  };
}
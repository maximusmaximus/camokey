const WORDS = ["amber","birch","cedar","dune","ember","flint","grove","hazel","iris","jade","kiln","lumen","mesa","nova","onyx","pearl","quartz","ridge","sage","tide","umber","vale","willow","xenon"];
const PRESETS = {
  woodland: ["#2a3520","#4a5335","#6b623e","#242420","#584c34"],
  urban: ["#3a403a","#60645c","#282c28","#787468","#1c201c"],
  desert: ["#483c2c","#6e5a3e","#302820","#8c7858","#201c18"],
  navy: ["#1e2a3a","#3d4c63","#8a8172","#121820","#5c5346"],
  snow: ["#d9d4cc","#a7b0b8","#6d7670","#f4f1ea","#8d8376"],
  night: ["#101014","#2a2a32","#4a3f38","#1c1c22","#6a5a48"],
  moss: ["#31402a","#6a7a48","#243024","#8a7a52","#1a2218"],
  rust: ["#5a3428","#8a5a3c","#2c1c16","#c4a07a","#3a241c"],
  clay: ["#6a5344","#a08468","#3a2c24","#d2b89a","#241c16"],
  ink: ["#1a1a1a","#3a3a3a","#6a6a6a","#101010","#8a8a8a"]
};
const $ = (id) => document.getElementById(id);
const canvas = $("camo");
const ctx = canvas.getContext("2d");
let seed = 1;
let palette = PRESETS.woodland;
let frozen = null;
let phrase = "";

function mulberry(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hex(n) { return [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2,"0")).join(""); }
function makePhrase() { const rnd = mulberry(seed); return Array.from({length: 12}, () => WORDS[Math.floor(rnd()*WORDS.length)]).join(" "); }
function pubkey() { let h = 0; for (const c of phrase) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8,"0") + hex(8); }
function creatorLine() { const k = pubkey(); return `Creator ${k.slice(0,4)}...${k.slice(-4)}`; }

function draw(s = seed) {
  const w = canvas.width = window.innerWidth;
  const h = canvas.height = window.innerHeight;
  const rnd = mulberry(s);
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = palette[i % palette.length];
    ctx.globalAlpha = 0.35 + rnd() * 0.5;
    ctx.beginPath();
    ctx.ellipse(rnd()*w, rnd()*h, 40 + rnd()*180, 20 + rnd()*90, rnd()*Math.PI, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const serial = (s >>> 0).toString(16).padStart(8,"0");
  const cell = 28;
  for (let i = 0; i < serial.length; i++) {
    const v = parseInt(serial[i], 16);
    ctx.fillStyle = palette[v % palette.length];
    ctx.fillRect(12 + (i%8)*cell, h - 48 + Math.floor(i/8)*cell, 10 + (v%4)*2, 10);
  }
}
function announce(text) { $("live").textContent = text; }
function randomize() {
  const prev = seed;
  try {
    seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    if (!frozen) phrase = makePhrase();
    draw();
    $("creator").textContent = creatorLine();
    announce("new pattern ready");
  } catch (err) {
    seed = prev; draw(); report(err);
  }
}

const steps = [
  "This screen is your cloth pattern. It fills the whole window.",
  "Random makes a new pattern. Color changes the dyes.",
  "Use this keeps that pattern and makes a set of close variants.",
  "You get a phrase. It is shown once. Write it down. A lost phrase cannot come back.",
  "A photo of the cloth can be copied. This marks an item. It does not stop a reprint."
];
let step = 0;
function showTour() {
  step = 0;
  $("tour-text").textContent = steps[0];
  $("tour-next").textContent = "Next";
  $("tour").showModal();
  $("tour-next").focus();
}
function nextTour() {
  step += 1;
  if (step >= steps.length) { $("tour").close(); return; }
  $("tour-text").textContent = steps[step];
  if (step === steps.length - 1) $("tour-next").textContent = "Done";
}

function openUse() {
  frozen = seed;
  if (!phrase) phrase = makePhrase();
  $("phrase").textContent = phrase;
  $("creator").textContent = creatorLine();
  const box = $("serials");
  box.innerHTML = "";
  const n = Number($("count").value || 4);
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "serial";
    const id = (frozen + i).toString(16).padStart(8,"0");
    row.innerHTML = `<span>${id}</span><select aria-label="visibility for ${id}"><option>private</option><option>public</option><option>unlisted</option></select>`;
    box.appendChild(row);
  }
  $("use-dialog").showModal();
}
function manifest() {
  const serials = [...$("serials").querySelectorAll(".serial")].map(row => ({
    serial: row.querySelector("span").textContent,
    visibility: row.querySelector("select").value
  }));
  return {
    set: $("set-name").value,
    email: $("email").value,
    creator: creatorLine(),
    phrase_hint: phrase.split(" ").slice(0,2).join(" "),
    style: palette,
    description: "Batch of CamoKey cloth patterns. Same look, subtle serial variants.",
    serials
  };
}
function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
function exportPng() { canvas.toBlob(b => download("camokey.png", b), "image/png"); }
function exportJson() { download("manifest.json", new Blob([JSON.stringify(manifest(), null, 2)], {type:"application/json"})); }
function exportPdf() {
  const m = manifest();
  const lines = [
    "CamoKey batch",
    m.description,
    m.creator,
    "Set: " + m.set,
    ...m.serials.map(s => s.serial + " " + s.visibility)
  ];
  const text = lines.join("\n");
  const pdf = `%PDF-1.1\n1 0 obj<<>>endobj\n2 0 obj<< /Length ${text.length+40} >>stream\nBT /F1 12 Tf 40 760 Td (${text.replace(/[()\\]/g,"")}) Tj ET\nendstream\nendobj\ntrailer<<>>\n%%EOF`;
  download("batch.pdf", new Blob([pdf], {type:"application/pdf"}));
}
function report(err) {
  $("bug-what").textContent = err && err.message ? err.message : "Something went wrong.";
  $("bug").showModal();
}
function sendBug() {
  if ($("captcha").value.trim() !== "7") { announce("Answer the check question first."); return; }
  const body = encodeURIComponent($("bug-text").value + "\n\n" + $("bug-what").textContent);
  window.open("https://github.com/maximusmaximus/camokey/issues/new?title=" + encodeURIComponent("[bug] site") + "&body=" + body + "&labels=bug", "_blank");
}

function presets() {
  const box = $("presets");
  Object.entries(PRESETS).forEach(([name, colors]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.style.background = colors[1];
    b.title = name;
    b.setAttribute("aria-label", name);
    b.onclick = () => { palette = colors; draw(frozen || seed); };
    box.appendChild(b);
  });
}
function cmyk() {
  const c = $("c").value/100, m = $("m").value/100, y = $("y").value/100, k = $("k").value/100;
  const r = Math.round(255 * (1-c) * (1-k));
  const g = Math.round(255 * (1-m) * (1-k));
  const b = Math.round(255 * (1-y) * (1-k));
  const hex = "#" + [r,g,b].map(n => n.toString(16).padStart(2,"0")).join("");
  palette = [hex, PRESETS.woodland[1], PRESETS.woodland[2], PRESETS.woodland[3], PRESETS.woodland[4]];
  draw(frozen || seed);
}

$("random").onclick = randomize;
$("color").onclick = () => $("color-dialog").showModal();
$("color-done").onclick = () => $("color-dialog").close();
$("use").onclick = openUse;
$("use-close").onclick = () => $("use-dialog").close();
$("info").onclick = showTour;
$("tour-next").onclick = nextTour;
$("tour-skip").onclick = () => $("tour").close();
$("export-png").onclick = exportPng;
$("export-pdf").onclick = exportPdf;
$("export-json").onclick = exportJson;
$("bug-send").onclick = sendBug;
["c","m","y","k","wheel"].forEach(id => $(id).addEventListener("input", cmyk));
$("confirm-phrase").addEventListener("input", () => {
  const need = phrase.slice(0,4);
  $("export-png").disabled = $("confirm-phrase").value.toLowerCase() !== need.toLowerCase();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll("dialog[open]").forEach(d => d.close()); });
window.addEventListener("resize", () => draw(frozen || seed));
presets();
phrase = makePhrase();
$("creator").textContent = creatorLine();
draw();
if (!sessionStorage.getItem("tour")) { sessionStorage.setItem("tour","1"); showTour(); }

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  Dices,
  Eye,
  EyeOff,
  Globe,
  Info,
  KeyRound,
  Link2,
  Palette,
  ScanLine,
  Undo2,
} from "lucide-react";
import { downloadBlob, makeZip, pdfBytes } from "@/lib/archive";
import {
  NOTICE_LIMIT,
  noticeBytes,
  openNotice,
  sealNotice,
  type Notice,
} from "@/lib/seal";
import {
  PRESETS,
  checkPass,
  cmykToHex,
  colorLuma,
  drawCamo,
  fingerprint,
  isMnemonicWord,
  lumaSpan,
  MIN_LUMA_GAP,
  MIN_LUMA_PERCENT,
  patternId,
  randomMnemonic,
  readPattern,
  renderPng,
  serialBytes,
  sha256Hex,
  type Visibility,
} from "@/lib/camo";

type Cloth = {
  id: string;
  name: string;
  index: number;
  visibility: Visibility;
  owner: string;
  notice: Notice | null;
  sealed: string;
};

const TOUR = {
  en: [
    ["The cloth", "This picture fills the screen. It is a real pattern, not a sample."],
    ["Random", "Random makes a new one. The code is already in the picture."],
    ["Color", "Color changes the dyes. Pick a set, or mix your own."],
    ["Use this", "Use this keeps the picture you see and lets you make a set."],
    ["Your mnemonic", "You already have a mnemonic. It made this picture. You can paste your own."],
    ["Who can read it", "Public means anyone. Private needs a code. Unlisted needs a link."],
    ["Lost words", "If you lose the mnemonic, no one can reset it. Write it down."],
    ["Come back", "The i button opens this again."],
  ],
  es: [
    ["La tela", "Esta imagen llena la pantalla. Es un patrón real, no una muestra."],
    ["Al azar", "Al azar hace uno nuevo. El código ya está en la imagen."],
    ["Color", "Color cambia los tintes. Elige un conjunto o mezcla el tuyo."],
    ["Usar este", "Usar este guarda la imagen que ves y te deja hacer un conjunto."],
    ["Tu mnemónico", "Ya tienes un mnemónico. Él hizo esta imagen. Puedes pegar el tuyo."],
    ["Quién lee", "Público es para todos. Privado pide un código. Oculto pide un enlace."],
    ["Palabras perdidas", "Si pierdes el mnemónico, nadie puede reiniciarlo. Escríbelo."],
    ["Volver", "El botón i abre esto otra vez."],
  ],
} as const;

type Lang = keyof typeof TOUR;
type Sheet = "none" | "tour" | "color" | "use" | "words" | "scan" | "bug";

export function Studio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [mnemonic, setMnemonic] = useState("");
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([0]);
  const [preset, setPreset] = useState(0);
  const [custom, setCustom] = useState<string[] | null>(null);
  const [name, setName] = useState("drop-01");
  const [pubkey, setPubkey] = useState("");
  const [sheet, setSheet] = useState<Sheet>("none");
  const [tourStep, setTourStep] = useState(0);
  const [status, setStatus] = useState("");
  const [cloths, setCloths] = useState<Cloth[]>([]);
  const [bugText, setBugText] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [frame, setFrame] = useState(0);
  const [keyCopied, setKeyCopied] = useState(false);

  const ready = mnemonic.length > 0;
  const es = lang === "es";
  const colors = custom ?? [...PRESETS[preset]!.colors];

  useEffect(() => {
    setMnemonic(randomMnemonic());
    if (localStorage.getItem("camokey-tour") !== "done") setSheet("tour");
  }, []);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setBugText(event.message || "Unknown error");
      setCaptcha("");
      setSheet("bug");
    };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancel = false;
    (async () => {
      const secret = await serialBytes(mnemonic, name, index);
      const hex = await sha256Hex(mnemonic);
      if (cancel) return;
      setPubkey(hex);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      const palette = custom ?? [...PRESETS[preset]!.colors];
      drawCamo(ctx, canvas.width, canvas.height, secret, palette);
    })();
    return () => {
      cancel = true;
    };
  }, [ready, mnemonic, name, index, preset, custom, frame]);

  useEffect(() => {
    const onResize = () => setFrame((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function say(text: string) {
    setStatus(text);
  }

  function closeSheet() {
    if (sheet === "tour") localStorage.setItem("camokey-tour", "done");
    setSheet("none");
  }

  async function roll() {
    const next = index + 1;
    setHistory((h) => [...h, next]);
    setIndex(next);
  }

  function back() {
    if (history.length < 2) return;
    const next = history.slice(0, -1);
    setHistory(next);
    setIndex(next[next.length - 1]!);
  }

  return (
    <main className="relative h-full overflow-hidden bg-ink text-bone">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" aria-hidden="true" />
      <header className="pointer-events-none fixed inset-x-3 top-3 z-20 flex items-center justify-between">
        <p className="win pointer-events-auto px-2 py-2 font-display text-xs tracking-wide uppercase md:px-3 md:text-sm">
          CamoKey
        </p>
        <p className="win pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 py-1 pr-1 pl-2 font-mono text-xs text-bone">
          <span>{pubkey ? fingerprint(pubkey) : "----…----"}</span>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full"
            aria-label={es ? "Copiar clave pública" : "Copy public key"}
            onClick={() => {
              if (!pubkey) return;
              void navigator.clipboard.writeText(pubkey).then(() => {
                setKeyCopied(true);
                window.setTimeout(() => setKeyCopied(false), 1500);
              });
            }}
          >
            {keyCopied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
        </p>
        <button
          type="button"
          className="win pointer-events-auto grid size-11 place-items-center italic"
          aria-label={es ? "Abrir la guía" : "Open the walkthrough"}
          onClick={() => {
            setTourStep(0);
            setSheet("tour");
          }}
        >
          <Info className="size-5" aria-hidden="true" />
        </button>
      </header>
      <nav
        aria-label={es ? "Controles" : "Pattern controls"}
        className={
          sheet === "none"
            ? "taskbar fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:inset-y-0 md:bottom-auto md:left-0 md:flex md:w-56 md:flex-col md:p-2"
            : "hidden"
        }
      >
        <Control icon={<Dices className="size-4" />} label="Random" primary onClick={roll} />
        <Control icon={<Palette className="size-4" />} label="Color" onClick={() => setSheet("color")} />
        <Control icon={<Undo2 className="size-4" />} label="Back" onClick={back} />
        <Control icon={<Check className="size-4" />} label={es ? "Usar este" : "Use this"} onClick={() => setSheet("use")} />
        <Control icon={<KeyRound className="size-4" />} label={es ? "Mnemónico" : "Mnemonic"} quiet onClick={() => setSheet("words")} />
        <Control icon={<ScanLine className="size-4" />} label="Scan" quiet onClick={() => setSheet("scan")} />
        <p className="col-span-3 text-center text-sm text-muted md:col-auto md:text-left" role="status">
          {status || `${PRESETS[preset]!.name} · ${index}`}
        </p>
      </nav>

      {sheet === "tour" && (
        <Sheet title={TOUR[lang][tourStep]![0]} kicker={`${tourStep + 1} / ${TOUR[lang].length}`} onClose={closeSheet}>
          <p>{TOUR[lang][tourStep]![1]}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={closeSheet}>
              Skip
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (tourStep >= TOUR[lang].length - 1) closeSheet();
                else setTourStep((n) => n + 1);
              }}
            >
              {tourStep >= TOUR[lang].length - 1 ? (es ? "Listo" : "Done") : es ? "Siguiente" : "Next"}
            </button>
          </div>
        </Sheet>
      )}

      {sheet === "color" && (
        <ColorSheet
          es={es}
          lang={lang}
          colors={colors}
          onLang={() => {
            const next = lang === "en" ? "es" : "en";
            setLang(next);
            document.documentElement.lang = next;
          }}
          onPreset={(i) => {
            setPreset(i);
            setCustom(null);
          }}
          onCustom={(next) => setCustom(next)}
          onClose={closeSheet}
        />
      )}

      {sheet === "words" && (
        <WordsSheet
          es={es}
          mnemonic={mnemonic}
          onUse={(pasted) => {
            const words = pasted.trim().toLowerCase().split(/\s+/).filter(Boolean);
            if (words.length !== 12 || words.some((word) => !isMnemonicWord(word))) {
              say(es ? "El mnemónico necesita 12 palabras de la lista." : "A mnemonic needs 12 words from the list.");
              return;
            }
            setMnemonic(words.join(" "));
            setIndex(0);
            setHistory([0]);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      )}

      {sheet === "use" && ready && (
        <UseSheet
          es={es}
          mnemonic={mnemonic}
          name={name}
          index={index}
          colors={colors}
          look={custom ? "custom" : PRESETS[preset]!.name}
          owner={fingerprint(pubkey)}
          onNamed={setName}
          onSaved={(rows) => {
            setCloths((prev) => [...rows, ...prev]);
            say(es ? "Conjunto descargado." : "Set downloaded.");
            closeSheet();
          }}
          onError={say}
          onClose={closeSheet}
        />
      )}

      {sheet === "scan" && (
        <ScanSheet
          es={es}
          cloths={cloths}
          owner={fingerprint(pubkey)}
          onError={say}
          onClose={closeSheet}
        />
      )}

      {sheet === "bug" && (
        <Sheet title={es ? "Enviar un error" : "Send a bug"} onClose={closeSheet}>
          <p>{bugText || (es ? "Algo falló." : "Something went wrong.")}</p>
          <label className="mt-3 block">
            {es ? "¿Qué es 3 + 4?" : "What is 3 + 4?"}
            <input className="field" inputMode="numeric" value={captcha} onChange={(e) => setCaptcha(e.target.value)} />
          </label>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (captcha.trim() !== "7") {
                  say(es ? "La prueba no coincide." : "The check did not match.");
                  return;
                }
                const body = encodeURIComponent(bugText);
                window.open(
                  `https://github.com/maximusmaximus/camokey/issues/new?title=${encodeURIComponent("bug: site")}&body=${body}&labels=bug`,
                  "_blank",
                  "noopener",
                );
                closeSheet();
              }}
            >
              {es ? "Abrir en GitHub" : "Open GitHub issue"}
            </button>
          </div>
        </Sheet>
      )}
      <button type="button" className="sr-only" onClick={() => setSheet("bug")}>
        Report
      </button>
    </main>
  );
}

function Control({
  icon,
  label,
  onClick,
  primary,
  quiet,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        (primary ? "btn-primary " : quiet ? "btn-quiet " : "btn ") +
        "flex w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden px-1 py-2 text-xs leading-none md:w-auto md:flex-row md:px-3 md:text-base"
      }
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function Sheet({
  title,
  kicker,
  children,
  onClose,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 p-8 md:p-16" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mx-auto flex max-h-full w-full max-w-xl flex-col bg-[#c0c0c0] text-black shadow-[inset_-1px_-1px_0_#000,inset_1px_1px_0_#fff,inset_-2px_-2px_0_#808080,inset_2px_2px_0_#dfdfdf]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[#000080] px-2 py-1 text-white">
          <h2 className="truncate text-base font-bold">
            {title}
            {kicker ? ` — ${kicker}` : ""}
          </h2>
          <button type="button" className="btn min-h-0 px-2 py-0 leading-none" onClick={onClose} aria-label="Close">
            X
          </button>
        </div>
        <div className="min-h-0 overflow-auto p-3">{children}</div>
      </div>
    </div>
  );
}

function ColorSheet({
  es,
  lang,
  colors,
  onLang,
  onPreset,
  onCustom,
  onClose,
}: {
  es: boolean;
  lang: Lang;
  colors: string[];
  onLang: () => void;
  onPreset: (i: number) => void;
  onCustom: (colors: string[]) => void;
  onClose: () => void;
}) {
  const key = colors.join(",");
  const [draft, setDraft] = useState(colors);
  const [picked, setPicked] = useState(0);
  const [blocked, setBlocked] = useState("");
  useEffect(() => {
    setDraft(key.split(","));
    setBlocked("");
  }, [key]);
  const current = draft[picked] ?? "#000000";
  const [c, m, y, k] = hexToCmyk(current);
  const span = lumaSpan(draft);
  const spanPct = (span / 255) * 100;
  const lumas = draft.map((hex) => colorLuma(hex));
  const darkAt = lumas.indexOf(Math.min(...lumas));
  const lightAt = lumas.indexOf(Math.max(...lumas));
  const need = MIN_LUMA_PERCENT.toFixed(1);

  function tryColor(hex: string) {
    const next = draft.slice();
    next[picked] = hex;
    const gap = lumaSpan(next);
    if (gap < MIN_LUMA_GAP) {
      const pct = ((gap / 255) * 100).toFixed(1);
      setBlocked(
        es
          ? `Demasiado cerca. Eso dejaría ${pct}% de diferencia. Hace falta ${need}%.`
          : `Too close. That would leave ${pct}% between the darkest and lightest. Keep at least ${need}%.`,
      );
      return;
    }
    setBlocked("");
    setDraft(next);
    onCustom(next);
  }

  return (
    <Sheet title="Color" onClose={onClose}>
      <p>
        {es
          ? "Elige un tinte y cámbialo. La tela se actualiza al momento."
          : "Pick one dye and change it. The cloth updates as you go."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p, i) => (
          <button
            key={p.name}
            type="button"
            aria-label={p.name}
            className="size-11 border-2 border-black"
            style={{ background: p.colors[1] }}
            onClick={() => onPreset(i)}
          />
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        {draft.map((hex, i) => (
          <button
            key={`${hex}-${i}`}
            type="button"
            aria-pressed={picked === i}
            aria-label={es ? `Tinte ${i + 1}` : `Dye ${i + 1}`}
            className={`grid h-14 flex-1 place-items-center border-2 text-xs ${picked === i ? "border-sand" : "border-black"}`}
            style={{ background: hex, color: colorLuma(hex) > 140 ? "#1c1e18" : "#f3efe4" }}
            onClick={() => {
              setPicked(i);
              setBlocked("");
            }}
          >
            {i === darkAt ? (es ? "Oscuro" : "Dark") : i === lightAt ? (es ? "Claro" : "Light") : i + 1}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm">
        {es
          ? `La diferencia de brillo es ${spanPct.toFixed(1)}%. El escaneo necesita ${need}%.`
          : `Brightness span is ${spanPct.toFixed(1)}%. The scan needs ${need}%.`}
      </p>
      <div className="mt-2 h-2 overflow-hidden bg-line">
        <div
          className="h-full bg-moss"
          style={{ width: `${Math.max(4, Math.min(100, spanPct))}%` }}
        />
      </div>
      {blocked && <p className="mt-2 text-sm text-danger">{blocked}</p>}
      <label className="mt-4 block">
        {es ? `Tinte ${picked + 1}` : `Dye ${picked + 1}`}
        <input className="field h-11" type="color" value={current} onChange={(e) => tryColor(e.target.value)} />
      </label>
      <Slider label="C" value={Math.round(c * 100)} onChange={(n) => tryColor(cmykToHex(n / 100, m, y, k))} />
      <Slider label="M" value={Math.round(m * 100)} onChange={(n) => tryColor(cmykToHex(c, n / 100, y, k))} />
      <Slider label="Y" value={Math.round(y * 100)} onChange={(n) => tryColor(cmykToHex(c, m, n / 100, k))} />
      <Slider label="K" value={Math.round(k * 100)} onChange={(n) => tryColor(cmykToHex(c, m, y, n / 100))} />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onLang}>
          {lang === "en" ? "Español" : "English"}
        </button>
        <button type="button" className="btn-quiet" onClick={onClose}>
          {es ? "Cerrar" : "Close"}
        </button>
      </div>
    </Sheet>
  );
}

function hexToCmyk(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const black = 1 - Math.max(r, g, b);
  if (black === 1) return [0, 0, 0, 1];
  return [(1 - r - black) / (1 - black), (1 - g - black) / (1 - black), (1 - b - black) / (1 - black), black];
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="mt-2 block text-sm">
      {label} {value}
      <input className="field" type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function WordsSheet({
  es,
  mnemonic,
  onUse,
  onClose,
}: {
  es: boolean;
  mnemonic: string;
  onUse: (value: string) => void;
  onClose: () => void;
}) {
  const words = mnemonic.trim().split(/\s+/).filter(Boolean);
  const [shown, setShown] = useState(false);
  const [boxes, setBoxes] = useState<string[]>(() => Array(12).fill(""));
  const [copied, setCopied] = useState(false);

  function fill(text: string) {
    const parts = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    setBoxes(Array.from({ length: 12 }, (_, i) => parts[i] ?? ""));
  }

  const unknown = boxes.filter((word) => word && !isMnemonicWord(word)).length;
  const filled = boxes.filter(Boolean).length;
  const ok = filled === 12 && unknown === 0;

  return (
    <Sheet title="Mnemonic" onClose={onClose}>
      <p>
        {es
          ? "Este mnemónico hizo la tela. Está oculto hasta que lo mires. Cópialo, o pega otro."
          : "This mnemonic made the cloth. It stays hidden until you look. Copy it, or paste another."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn inline-flex items-center gap-2"
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          {shown ? (es ? "Ocultar" : "Hide") : es ? "Mostrar" : "Show"}
        </button>
        <button
          type="button"
          className="btn inline-flex items-center gap-2"
          onClick={() => {
            void navigator.clipboard.writeText(mnemonic).then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {es ? "Copiar" : "Copy"}
        </button>
      </div>
      <MnemonicBlocks words={words} shown={shown} />
      <p className="mt-4 text-sm">{es ? "Pega un mnemónico. Cada palabra entra en su casilla." : "Paste a mnemonic. Each word lands in its box."}</p>
      <div
        className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (!/\s/.test(text)) return;
          e.preventDefault();
          fill(text);
        }}
      >
        {boxes.map((word, i) => {
          const bad = word.length > 0 && !isMnemonicWord(word);
          return (
            <label
              key={i}
              className={`flex items-center gap-2 border bg-white px-2 py-2 ${bad ? "border-danger" : word ? "border-moss" : "border-line"}`}
            >
              <span className="w-5 shrink-0 text-xs text-muted">{i + 1}</span>
              <input
                className="w-full bg-transparent text-sm outline-none"
                aria-label={`${es ? "Palabra" : "Word"} ${i + 1}`}
                autoComplete="off"
                spellCheck={false}
                value={word}
                onChange={(e) => {
                  const next = boxes.slice();
                  next[i] = e.target.value.trim().toLowerCase();
                  setBoxes(next);
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (!/\s/.test(text)) return;
                  e.preventDefault();
                  fill(text);
                }}
              />
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-sand">
        {unknown > 0
          ? es
            ? "Alguna palabra no está en la lista."
            : "A word is not in the list."
          : filled > 0 && filled < 12
            ? es
              ? "Hacen falta 12 palabras."
              : "Needs 12 words."
            : ok
              ? es
                ? "Las 12 palabras son válidas."
                : "All 12 words are valid."
              : ""}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-primary disabled:opacity-40" disabled={!ok} onClick={() => onUse(boxes.join(" "))}>
          {es ? "Usar mnemónico" : "Use mnemonic"}
        </button>
        <button type="button" className="btn-quiet" onClick={onClose}>
          {es ? "Cerrar" : "Close"}
        </button>
      </div>
    </Sheet>
  );
}

function MnemonicBlocks({ words, shown }: { words: string[]; shown: boolean }) {
  return (
    <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {words.map((word, i) => (
        <li key={i} className="flex min-w-0 items-center gap-2 border border-line bg-white px-2 py-2">
          <span className="w-5 shrink-0 text-xs text-muted">{i + 1}</span>
          <span className="truncate text-sm">{shown ? word : "******"}</span>
        </li>
      ))}
    </ol>
  );
}

function UseSheet({
  es,
  mnemonic,
  name,
  index,
  colors,
  look,
  owner,
  onNamed,
  onSaved,
  onError,
  onClose,
}: {
  es: boolean;
  mnemonic: string;
  name: string;
  index: number;
  colors: string[];
  look: string;
  owner: string;
  onNamed: (name: string) => void;
  onSaved: (rows: Cloth[]) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [count, setCount] = useState(4);
  const [start, setStart] = useState(index);
  const [vis, setVis] = useState<Visibility>("public");
  const [code, setCode] = useState("");
  const [token] = useState(() => `link-${crypto.randomUUID().slice(0, 8)}`);
  const [typed, setTyped] = useState("");
  const [linkTyped, setLinkTyped] = useState("");
  const [phraseOk, setPhraseOk] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  const [title, setTitle] = useState("");
  const [age, setAge] = useState("");
  const [body, setBody] = useState("");
  const [captchaOk, setCaptchaOk] = useState(false);

  function resize(n: number) {
    setCount(Math.min(12, Math.max(1, n || 1)));
  }

  const notice: Notice = { title, age, body };
  const bytes = noticeBytes(notice);
  const hasText = `${title}${age}${body}`.trim().length > 0;

  async function make() {
    if (!phraseOk) {
      if (!copied || typed.toLowerCase() !== mnemonic.slice(0, 4)) {
        onError(es ? "Copia el mnemónico y escribe las 4 primeras letras." : "Copy the mnemonic and type its first 4 letters.");
        return;
      }
      setPhraseOk(true);
    }
    if (bytes > NOTICE_LIMIT) {
      onError(es ? "El texto pasa de 1kb." : "That text is over 1kb.");
      return;
    }
    if (hasText && !captchaOk) {
      onError(es ? "Completa la prueba antes de publicar texto." : "Finish the check before publishing text.");
      return;
    }
    if (vis === "private") {
      const err = checkPass(code);
      if (err) {
        onError(err);
        return;
      }
    }
    if (vis === "unlisted" && linkTyped.toLowerCase() !== token.slice(0, 4)) {
      onError(es ? "Escribe las 4 primeras letras del enlace." : "Type the first 4 letters of the link.");
      return;
    }
    const secretKey = vis === "private" ? code : vis === "unlisted" ? token : "";
    const sealed = secretKey && hasText ? await sealNotice(notice, secretKey) : "";
    const files: { name: string; data: Uint8Array }[] = [];
    const rows: Cloth[] = [];
    const listed: { file: string; index: number; pattern: string }[] = [];
    for (let i = 0; i < count; i++) {
      const secret = await serialBytes(mnemonic, name, start + i);
      const id = patternId(secret);
      const png = new Uint8Array(await (await renderPng(secret, colors)).arrayBuffer());
      const file = `${name}-${start + i}.png`;
      files.push({ name: file, data: png });
      listed.push({ file, index: start + i, pattern: id });
      rows.push({
        id,
        name,
        index: start + i,
        visibility: vis,
        owner,
        notice: hasText ? notice : null,
        sealed,
      });
    }
    const manifest = {
      name,
      look,
      creator: `Creator ${owner}`,
      visibility: vis,
      files: listed,
      notice: vis === "public" ? notice : "Sealed in this browser. The password is not in this file.",
    };
    files.push({ name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    const pdf = pdfBytes(
      `${name}\nCreator ${owner}\n${vis}\n${listed.map((f) => `${f.file} ${f.pattern}`).join("\n")}\nOne permission covers the whole set.`,
    );
    files.push({ name: "batch.pdf", data: pdf });
    downloadBlob(makeZip(files), `${name}.zip`, "application/zip");
    onSaved(rows);
  }

  return (
    <Sheet title={es ? "Usar este" : "Use this"} onClose={onClose}>
      <p>
        {es
          ? "El conjunto mantiene este aspecto. Cada tela cambia un poco, y la cámara puede distinguirlas."
          : "The set keeps this look. Each cloth changes a little, and a camera can tell them apart."}
      </p>
      {!phraseOk && (
        <>
          <p className="mt-2 text-sand">
            {es
              ? "Este mnemónico se muestra una vez. Si lo pierdes, no hay reinicio."
              : "This mnemonic is shown once. A lost mnemonic cannot be reset."}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn inline-flex items-center gap-2" aria-pressed={shown} onClick={() => setShown((v) => !v)}>
              {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              {shown ? (es ? "Ocultar" : "Hide") : es ? "Mostrar" : "Show"}
            </button>
            <button
              type="button"
              className="btn inline-flex items-center gap-2"
              onClick={() => {
                void navigator.clipboard.writeText(mnemonic);
                setCopied(true);
              }}
            >
              <Copy className="size-4" aria-hidden="true" />
              {es ? "Copiar" : "Copy"}
            </button>
          </div>
          <MnemonicBlocks words={mnemonic.trim().split(/\s+/)} shown={shown} />
          <label className="mt-3 block">
            {es ? "Escribe las 4 primeras letras" : "Type the first 4 letters"}
            <input className="field" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
        </>
      )}
      <label className="mt-3 block">
        {es ? "Nombre" : "Name"}
        <input className="field" value={name} onChange={(e) => onNamed(e.target.value)} />
      </label>
      <label className="mt-3 block">
        {es ? "Cuántas" : "How many"}
        <input className="field" type="number" min={1} max={12} value={count} onChange={(e) => resize(Number(e.target.value))} />
      </label>
      <label className="mt-3 block">
        {es ? "Empieza en" : "Start at"}
        <input className="field" type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} />
      </label>
      <label className="mt-3 block">
        {es ? "Permiso del conjunto" : "Permission for the whole set"}
        <select className="field" value={vis} onChange={(e) => setVis(e.target.value as Visibility)}>
          <option value="public">Public</option>
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
        </select>
      </label>
      <p className="mt-3 text-sm">
        {es
          ? "Un solo texto para todas las telas de este conjunto. Título, edad y cuerpo. Markdown permitido. Máximo 1kb."
          : "One note for every cloth in this set. Title, age, and body. Markdown is allowed. 1kb at most."}
      </p>
      <label className="mt-2 block">
        {es ? "Título" : "Title"}
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="mt-2 block">
        {es ? "Edad" : "Age"}
        <input className="field" value={age} onChange={(e) => setAge(e.target.value)} />
      </label>
      <label className="mt-2 block">
        {es ? "Cuerpo" : "Body"}
        <textarea className="field h-28" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <p className={`mt-1 text-sm ${bytes > NOTICE_LIMIT ? "text-danger" : "text-muted"}`}>
        {bytes} / {NOTICE_LIMIT}
      </p>
      {hasText && <Captcha es={es} onPass={setCaptchaOk} />}
      {vis === "private" && (
        <>
          <p className="mt-3 text-sm text-muted">
            {es
              ? "El código privado necesita 16 caracteres y 3 tipos: minúsculas, mayúsculas, números, símbolos."
              : "A private code needs 16 characters and 3 kinds: small letters, big letters, numbers, symbols."}
          </p>
          <label className="mt-2 block">
            {es ? "Código" : "Code"}
            <input className="field" type="password" autoComplete="new-password" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        </>
      )}
      {vis === "unlisted" && (
        <p className="mt-3 text-sm">
          {es ? "Enlace, una sola vez:" : "Link, shown once:"} <span className="text-sand">{token}</span>
          <label className="mt-2 block">
            {es ? "Escribe las 4 primeras letras del enlace" : "Type the first 4 letters of the link"}
            <input className="field" autoComplete="off" value={linkTyped} onChange={(e) => setLinkTyped(e.target.value)} />
          </label>
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-primary" onClick={make}>
          {phraseOk ? (es ? "Descargar" : "Download") : es ? "Confirmar" : "Confirm"}
        </button>
        <button type="button" className="btn-quiet" onClick={onClose}>
          {es ? "Cerrar" : "Close"}
        </button>
      </div>
    </Sheet>
  );
}

function VisIcon({ vis }: { vis: Visibility }) {
  const Icon = vis === "public" ? Globe : vis === "private" ? EyeOff : Link2;
  const label = vis === "public" ? "Public" : vis === "private" ? "Private" : "Unlisted";
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted" title={label}>
      <Icon className="size-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ScanSheet({
  es,
  cloths,
  owner,
  onError,
  onClose,
}: {
  es: boolean;
  cloths: Cloth[];
  owner: string;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const recent = useRef<number[]>([]);
  const [found, setFound] = useState<Cloth | null>(null);
  const [code, setCode] = useState("");
  const [plain, setPlain] = useState<Notice | null>(null);
  const [gate, setGate] = useState(false);
  const [pending, setPending] = useState<File | null>(null);

  async function read(file: File) {
    const id = await readPattern(file);
    if (!id) {
      onError(es ? "Esta foto no es una tela de CamoKey." : "This photo is not a CamoKey cloth.");
      setFound(null);
      return;
    }
    const row = cloths.find((c) => c.id === id) ?? null;
    setFound(row);
    setPlain(null);
    setCode("");
    if (!row) onError(es ? "La tela no está en este conjunto." : "This cloth is not in this set.");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const now = Date.now();
    recent.current = recent.current.filter((t) => now - t < 1000);
    recent.current.push(now);
    if (recent.current.length > 1) {
      setPending(file);
      setGate(true);
      return;
    }
    await read(file);
  }

  async function tryOpen() {
    if (!found || !found.sealed) return;
    const notice = await openNotice(found.sealed, code);
    if (!notice) {
      onError(es ? "Esa clave no abre el texto." : "That key does not open the text.");
      return;
    }
    setPlain(notice);
  }

  const own = found && owner === found.owner && found.notice;
  const shown = found?.visibility === "public" ? found.notice : own ? found?.notice : plain;

  return (
    <Sheet title="Scan" onClose={onClose}>
      <p>{es ? "Usa la cámara o una foto." : "Use the camera or a photo."}</p>
      <label className="mt-3 block">
        {es ? "Foto" : "Photo"}
        <input
          className="field"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      {gate && (
        <div className="mt-3">
          <p className="text-sm">{es ? "Dos fotos en un segundo. Completa la prueba." : "Two photos in one second. Finish the check."}</p>
          <Captcha
            es={es}
            onPass={(ok) => {
              if (!ok || !pending) return;
              setGate(false);
              const file = pending;
              setPending(null);
              void read(file);
            }}
          />
        </div>
      )}
      {found && (
        <div className="mt-3">
          <p className="inline-flex items-center gap-2">
            <VisIcon vis={found.visibility} />
            {found.visibility === "public" ? "Public" : found.visibility === "private" ? "Private" : "Unlisted"} · {found.name}-
            {found.index}
          </p>
          {found.visibility !== "public" && !shown && (
            <label className="mt-2 block">
              {found.visibility === "private" ? (es ? "Contraseña" : "Password") : es ? "Enlace" : "Link"}
              <input className="field" type={found.visibility === "private" ? "password" : "text"} value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          )}
          {shown && <NoticeView notice={shown} />}
          {found.visibility !== "public" && !shown && (
            <button type="button" className="btn-primary mt-3" onClick={() => void tryOpen()}>
              {es ? "Descifrar" : "Decrypt"}
            </button>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-quiet" onClick={onClose}>
          {es ? "Cerrar" : "Close"}
        </button>
      </div>
    </Sheet>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  return (
    <article className="win-in mt-3 p-2">
      <h3 className="font-bold">{notice.title || "Untitled"}</h3>
      {notice.age && <p className="text-sm text-muted">{notice.age}</p>}
      <Markdown text={notice.body} />
    </article>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="mt-2 space-y-1">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h3 key={i} className="font-bold">{rich(line.slice(2))}</h3>;
        if (line.startsWith("- ")) return <p key={i}>• {rich(line.slice(2))}</p>;
        return <p key={i}>{line ? rich(line) : "\u00a0"}</p>;
      })}
    </div>
  );
}

function rich(text: string) {
  const parts: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let mark: RegExpExecArray | null;
  let key = 0;
  while ((mark = re.exec(text))) {
    if (mark.index > last) parts.push(text.slice(last, mark.index));
    const token = mark[0];
    if (token.startsWith("`")) parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    else {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("(") + 1, -1);
      parts.push(
        <a key={key++} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>,
      );
    }
    last = mark.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Captcha({ es, onPass }: { es: boolean; onPass: (ok: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);

  function draw() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let next = "";
    for (let i = 0; i < 6; i++) next += alphabet[Math.floor(Math.random() * alphabet.length)]!;
    setCode(next);
    setTyped("");
    setBad(false);
    onPass(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = 220;
    canvas.height = 64;
    ctx.fillStyle = "#d4d0c8";
    ctx.fillRect(0, 0, 220, 64);
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = i % 2 ? "#000080" : "#808080";
      ctx.beginPath();
      ctx.moveTo(Math.random() * 220, Math.random() * 64);
      ctx.bezierCurveTo(Math.random() * 220, Math.random() * 64, Math.random() * 220, Math.random() * 64, Math.random() * 220, Math.random() * 64);
      ctx.stroke();
    }
    ctx.font = "bold 28px Tahoma, sans-serif";
    ctx.fillStyle = "#000";
    for (let i = 0; i < next.length; i++) {
      ctx.save();
      ctx.translate(16 + i * 34, 44);
      ctx.rotate((Math.random() - 0.5) * 0.6);
      ctx.fillText(next[i]!, 0, 0);
      ctx.restore();
    }
  }

  useEffect(() => {
    draw();
    // The picture is drawn once per mount, and again from the New button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-3">
      <p className="text-sm">{es ? "Escribe las letras de la imagen." : "Type the letters in the picture."}</p>
      <canvas ref={canvasRef} className="win-in mt-2" aria-hidden="true" />
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="field w-40" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            const ok = typed === code;
            setBad(!ok);
            onPass(ok);
          }}
        >
          {es ? "Comprobar" : "Check"}
        </button>
        <button type="button" className="btn-quiet" onClick={draw}>
          {es ? "Otra" : "New"}
        </button>
      </div>
      {bad && <p className="mt-1 text-sm text-danger">{es ? "No coincide." : "That does not match."}</p>}
    </div>
  );
}
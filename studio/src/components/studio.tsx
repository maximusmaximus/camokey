import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Check,
  Copy,
  Dices,
  Eye,
  EyeOff,
  Github,
  Globe,
  ImageUp,
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
  colorLuma,
  drawCamo,
  fingerprint,
  isMnemonicWord,
  lumaSpan,
  MIN_LUMA_GAP,
  MIN_LUMA_PERCENT,
  patternId,
  randomMnemonic,
  readCanvas,
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
    ["Random", "Random makes a new key and a new cloth. That key always draws this picture."],
    ["Color", "Color changes the dyes. Pick a set, or mix your own."],
    ["Use this", "Use this keeps the picture you see and lets you make a set."],
    ["Your mnemonic", "You already have a mnemonic. It made this picture. You can paste your own."],
    ["Who can read it", "Public means anyone. Private needs a code. Unlisted needs a link."],
    ["Lost words", "If you lose the mnemonic, no one can reset it. Write it down."],
    ["Come back", "The i button opens this again."],
  ],
  es: [
    ["La tela", "Esta imagen llena la pantalla. Es un patrón real, no una muestra."],
    ["Al azar", "Al azar hace una clave nueva y una tela nueva. Esa clave siempre dibuja esta imagen."],
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
  const [history, setHistory] = useState<string[]>([]);
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
  const [rollGate, setRollGate] = useState(false);
  const rolls = useRef<number[]>([]);

  const ready = mnemonic.length > 0;
  const es = lang === "es";
  const colors = custom ?? [...PRESETS[preset]!.colors];

  useEffect(() => {
    const first = randomMnemonic();
    setMnemonic(first);
    setHistory([first]);
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

  function mint() {
    const next = randomMnemonic();
    setHistory((h) => [...h, next]);
    setMnemonic(next);
    setIndex(0);
  }

  function roll() {
    const now = Date.now();
    rolls.current = rolls.current.filter((t) => now - t < 1000);
    rolls.current.push(now);
    if (rolls.current.length > 3) {
      setRollGate(true);
      return;
    }
    mint();
  }

  function back() {
    if (history.length < 2) return;
    const next = history.slice(0, -1);
    setHistory(next);
    setMnemonic(next[next.length - 1]!);
    setIndex(0);
  }

  return (
    <main className="relative h-full overflow-hidden bg-ink text-bone">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" aria-hidden="true" />
      <header className="app-topbar pointer-events-none fixed inset-x-3 z-20 flex items-center justify-between">
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
      {sheet === "none" && (
        <a
          href="https://github.com/maximusmaximus/camokey"
          target="_blank"
          rel="noreferrer"
          className="win fixed right-2 z-20 inline-flex items-center gap-1 px-2 py-1 text-xs bottom-[calc(9rem+env(safe-area-inset-bottom))] md:right-3 md:bottom-3"
        >
          <Github className="size-4" aria-hidden="true" />
          GitHub
        </a>
      )}
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
          mnemonic={mnemonic}
          name={name}
          index={index}
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
            const phrase = words.join(" ");
            setMnemonic(phrase);
            setIndex(0);
            setHistory((h) => [...h, phrase]);
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
      {rollGate && (
        <Sheet title={es ? "Demasiado rápido" : "Too fast"} onClose={() => setRollGate(false)}>
          <p>{es ? "Más de 3 al azar en un segundo. Completa la prueba." : "More than 3 random keys in one second. Finish the check."}</p>
          <Captcha
            es={es}
            onPass={(ok) => {
              if (!ok) return;
              rolls.current = [];
              setRollGate(false);
              mint();
            }}
          />
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
    <div className="sheet-frame fixed inset-0 z-30 px-8 pb-8 md:px-16 md:pb-16" role="presentation" onMouseDown={onClose}>
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
  mnemonic,
  name,
  index,
  onLang,
  onPreset,
  onCustom,
  onClose,
}: {
  es: boolean;
  lang: Lang;
  colors: string[];
  mnemonic: string;
  name: string;
  index: number;
  onLang: () => void;
  onPreset: (i: number) => void;
  onCustom: (colors: string[]) => void;
  onClose: () => void;
}) {
  const opened = useRef(colors);
  const magRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState(colors);
  const [picked, setPicked] = useState(0);
  const [blocked, setBlocked] = useState("");
  const current = draft[picked] ?? "#000000";
  const spanPct = (lumaSpan(draft) / 255) * 100;
  const lumas = draft.map((hex) => colorLuma(hex));
  const darkAt = lumas.indexOf(Math.min(...lumas));
  const lightAt = lumas.indexOf(Math.max(...lumas));
  const need = MIN_LUMA_PERCENT.toFixed(1);
  const hsv = hexToHsv(current);

  useEffect(() => {
    if (colors.join(",") !== draft.join(",")) setDraft(colors.slice());
  }, [colors, draft]);

  function tryColor(hex: string) {
    const next = draft.slice();
    next[picked] = hex;
    const gap = lumaSpan(next);
    if (gap < MIN_LUMA_GAP) {
      const pct = ((gap / 255) * 100).toFixed(1);
      setBlocked(
        es
          ? `Demasiado cerca. Eso dejaría ${pct}%. Hace falta ${need}%.`
          : `Too close. That would leave ${pct}%. Keep at least ${need}%.`,
      );
      return;
    }
    setBlocked("");
    setDraft(next);
    onCustom(next);
  }

  function revert() {
    const next = opened.current.slice();
    setDraft(next);
    setBlocked("");
    onCustom(next);
  }

  useEffect(() => {
    const canvas = wheelRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = 168;
    canvas.width = size;
    canvas.height = size;
    const r = size / 2;
    for (let a = 0; a < 360; a += 1) {
      const start = ((a - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r - 1, start, start + 0.02);
      ctx.closePath();
      ctx.fillStyle = `hsl(${a} 100% 50%)`;
      ctx.fill();
    }
    const fade = ctx.createRadialGradient(r, r, 0, r, r, r);
    fade.addColorStop(0, "rgba(255,255,255,1)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fade;
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const secret = await serialBytes(mnemonic, name, index);
      if (cancel) return;
      const canvas = magRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const big = document.createElement("canvas");
      big.width = 320;
      big.height = 320;
      const bctx = big.getContext("2d");
      if (!bctx) return;
      drawCamo(bctx, 320, 320, secret, draft);
      canvas.width = 180;
      canvas.height = 180;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(big, 120, 120, 80, 80, 0, 0, 180, 180);
    })();
    return () => {
      cancel = true;
    };
  }, [mnemonic, name, index, draft]);

  function fromWheel(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = wheelRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const dist = Math.hypot(x, y);
    if (dist > rect.width / 2) return;
    let hue = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (hue < 0) hue += 360;
    const sat = Math.min(1, dist / (rect.width / 2));
    tryColor(hsvToHex(hue, sat, hsv.v));
  }

  const markX = 50 + Math.cos(((hsv.h - 90) * Math.PI) / 180) * hsv.s * 46;
  const markY = 50 + Math.sin(((hsv.h - 90) * Math.PI) / 180) * hsv.s * 46;

  return (
    <div className="pointer-events-none fixed inset-0 z-30" style={{ paddingTop: "var(--grok-banner-h, 0px)" }}>
      <div
        role="dialog"
        aria-label="Color"
        className="pointer-events-auto absolute inset-x-2 bottom-2 flex max-h-[68dvh] w-auto flex-col bg-[#c0c0c0] text-black shadow-[inset_-1px_-1px_0_#000,inset_1px_1px_0_#fff,inset_-2px_-2px_0_#808080,inset_2px_2px_0_#dfdfdf] md:inset-x-auto md:right-4 md:bottom-4 md:w-80"
      >
        <div className="flex items-center justify-between bg-[#000080] px-2 py-1 text-white">
          <h2 className="text-base font-bold">{es ? "Color" : "Color"}</h2>
          <div className="flex gap-1">
            <button type="button" className="btn min-h-0 px-2 py-0" onClick={revert} aria-label={es ? "Deshacer" : "Undo colors"}>
              <Undo2 className="size-4" aria-hidden="true" />
            </button>
            <button type="button" className="btn min-h-0 px-2 py-0 leading-none" onClick={onClose} aria-label="Close">
              X
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-auto p-3">
          <p className="text-sm">{es ? "Esta pieza, más grande. El resto de la tela cambia a la vez." : "This piece, larger. The rest of the cloth changes with it."}</p>
          <canvas ref={magRef} className="win-in mt-2 h-28 w-full object-cover md:h-36" aria-hidden="true" />
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {PRESETS.map((p, i) => (
              <button
                key={p.name}
                type="button"
                aria-label={p.name}
                title={p.name}
                className="size-7 shrink-0 border-2 border-black"
                style={{ background: p.colors[1] }}
                onClick={() => onPreset(i)}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {draft.map((hex, i) => (
              <button
                key={`${i}-${hex}`}
                type="button"
                aria-pressed={picked === i}
                aria-label={es ? `Tinte ${i + 1}` : `Dye ${i + 1}`}
                className={`grid h-12 flex-1 place-items-center border-2 text-xs ${picked === i ? "border-[#000080] outline outline-2 outline-[#000080]" : "border-black"}`}
                style={{ background: hex, color: colorLuma(hex) > 140 ? "#1c1e18" : "#f3efe4" }}
                onClick={() => {
                  setPicked(i);
                  setBlocked("");
                }}
              >
                {picked === i ? (es ? "Este" : "This") : i === darkAt ? (es ? "Osc." : "Dark") : i === lightAt ? (es ? "Claro" : "Light") : i + 1}
              </button>
            ))}
          </div>
          <div className="relative mx-auto mt-3 w-40">
            <canvas
              ref={wheelRef}
              className="h-40 w-40 touch-none"
              aria-label={es ? "Rueda de color" : "Color wheel"}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                fromWheel(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) fromWheel(event);
              }}
            />
            <span
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-white"
              style={{ left: `${markX}%`, top: `${markY}%` }}
            />
          </div>
          <label className="mt-2 block text-sm">
            {es ? "Brillo" : "Brightness"} {Math.round(hsv.v * 100)}
            <input
              className="field"
              type="range"
              min={0}
              max={100}
              value={Math.round(hsv.v * 100)}
              onChange={(event) => tryColor(hsvToHex(hsv.h, hsv.s, Number(event.target.value) / 100))}
            />
          </label>
          <p className="mt-1 text-sm text-muted">
            {es ? `Brillo entre tintes: ${spanPct.toFixed(1)}%. Hace falta ${need}%.` : `Dye span ${spanPct.toFixed(1)}%. Needs ${need}%.`}
          </p>
          {blocked && <p className="mt-1 text-sm text-danger">{blocked}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" className="btn-quiet" onClick={onLang}>
              {lang === "en" ? "Español" : "English"}
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              {es ? "Poner" : "Set"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function hexToHsv(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const ch = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
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
  const [body, setBody] = useState("");
  const [captchaOk, setCaptchaOk] = useState(false);

  function resize(n: number) {
    setCount(Math.min(12, Math.max(1, n || 1)));
  }

  const notice: Notice = { title, body };
  const bytes = noticeBytes(notice);
  const hasText = `${title}${body}`.trim().length > 0;

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
          ? "Un solo texto para todas las telas de este conjunto. Título y cuerpo. Markdown permitido. Máximo 1kb."
          : "One note for every cloth in this set. Title and body. Markdown is allowed. 1kb at most."}
      </p>
      <label className="mt-2 block">
        {es ? "Título" : "Title"}
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const grabRef = useRef<HTMLCanvasElement>(null);
  const clothsRef = useRef(cloths);
  const recent = useRef<number[]>([]);
  const stopScan = useRef(false);
  clothsRef.current = cloths;
  const [camError, setCamError] = useState("");
  const [looking, setLooking] = useState(true);
  const [note, setNote] = useState("");
  const [hit, setHit] = useState("");
  const [found, setFound] = useState<Cloth | null>(null);
  const [code, setCode] = useState("");
  const [plain, setPlain] = useState<Notice | null>(null);
  const [gate, setGate] = useState(false);
  const [pending, setPending] = useState<File | null>(null);

  function present(id: string) {
    const row = clothsRef.current.find((c) => c.id === id) ?? null;
    stopScan.current = true;
    setHit(id);
    setFound(row);
    setPlain(null);
    setCode("");
    setLooking(false);
    setNote("");
  }

  function resume() {
    setHit("");
    setFound(null);
    setPlain(null);
    setCode("");
    setLooking(true);
    stopScan.current = false;
  }

  useEffect(() => {
    let dead = false;
    let busy = false;
    const streamBox: { current: MediaStream | null } = { current: null };
    async function loop() {
      const video = videoRef.current;
      const canvas = grabRef.current;
      if (busy || !video || !canvas || video.readyState < 2 || stopScan.current) return;
      busy = true;
      try {
        const w = 480;
        const ratio = video.videoWidth ? video.videoHeight / video.videoWidth : 0.75;
        canvas.width = w;
        canvas.height = Math.max(64, Math.round(w * ratio));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const id = readCanvas(canvas, false);
        if (id && !dead) present(id);
      } finally {
        busy = false;
      }
    }
    let timer = 0;
    const tick = () => {
      if (dead) return;
      void loop();
      timer = window.setTimeout(tick, 700);
    };
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (dead) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamBox.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        timer = window.setTimeout(tick, 400);
      } catch {
        if (!dead) {
          setCamError(es ? "La cámara no está disponible. Sube una foto." : "The camera is not available. Upload a picture.");
          setLooking(false);
        }
      }
    })();
    return () => {
      dead = true;
      window.clearTimeout(timer);
      streamBox.current?.getTracks().forEach((track) => track.stop());
    };
  }, [es]);

  async function read(file: File) {
    const id = await readPattern(file);
    if (!id) {
      setNote(es ? "Esta foto no es una tela de CamoKey." : "This picture is not a CamoKey cloth.");
      onError(es ? "Esta foto no es una tela de CamoKey." : "This picture is not a CamoKey cloth.");
      return;
    }
    present(id);
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
    if (!found?.sealed) return;
    const notice = await openNotice(found.sealed, code);
    if (!notice) {
      setNote(es ? "Esa clave no abre el texto." : "That key does not open the text.");
      onError(es ? "Esa clave no abre el texto." : "That key does not open the text.");
      return;
    }
    setNote("");
    setPlain(notice);
  }

  const own = found && owner === found.owner && found.notice;
  const shown = found?.visibility === "public" ? found.notice : own ? found.notice : plain;
  const locked = Boolean(found && found.visibility !== "public" && !shown);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#c0c0c0]" style={{ paddingTop: "var(--grok-banner-h, 0px)" }}>
      <div className="flex items-center justify-between bg-[#000080] px-2 py-1 text-white">
        <h2 className="text-base font-bold">Scan</h2>
        <button type="button" className="btn min-h-0 px-2 py-0 leading-none" onClick={onClose} aria-label="Close">
          X
        </button>
      </div>
      <div className="win-in relative m-2 min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        <canvas ref={grabRef} className="hidden" />
        {looking && !hit && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-white">
            {es ? "Buscando un patrón…" : "Looking for a pattern…"}
          </p>
        )}
        {camError && <p className="absolute inset-x-3 top-3 bg-[#c0c0c0] p-2 text-sm text-black">{camError}</p>}
        {note && !hit && <p className="absolute inset-x-3 top-3 bg-[#c0c0c0] p-2 text-sm text-danger">{note}</p>}
      </div>
      <div className="taskbar flex justify-center p-2">
        <label className="btn inline-flex cursor-pointer items-center gap-2">
          <ImageUp className="size-4" aria-hidden="true" />
          {es ? "Subir una foto" : "Upload a picture"}
          <input className="sr-only" type="file" accept="image/*" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </div>
      {hit && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 p-6" style={{ paddingTop: "calc(1.5rem + var(--grok-banner-h, 0px))" }}>
          <div
            role="dialog"
            aria-label={found ? found.name : "Pattern"}
            className="flex max-h-full w-full max-w-md flex-col bg-[#c0c0c0] text-black shadow-[inset_-1px_-1px_0_#000,inset_1px_1px_0_#fff,inset_-2px_-2px_0_#808080,inset_2px_2px_0_#dfdfdf]"
          >
            <div className="flex items-center justify-between bg-[#000080] px-2 py-1 text-white">
              <h2 className="truncate text-base font-bold">{found ? found.name : es ? "Patrón" : "Pattern"}</h2>
              <button type="button" className="btn min-h-0 px-2 py-0 leading-none" onClick={resume} aria-label="Close">
                X
              </button>
            </div>
            <div className="min-h-0 overflow-auto p-3">
              {found ? (
                <>
                  <dl className="win-in grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 p-2 text-sm">
                    <dt className="text-muted">{es ? "Tela" : "Cloth"}</dt>
                    <dd>
                      {found.name}-{found.index}
                    </dd>
                    <dt className="text-muted">{es ? "Permiso" : "Permission"}</dt>
                    <dd className="inline-flex items-center gap-1">
                      <VisIcon vis={found.visibility} />
                      {found.visibility === "public" ? "Public" : found.visibility === "private" ? "Private" : "Unlisted"}
                    </dd>
                    <dt className="text-muted">{es ? "Creador" : "Maker"}</dt>
                    <dd>{found.owner}</dd>
                    <dt className="text-muted">{es ? "Patrón" : "Pattern"}</dt>
                    <dd className="break-all font-mono text-xs">{found.id}</dd>
                  </dl>
                  {locked && (
                    <label className="mt-3 block">
                      {found.visibility === "private" ? (es ? "Contraseña" : "Password") : es ? "Enlace" : "Link"}
                      <input
                        className="field"
                        type={found.visibility === "private" ? "password" : "text"}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </label>
                  )}
                  {note && <p className="mt-2 text-sm text-danger">{note}</p>}
                  {shown ? (
                    <NoticeView notice={shown} />
                  ) : found.visibility === "public" ? (
                    <p className="mt-3 text-sm">{es ? "Este conjunto no tiene nota." : "This set has no note."}</p>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    {locked && (
                      <button type="button" className="btn-primary" onClick={() => void tryOpen()}>
                        {es ? "Descifrar" : "Decrypt"}
                      </button>
                    )}
                    <button type="button" className="btn" onClick={resume}>
                      {es ? "Seguir" : "Keep scanning"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>{es ? "Este patrón no está guardado en este navegador." : "This pattern is not saved in this browser."}</p>
                  <p className="win-in mt-2 break-all p-2 font-mono text-xs">{hit}</p>
                  <div className="mt-3 flex justify-end">
                    <button type="button" className="btn" onClick={resume}>
                      {es ? "Seguir" : "Keep scanning"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {gate && (
        <Sheet title={es ? "Demasiado rápido" : "Too fast"} onClose={() => setGate(false)}>
          <p>{es ? "Dos fotos en un segundo. Completa la prueba." : "Two pictures in one second. Finish the check."}</p>
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
        </Sheet>
      )}
    </div>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  return (
    <article className="win-in mt-3 p-2">
      <h3 className="font-bold">{notice.title || "Untitled"}</h3>
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

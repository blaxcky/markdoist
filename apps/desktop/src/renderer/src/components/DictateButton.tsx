// Diktieren (4.9) am Desktop: Aufnahme mit MediaRecorder im Renderer, Erkennung und Bereinigung im Main-Prozess.
import { useEffect, useRef, useState } from "react";
import { formatDuration, LOCAL_PCM_MIME, LOCAL_SAMPLE_RATE, MAX_RECORDING_MS, T, transcribeTarget, type DictationContext, type DictationErrorKind, type DictationResult } from "@markdoist/app";
import { bridge } from "../bridge";
import { IconMic } from "./Icons";

type Phase = "idle" | "recording" | "transcribing" | "cleaning" | "error" | "discarded";

/** So lange lässt sich eine abgebrochene Aufnahme noch zurückholen. */
const UNDO_MS = 10_000;

export const OPEN_DICTATION_SETTINGS = "markdoist:dictation-settings";

function pickMime(): string {
  const want = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return want.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

/**
 * Für die lokale Erkennung (4.12): Aufnahme zu mono Float32 mit 16 kHz dekodieren. decodeAudioData rechnet
 * auf die Abtastrate des Kontexts um.
 */
async function toPcm(blob: Blob): Promise<ArrayBuffer> {
  const ctx = new OfflineAudioContext(1, 1, LOCAL_SAMPLE_RATE);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i]! += data[i]! / buf.numberOfChannels;
  }
  return out.buffer;
}

/**
 * `onBusy`: meldet, ob Aufnahme, Übertragung oder ein wiederholbarer Fehler läuft. `dictation:phase` geht an
 * alle Knöpfe; eine Ansicht mit mehreren Knöpfen (Titel und Beschreibung, 4.13) blendet die anderen solange aus.
 *
 * „Abbrechen“ verwirft nicht sofort: Die Aufnahme bleibt `UNDO_MS` lang liegen, „Wiederherstellen“ schickt sie
 * wie „Fertig“. Das Mikrofon ist da schon wieder frei; der Mikrofon-Knopf in der Leiste startet eine neue Aufnahme.
 */
export function DictateButton({
  ctx,
  onResult,
  onError,
  onBusy,
  testId = "dictate",
  label,
}: {
  ctx: () => DictationContext;
  onResult(r: DictationResult): void;
  onError(kind: DictationErrorKind): void;
  onBusy?(busy: boolean): void;
  testId?: string;
  label?: string;
}) {
  const D = T.dictation;
  const [phase, setPhase] = useState<Phase>("idle");
  const [ms, setMs] = useState(0);
  const [error, setError] = useState<DictationErrorKind | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<{ buf: ArrayBuffer; mime: string } | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const undo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0);
  // Aufnahme-Nummer: Nachzügler einer verworfenen Aufnahme (onstop, Dekodieren) laufen ins Leere.
  const recId = useRef(0);
  // Was nach dem Ende der Aufnahme passiert: senden, liegen lassen (abgebrochen) oder verwerfen.
  const after = useRef<"send" | "hold" | "drop">("send");
  // Dekodieren nach dem Stopp läuft noch.
  const converting = useRef(false);
  // Laufende oder abgebrochene Erkennung; „Wiederherstellen“ übernimmt ihr Ergebnis, statt doppelt zu senden.
  const run = useRef<ReturnType<ReturnType<typeof bridge>["dictation"]["run"]> | null>(null);
  const localStt = useRef(false);
  const cb = useRef({ ctx, onResult, onError, onBusy });
  cb.current = { ctx, onResult, onError, onBusy };
  // Während der Rückgängig-Frist ist das Diktat nicht beschäftigt; die anderen Knöpfe kommen zurück.
  const busy = phase !== "idle" && phase !== "discarded";
  useEffect(() => cb.current.onBusy?.(busy), [busy]);
  useEffect(() => () => cb.current.onBusy?.(false), []);

  const stopTick = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  };
  const clearUndo = () => {
    if (undo.current) clearTimeout(undo.current);
    undo.current = null;
  };
  const release = (r: MediaRecorder) => {
    r.stream.getTracks().forEach((t) => t.stop());
    if (rec.current === r) rec.current = null;
  };

  useEffect(() => bridge().dictation.onPhase((p) => setPhase((x) => (x === "transcribing" || x === "cleaning" ? p : x))), []);
  useEffect(
    () => () => {
      gen.current++;
      recId.current++;
      after.current = "drop";
      stopTick();
      clearUndo();
      const r = rec.current;
      if (r?.state === "recording") r.stop();
      if (r) release(r);
    },
    [],
  );

  const send = async () => {
    const a = audio.current;
    if (!a) return;
    const my = ++gen.current;
    setPhase("transcribing");
    setError(null);
    const p = run.current ?? bridge().dictation.run(a.buf, a.mime, cb.current.ctx());
    run.current = p;
    const r = await p;
    if (gen.current !== my) return;
    run.current = null;
    if (r.ok) {
      audio.current = null;
      setPhase("idle");
      cb.current.onResult(r.result);
    } else {
      if (r.kind === "empty" || r.kind === "nokey") audio.current = null;
      setError(r.kind);
      setPhase(audio.current ? "error" : "idle");
      cb.current.onError(r.kind);
    }
  };

  /** Endgültig verwerfen: nach Ablauf der Frist, bei einer neuen Aufnahme. */
  const drop = () => {
    clearUndo();
    gen.current++;
    recId.current++;
    after.current = "drop";
    audio.current = null;
    run.current = null;
    setError(null);
    setPhase("idle");
  };

  const start = async () => {
    const st = await bridge().dictation.status();
    const stt = transcribeTarget(st.settings).provider;
    localStt.current = stt === "local";
    // Lokal: Modell muss heruntergeladen sein; sonst der Schlüssel des gewählten Anbieters (4.12).
    const missing: DictationErrorKind | null =
      stt === "local" ? ((await bridge().dictation.model.status()).state === "ready" ? null : "nomodel") : st.keys[stt].hasKey ? null : "nokey";
    if (missing) {
      cb.current.onError(missing);
      window.dispatchEvent(new CustomEvent(OPEN_DICTATION_SETTINGS));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      cb.current.onError("permission");
      return;
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    const id = ++recId.current;
    chunks.current = [];
    after.current = "send";
    audio.current = null;
    run.current = null;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      release(r);
      if (id !== recId.current || after.current === "drop") return;
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
      const local = localStt.current;
      converting.current = true;
      void (local ? toPcm(blob) : blob.arrayBuffer())
        .then((buf) => {
          if (id !== recId.current) return;
          audio.current = { buf, mime: local ? LOCAL_PCM_MIME : blob.type };
          if (after.current === "send") void send();
        })
        .catch(() => {
          if (id !== recId.current || after.current !== "send") return;
          setError("empty");
          setPhase("idle");
          cb.current.onError("empty");
        })
        .finally(() => {
          if (id === recId.current) converting.current = false;
        });
    };
    rec.current = r;
    r.start(1000);
    // Auf dem Gerät (4.12): Modell schon während der Aufnahme laden.
    if (localStt.current) void bridge().dictation.model.warm();
    const t0 = Date.now();
    setMs(0);
    setPhase("recording");
    tick.current = setInterval(() => {
      const d = Date.now() - t0;
      setMs(d);
      if (d >= MAX_RECORDING_MS) stop();
    }, 250);
  };

  const stop = () => {
    stopTick();
    setPhase("transcribing");
    rec.current?.stop();
  };

  /** Abbrechen: Mikrofon sofort frei, die Aufnahme bleibt aber noch `UNDO_MS` lang zurückholbar. */
  const cancel = () => {
    gen.current++;
    stopTick();
    setError(null);
    after.current = "hold";
    if (rec.current?.state === "recording") rec.current.stop();
    if (!rec.current && !converting.current && !audio.current) return drop();
    setPhase("discarded");
    clearUndo();
    undo.current = setTimeout(drop, UNDO_MS);
  };

  /** Wiederherstellen: wie „Fertig“; wartet, falls die Aufnahme noch dekodiert wird. */
  const restore = () => {
    clearUndo();
    after.current = "send";
    if (audio.current) return void send();
    if (rec.current || converting.current) return setPhase("transcribing");
    setPhase("idle");
    cb.current.onError("empty");
  };

  const mic = (onClick: () => void) => (
    <button className="icon-btn small" onClick={onClick} title={label ?? D.record} aria-label={label ?? D.record} data-testid={testId}>
      <IconMic size={18} />
    </button>
  );

  if (phase === "idle") return mic(() => void start());
  if (phase === "discarded")
    return (
      <div className="dictate-bar discarded" data-testid="dictate-bar" role="status">
        <span className="dictate-state" data-testid="dictate-state">
          {D.discarded}
        </span>
        <button className="btn primary" onClick={restore} data-testid="dictate-restore">
          {D.restore}
        </button>
        {mic(() => {
          drop();
          void start();
        })}
      </div>
    );
  return (
    <div className={`dictate-bar ${phase}`} data-testid="dictate-bar" role="status">
      {phase === "recording" && <span className="rec-dot" aria-hidden="true" />}
      <span className="dictate-state" data-testid="dictate-state">
        {phase === "recording" && `${D.recording} ${formatDuration(ms)}`}
        {phase === "transcribing" && D.transcribing}
        {phase === "cleaning" && D.cleaning}
        {phase === "error" && error && D.errors[error]}
      </span>
      <button className="btn" onClick={cancel} data-testid="dictate-cancel">
        {D.cancel}
      </button>
      {phase === "recording" && (
        <button className="btn primary" onClick={stop} data-testid="dictate-stop">
          {D.stop}
        </button>
      )}
      {phase === "error" && (
        <button className="btn primary" onClick={() => void send()} data-testid="dictate-retry">
          {D.retry}
        </button>
      )}
    </div>
  );
}

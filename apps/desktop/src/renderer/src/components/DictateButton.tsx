// Diktieren (4.9) am Desktop: Aufnahme mit MediaRecorder im Renderer, Erkennung und Bereinigung im Main-Prozess.
import { useEffect, useRef, useState } from "react";
import { formatDuration, MAX_RECORDING_MS, T, type DictationContext, type DictationErrorKind, type DictationResult } from "@markdoist/app";
import { bridge } from "../bridge";
import { IconMic } from "./Icons";

type Phase = "idle" | "recording" | "transcribing" | "cleaning" | "error";

export const OPEN_DICTATION_SETTINGS = "markdoist:dictation-settings";

function pickMime(): string {
  const want = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return want.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function DictateButton({ ctx, onResult, onError }: { ctx: () => DictationContext; onResult(r: DictationResult): void; onError(kind: DictationErrorKind): void }) {
  const D = T.dictation;
  const [phase, setPhase] = useState<Phase>("idle");
  const [ms, setMs] = useState(0);
  const [error, setError] = useState<DictationErrorKind | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audio = useRef<{ buf: ArrayBuffer; mime: string } | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const gen = useRef(0);
  const cancelled = useRef(false);
  const cb = useRef({ ctx, onResult, onError });
  cb.current = { ctx, onResult, onError };

  const stopTick = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  };
  const release = () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
  };

  useEffect(() => bridge().dictation.onPhase((p) => setPhase((x) => (x === "transcribing" || x === "cleaning" ? p : x))), []);
  useEffect(
    () => () => {
      gen.current++;
      stopTick();
      cancelled.current = true;
      if (rec.current?.state === "recording") rec.current.stop();
      release();
    },
    [],
  );

  const send = async () => {
    const a = audio.current;
    if (!a) return;
    const my = ++gen.current;
    setPhase("transcribing");
    setError(null);
    const r = await bridge().dictation.run(a.buf, a.mime, cb.current.ctx());
    if (gen.current !== my) return;
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

  const start = async () => {
    const st = await bridge().dictation.status();
    if (!st.hasKey) {
      cb.current.onError("nokey");
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
    chunks.current = [];
    cancelled.current = false;
    audio.current = null;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      release();
      if (cancelled.current) return;
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
      void blob.arrayBuffer().then((buf) => {
        audio.current = { buf, mime: blob.type };
        void send();
      });
    };
    rec.current = r;
    r.start(1000);
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

  const cancel = () => {
    gen.current++;
    stopTick();
    cancelled.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    release();
    audio.current = null;
    setError(null);
    setPhase("idle");
  };

  if (phase === "idle")
    return (
      <button className="icon-btn small" onClick={() => void start()} title={D.record} aria-label={D.record} data-testid="dictate">
        <IconMic size={18} />
      </button>
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

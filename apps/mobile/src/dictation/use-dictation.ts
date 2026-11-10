// Diktieren (4.9): Aufnahme mit expo-audio, dann Erkennung und Bereinigung über den gemeinsamen Kern.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from "expo-audio";
import { File, UploadType } from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { DictationError, MAX_RECORDING_MS, runDictation, type DictationContext, type DictationErrorKind, type DictationResult, type FetchLike, type UploadLike } from "@markdoist/app";
import { getApiKey, loadDictationSettings, onDictationConfigChange } from "./store";

// Sprache braucht kein Stereo und keine 128 kbit/s: Mono mit 64 kbit/s hält den Upload klein (10 min ≈ 5 MB).
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 };
// Während der Aufnahme bleibt das Display an: Geht es aus, wäre die App im Hintergrund und die Aufnahme zu Ende.
const AWAKE = "dictation";

export type DictationPhase = "idle" | "starting" | "recording" | "transcribing" | "cleaning" | "error";

export interface DictationState {
  phase: DictationPhase;
  /** Aufnahmedauer in ms */
  ms: number;
  error?: DictationErrorKind;
  /** technische Ursache des Fehlers (ohne Schlüssel) */
  detail?: string;
  /** Aufnahme liegt noch vor und kann erneut gesendet werden */
  canRetry: boolean;
}

/**
 * Upload der Aufnahme nativ über expo-file-system. React Natives FormData-Upload scheiterte am Gerät
 * reproduzierbar mit „Network request failed“ (07./08.11.2026), während JSON-Anfragen durchgingen.
 */
function nativeUpload(uri: string): UploadLike {
  return async (url, { headers, fields, signal }) => {
    const r = await new File(uri).upload(url, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType: "audio/mp4",
      headers,
      parameters: Object.fromEntries(fields),
      ...(signal ? { signal } : {}),
    });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(r.body) as unknown };
  };
}

function deleteFile(uri: string | null) {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Cache-Datei; räumt notfalls das System auf
  }
}

/**
 * `enabled`: Das Detail eines Programmier-Eintrags ist offen. Dann liegen Schlüssel und Berechtigung
 * schon vor und der Recorder ist vorbereitet, damit die Aufnahme beim Antippen sofort läuft (10.11.2026:
 * vorher verging fast eine Sekunde, unter anderem weil die Berechtigungsabfrage jedes Mal eine
 * Systemseite öffnete).
 */
export function useDictation(opts: { enabled: boolean; ctx: () => DictationContext; onResult: (r: DictationResult) => void; onError: (kind: DictationErrorKind, detail?: string) => void }) {
  const { enabled } = opts;
  const recorder = useAudioRecorder(OPTIONS);
  const [state, setState] = useState<DictationState>({ phase: "idle", ms: 0, canRetry: false });
  const started = useRef(0);
  const pendingUri = useRef<string | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const cb = useRef(opts);
  cb.current = opts;
  // Abbrechen während der Übertragung: Ergebnis einer älteren Runde verwerfen.
  const gen = useRef(0);
  const phase = useRef<DictationPhase>("idle");
  phase.current = state.phase;

  // Vorbereitung: Schlüssel und Berechtigung bekannt, Recorder bereit (aber nicht gestartet).
  const [hasKey, setHasKey] = useState(false);
  const [hasPerm, setHasPerm] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const keyRef = useRef(false);
  keyRef.current = hasKey;
  const prepared = useRef(false);
  const preparedUri = useRef<string | null>(null);
  const preparing = useRef<Promise<boolean> | null>(null);

  const endCapture = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    void deactivateKeepAwake(AWAKE).catch(() => {});
  };

  const prepare = useCallback((): Promise<boolean> => {
    if (prepared.current) return Promise.resolve(true);
    if (preparing.current) return preparing.current;
    const p = (async () => {
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        prepared.current = true;
        preparedUri.current = recorder.uri || null;
        return true;
      } catch (e) {
        console.warn(`Diktieren: Vorbereitung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      } finally {
        preparing.current = null;
      }
    })();
    preparing.current = p;
    return p;
  }, [recorder]);

  /** Gibt einen vorbereiteten, nicht gestarteten Recorder frei (Mikrofon und leere Cache-Datei). */
  const release = useCallback(async () => {
    if (preparing.current) await preparing.current;
    // Eine laufende oder gerade startende Aufnahme hat den Recorder übernommen.
    if (!prepared.current || phase.current === "starting" || phase.current === "recording") return;
    prepared.current = false;
    try {
      await recorder.stop(); // ungestartet: expo-audio fängt den Fehler ab und gibt den MediaRecorder frei
    } catch {
      // schon freigegeben
    }
    deleteFile(preparedUri.current);
    preparedUri.current = null;
    void setAudioModeAsync({ allowsRecording: false });
  }, [recorder]);

  const send = useCallback(async (uri: string) => {
    const my = gen.current;
    const key = await getApiKey();
    const settings = await loadDictationSettings();
    try {
      const r = await runDictation({
        fetch: fetch as unknown as FetchLike,
        key: key ?? "",
        settings,
        ctx: cb.current.ctx(),
        upload: nativeUpload(uri),
        onPhase: (p) => gen.current === my && setState((s) => ({ ...s, phase: p })),
      });
      if (gen.current !== my) return;
      pendingUri.current = null;
      deleteFile(uri);
      setState({ phase: "idle", ms: 0, canRetry: false });
      cb.current.onResult(r);
    } catch (e) {
      if (gen.current !== my) return;
      const kind = e instanceof DictationError ? e.kind : "server";
      const detail = e instanceof Error ? e.message : String(e);
      console.warn(`Diktieren fehlgeschlagen: ${kind}: ${detail}`);
      // Ohne Schlüssel oder ohne erkannten Text hilft ein neuer Versuch mit derselben Aufnahme nicht.
      const keep = kind !== "empty";
      if (!keep) {
        pendingUri.current = null;
        deleteFile(uri);
      }
      setState((s) => ({ phase: "error", ms: s.ms, error: kind, detail, canRetry: keep && kind !== "nokey" }));
      cb.current.onError(kind, detail);
    }
  }, []);

  const stop = useCallback(async () => {
    if (phase.current !== "recording") return;
    endCapture();
    phase.current = "transcribing";
    setState((s) => ({ ...s, phase: "transcribing" }));
    try {
      await recorder.stop();
    } catch {
      // gestoppt ist gestoppt; ohne URI meldet send einen Fehler
    }
    void setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (!uri) {
      setState({ phase: "error", ms: 0, error: "server", canRetry: false });
      cb.current.onError("server");
      return;
    }
    pendingUri.current = uri;
    await send(uri);
  }, [recorder, send]);

  const start = useCallback(async () => {
    if (phase.current !== "idle" && phase.current !== "error") return;
    const fail = (kind: DictationErrorKind) => {
      endCapture();
      setState({ phase: "error", ms: 0, error: kind, canRetry: false });
      cb.current.onError(kind);
    };
    // Ohne Schlüssel gar nicht erst aufnehmen. Ist er schon bekannt, entfällt das Lesen aus dem Keystore.
    if (!keyRef.current) {
      const key = !!(await getApiKey());
      setHasKey(key);
      if (!key) {
        cb.current.onError("nokey");
        return;
      }
    }
    const my = gen.current;
    deleteFile(pendingUri.current);
    pendingUri.current = null;
    phase.current = "starting";
    setState({ phase: "starting", ms: 0, canRetry: false });
    // Läuft die Vorbereitung gerade, abwarten statt doppelt vorzubereiten.
    if (!prepared.current && preparing.current) await preparing.current;
    if (!prepared.current) {
      // Erster Start: Berechtigung abfragen (Dialog nur, wenn sie noch fehlt), dann vorbereiten.
      const known = await getRecordingPermissionsAsync();
      const perm = known.granted ? known : await requestRecordingPermissionsAsync();
      if (gen.current !== my) return;
      if (!perm.granted) return fail("permission");
      setHasPerm(true);
      if (!(await prepare())) return gen.current === my ? fail("permission") : undefined;
    }
    if (gen.current !== my) return; // während des Starts abgebrochen
    try {
      recorder.record();
    } catch {
      return fail("permission");
    }
    prepared.current = false;
    preparedUri.current = null;
    started.current = Date.now();
    phase.current = "recording";
    setState({ phase: "recording", ms: 0, canRetry: false });
    void activateKeepAwakeAsync(AWAKE).catch(() => {});
    tick.current = setInterval(() => {
      const ms = Date.now() - started.current;
      setState((s) => (s.phase === "recording" ? { ...s, ms } : s));
      if (ms >= MAX_RECORDING_MS) void stop();
    }, 250);
  }, [recorder, stop, prepare]);

  const cancel = useCallback(async () => {
    gen.current++;
    endCapture();
    // Abbrechen während des Starts: Ein vorbereiteter Recorder bleibt für den nächsten Versuch liegen.
    if (phase.current === "recording") {
      try {
        await recorder.stop();
      } catch {
        // egal
      }
      void setAudioModeAsync({ allowsRecording: false });
      deleteFile(recorder.uri);
    }
    deleteFile(pendingUri.current);
    pendingUri.current = null;
    phase.current = "idle";
    setState({ phase: "idle", ms: 0, canRetry: false });
  }, [recorder]);

  const retry = useCallback(async () => {
    const uri = pendingUri.current;
    if (!uri || phase.current !== "error") return;
    setState((s) => ({ ...s, phase: "transcribing", error: undefined }));
    await send(uri);
  }, [send]);

  // Schlüssel und Berechtigung vorab ermitteln, solange das Detail offen ist.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const loadKey = () => void getApiKey().then((k) => alive && setHasKey(!!k));
    loadKey();
    const off = onDictationConfigChange(loadKey);
    void getRecordingPermissionsAsync()
      .then((p) => alive && setHasPerm(p.granted))
      .catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, [enabled]);

  // Recorder im Leerlauf bereithalten; im Hintergrund, ohne Schlüssel oder außerhalb des Details freigeben.
  const idle = state.phase === "idle" || state.phase === "error";
  const warm = enabled && foreground && hasKey && hasPerm;
  useEffect(() => {
    if (warm && idle) void prepare();
  }, [warm, idle, prepare]);
  useEffect(() => {
    if (!warm) void release();
  }, [warm, release]);

  // Geht die App in den Hintergrund, endet die Aufnahme wie mit „Fertig“ (keine Hintergrundaufnahme).
  // Das Display bleibt während der Aufnahme an; das trifft also nur Ein/Aus-Taste oder App-Wechsel.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      setForeground(s === "active");
      if (s !== "active" && phase.current === "recording") void stop();
    });
    return () => sub.remove();
  }, [stop]);

  // Verlassen des Details bricht eine laufende Aufnahme ab. Den MediaRecorder gibt useAudioRecorder
  // beim Unmount selbst frei; hier bleibt nur die leere Datei einer vorbereiteten Aufnahme.
  useEffect(
    () => () => {
      endCapture();
      try {
        if (phase.current === "recording") void recorder.stop().catch(() => {});
      } catch {
        // schon freigegeben
      }
      if (prepared.current) {
        prepared.current = false;
        deleteFile(preparedUri.current);
      }
    },
    [recorder],
  );

  return { state, start, stop, cancel, retry };
}

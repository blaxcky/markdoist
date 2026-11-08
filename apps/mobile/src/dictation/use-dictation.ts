// Diktieren (4.9): Aufnahme mit expo-audio, dann Erkennung und Bereinigung über den gemeinsamen Kern.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from "expo-audio";
import { File, UploadType } from "expo-file-system";
import { DictationError, MAX_RECORDING_MS, runDictation, type DictationContext, type DictationErrorKind, type DictationResult, type FetchLike, type UploadLike } from "@markdoist/app";
import { getApiKey, loadDictationSettings } from "./store";

// Sprache braucht kein Stereo und keine 128 kbit/s: Mono mit 64 kbit/s hält den Upload klein (10 min ≈ 5 MB).
const OPTIONS: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 };

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

export function useDictation(opts: { ctx: () => DictationContext; onResult: (r: DictationResult) => void; onError: (kind: DictationErrorKind, detail?: string) => void }) {
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

  const stopTick = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  };

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
    stopTick();
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
    // Ohne Schlüssel gar nicht erst aufnehmen.
    if (!(await getApiKey())) {
      cb.current.onError("nokey");
      return;
    }
    deleteFile(pendingUri.current);
    pendingUri.current = null;
    setState({ phase: "starting", ms: 0, canRetry: false });
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setState({ phase: "error", ms: 0, error: "permission", canRetry: false });
      cb.current.onError("permission");
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setState({ phase: "error", ms: 0, error: "permission", canRetry: false });
      cb.current.onError("permission");
      return;
    }
    started.current = Date.now();
    setState({ phase: "recording", ms: 0, canRetry: false });
    tick.current = setInterval(() => {
      const ms = Date.now() - started.current;
      setState((s) => (s.phase === "recording" ? { ...s, ms } : s));
      if (ms >= MAX_RECORDING_MS) void stop();
    }, 250);
  }, [recorder, stop]);

  const cancel = useCallback(async () => {
    gen.current++;
    stopTick();
    if (phase.current === "recording" || phase.current === "starting") {
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
    setState({ phase: "idle", ms: 0, canRetry: false });
  }, [recorder]);

  const retry = useCallback(async () => {
    const uri = pendingUri.current;
    if (!uri || phase.current !== "error") return;
    setState((s) => ({ ...s, phase: "transcribing", error: undefined }));
    await send(uri);
  }, [send]);

  // Geht die App in den Hintergrund, endet die Aufnahme wie mit „Fertig“ (keine Hintergrundaufnahme).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" && phase.current === "recording") void stop();
    });
    return () => sub.remove();
  }, [stop]);

  // Verlassen des Details bricht eine laufende Aufnahme ab.
  useEffect(
    () => () => {
      stopTick();
      if (phase.current === "recording") void recorder.stop().catch(() => {});
    },
    [recorder],
  );

  return { state, start, stop, cancel, retry };
}

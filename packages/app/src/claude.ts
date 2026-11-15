// Claude als Text-Anbieter (4.12): Bereinigung, Titelvorschlag und „Checkliste einfügen“ über die Messages API
// mit dem offiziellen SDK. Läuft in Node (Electron-Main) und React Native.
import Anthropic from "@anthropic-ai/sdk";
import { classifyStatus, DictationError } from "./apiError";

export const CLAUDE_DEFAULT_MODEL = "claude-haiku-5-5";

export interface ClaudeTarget {
  key: string;
  model: string;
  /** Nur für E2E-Tests (lokaler Ersatzserver); sonst api.anthropic.com */
  baseUrl?: string;
  /** Eigenes fetch (Tests); sonst das globale der Plattform */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ClaudeRequest {
  system: string;
  input: string;
  /** JSON-Schema für eine strukturierte Antwort */
  schema?: Record<string, unknown>;
  /**
   * Einfache Anfrage ohne `output_config` (kein Aufwand, kein Schema), falls das Modell diese Angaben
   * ablehnt (HTTP 400), z. B. ein älteres, von Hand eingetragenes Modell.
   */
  plain?: boolean;
  maxTokens?: number;
}

function client(t: ClaudeTarget): Anthropic {
  return new Anthropic({
    apiKey: t.key.trim(),
    ...(t.baseUrl ? { baseURL: t.baseUrl } : {}),
    ...(t.fetch ? { fetch: t.fetch } : {}),
    // Erneut versuchen regelt die App selbst („Erneut versuchen“, Nachholen beim Öffnen).
    maxRetries: 0,
    timeout: t.timeoutMs ?? 120_000,
  });
}

/** Übersetzt SDK-Fehler in die Fehlerarten der App. */
export function claudeError(e: unknown): DictationError {
  if (e instanceof DictationError) return e;
  // Abbruch von außen und Zeitgrenze zählen wie bei OpenAI als Zeitüberschreitung.
  if (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError) {
    return new DictationError("timeout", e.message, undefined, "anthropic");
  }
  if (e instanceof Anthropic.APIConnectionError) {
    const cause = (e as { cause?: unknown }).cause;
    return new DictationError("network", cause instanceof Error ? cause.message : e.message, undefined, "anthropic");
  }
  if (e instanceof Anthropic.APIError && typeof e.status === "number") {
    const m = (e.error as { error?: { message?: unknown } } | undefined)?.error?.message;
    const reason = typeof m === "string" ? m : "";
    return new DictationError(classifyStatus(e.status), reason ? `HTTP ${e.status}: ${reason}` : `HTTP ${e.status}`, e.status, "anthropic");
  }
  return new DictationError("server", e instanceof Error ? e.message : String(e), undefined, "anthropic");
}

/** Schickt eine Anfrage und liefert den Text der Antwort. Wirft `DictationError`. */
export async function claudeText(t: ClaudeTarget, req: ClaudeRequest): Promise<string> {
  if (!t.key.trim()) throw new DictationError("nokey", undefined, undefined, "anthropic");
  let msg: Anthropic.Message;
  try {
    msg = await client(t).messages.create(
      {
        model: t.model,
        max_tokens: req.maxTokens ?? 8000,
        system: req.system,
        messages: [{ role: "user", content: req.input }],
        // Einfache Textarbeit: geringer Aufwand hält die Antwort schnell und günstig.
        ...(req.plain
          ? {}
          : { output_config: { effort: "low" as const, ...(req.schema ? { format: { type: "json_schema" as const, schema: req.schema } } : {}) } }),
      },
      t.signal ? { signal: t.signal } : undefined,
    );
  } catch (e) {
    throw claudeError(e);
  }
  if (msg.stop_reason === "refusal") throw new DictationError("server", "Claude hat die Anfrage abgelehnt", undefined, "anthropic");
  if (msg.stop_reason === "max_tokens") throw new DictationError("server", "Antwort abgeschnitten", undefined, "anthropic");
  let text = "";
  for (const block of msg.content) if (block.type === "text") text += block.text;
  if (!text.trim()) throw new DictationError("server", "Antwort ohne Text", undefined, "anthropic");
  return text.trim();
}

/** Wie `claudeText`, bei HTTP 400 einmal mit der einfachen Anfrage. */
export async function claudeTextWithFallback(t: ClaudeTarget, req: ClaudeRequest & { plainSystem?: string }): Promise<string> {
  try {
    return await claudeText(t, req);
  } catch (e) {
    if (!(e instanceof DictationError) || e.status !== 400 || t.signal?.aborted) throw e;
    return claudeText(t, { ...req, plain: true, ...(req.plainSystem ? { system: req.plainSystem } : {}) });
  }
}

/** Prüft einen Claude-Schlüssel mit `GET /v1/models`. */
export async function checkClaudeKey(t: Omit<ClaudeTarget, "model">): Promise<{ ok: true } | { ok: false; kind: DictationError["kind"] }> {
  if (!t.key.trim()) return { ok: false, kind: "nokey" };
  try {
    await client({ ...t, model: "", timeoutMs: t.timeoutMs ?? 20_000 }).models.list({ limit: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, kind: claudeError(e).kind };
  }
}

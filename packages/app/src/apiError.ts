// Gemeinsame Fehlerart für alle KI-Anfragen (Diktieren 4.9, Titel 4.10, Checkliste 4.11, Anbieter 4.12).

/** Anbieter mit eigenem API-Schlüssel (4.12). */
export type ApiProvider = "openai" | "anthropic" | "groq" | "gemini";

/** Anbieter für die Spracherkennung (4.12); „local“ läuft ohne Netz auf dem Gerät. */
export type TranscribeProvider = "openai" | "groq" | "gemini" | "local";

export const TRANSCRIBE_PROVIDERS: readonly TranscribeProvider[] = ["openai", "groq", "gemini", "local"];

/** Anbieter für Bereinigung, Titelvorschlag und „Checkliste einfügen“ (4.12). */
export type TextProvider = "openai" | "anthropic";

export const API_PROVIDERS: readonly ApiProvider[] = ["openai", "anthropic", "groq", "gemini"];

/** Name im Satz „einen <Name>-API-Schlüssel“ und in Hinweisen. */
export const PROVIDER_LABEL: Record<ApiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  groq: "Groq",
  gemini: "Gemini",
};

export type DictationErrorKind = "nokey" | "auth" | "quota" | "network" | "timeout" | "server" | "empty" | "permission" | "nomodel";

export class DictationError extends Error {
  constructor(
    readonly kind: DictationErrorKind,
    message?: string,
    /** HTTP-Status der Antwort, falls der Anbieter geantwortet hat */
    readonly status?: number,
    /** Anbieter der gescheiterten Anfrage, z. B. für „einen Claude-API-Schlüssel hinterlegen“ */
    readonly provider?: ApiProvider,
  ) {
    super(message ?? kind);
    this.name = "DictationError";
  }
}

export function classifyStatus(status: number): DictationErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status === 408 || status === 504) return "timeout";
  return "server";
}

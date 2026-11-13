// Diktieren (4.9) im Main-Prozess: Schlüssel verschlüsselt in settings.json (safeStorage), Aufrufe an OpenAI
// von hier aus. Der Renderer sieht den Schlüssel nie, nur die Maske; die CSP des Renderers bleibt unverändert.
import {
  checkKey,
  checklistFromText,
  DictationError,
  maskKey,
  parseDictationSettings,
  runDictation,
  suggestTitle,
  type DictationContext,
  type DictationErrorKind,
  type DictationResult,
  type DictationSettings,
  type FetchLike,
  type TitleSuggestion,
} from "@markdoist/app";

/** Teil von Electrons safeStorage, den der Dienst braucht (für Tests ersetzbar). */
export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(enc: Buffer): string;
  /** Linux: "basic_text" heißt, es gibt keinen Schlüsselbund */
  getSelectedStorageBackend?(): string;
}

export interface StoredDictation extends Partial<DictationSettings> {
  /** Base64; verschlüsselt mit safeStorage, sonst Klartext (keyPlain) */
  keyEnc?: string;
  keyPlain?: boolean;
}

export interface DictationStatus {
  hasKey: boolean;
  masked: string | null;
  /** Schlüssel liegt nicht in einem Schlüsselbund */
  insecure: boolean;
  settings: DictationSettings;
}

export type TitleResult = { ok: true; suggestion: TitleSuggestion } | { ok: false; kind: DictationErrorKind | "off"; detail?: string; status?: number };
export type ChecklistResult = { ok: true; items: string[] } | { ok: false; kind: DictationErrorKind; detail?: string; status?: number };

export type DictationRunResult = { ok: true; result: DictationResult } | { ok: false; kind: DictationErrorKind };

export class DictationService {
  constructor(
    private readonly box: SecretBox,
    private readonly load: () => StoredDictation | undefined,
    private readonly save: (d: StoredDictation | undefined) => Promise<void>,
    private readonly fetch: FetchLike,
    private readonly baseUrl?: string,
  ) {}

  private insecure(): boolean {
    if (!this.box.isEncryptionAvailable()) return true;
    return this.box.getSelectedStorageBackend?.() === "basic_text";
  }

  key(): string | null {
    const d = this.load();
    if (!d?.keyEnc) return null;
    try {
      const buf = Buffer.from(d.keyEnc, "base64");
      return d.keyPlain ? buf.toString("utf8") : this.box.decryptString(buf);
    } catch {
      return null; // z. B. anderer Schlüsselbund nach Umzug
    }
  }

  settings(): DictationSettings {
    return parseDictationSettings(this.load());
  }

  status(): DictationStatus {
    const key = this.key();
    return { hasKey: !!key, masked: key ? maskKey(key) : null, insecure: this.insecure(), settings: this.settings() };
  }

  async setKey(key: string): Promise<DictationStatus> {
    const k = String(key ?? "").trim();
    if (!k) return this.status();
    const enc = this.box.isEncryptionAvailable();
    const keyEnc = (enc ? this.box.encryptString(k) : Buffer.from(k, "utf8")).toString("base64");
    const { keyPlain: _old, ...rest } = this.load() ?? {};
    await this.save({ ...rest, keyEnc, ...(enc ? {} : { keyPlain: true }) });
    return this.status();
  }

  async clearKey(): Promise<DictationStatus> {
    const { keyEnc: _k, keyPlain: _p, ...rest } = this.load() ?? {};
    await this.save(Object.keys(rest).length ? rest : undefined);
    return this.status();
  }

  async setSettings(s: Partial<DictationSettings>): Promise<DictationStatus> {
    const next = parseDictationSettings({ ...this.settings(), ...s });
    await this.save({ ...this.load(), ...next });
    return this.status();
  }

  async check(): Promise<{ ok: true } | { ok: false; kind: DictationErrorKind }> {
    return checkKey(this.fetch, this.key() ?? "", this.baseUrl);
  }

  async run(audio: ArrayBuffer | Uint8Array, mime: string, ctx: DictationContext, onPhase?: (p: "transcribing" | "cleaning") => void): Promise<DictationRunResult> {
    const type = typeof mime === "string" && /^audio\/[\w.+-]+(;[\w=.,+-]*)?$/.test(mime) ? mime.split(";")[0]! : "audio/webm";
    const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
    const bytes = new Uint8Array(audio instanceof Uint8Array ? audio : new Uint8Array(audio)); // Kopie mit eigenem ArrayBuffer
    if (bytes.byteLength > 25 * 1024 * 1024) return { ok: false, kind: "server" };
    try {
      const result = await runDictation({
        fetch: this.fetch,
        key: this.key() ?? "",
        settings: this.settings(),
        ctx: { list: typeof ctx?.list === "string" ? ctx.list : undefined, title: typeof ctx?.title === "string" ? ctx.title : undefined },
        baseUrl: this.baseUrl,
        onPhase,
        form: (fields) => {
          const f = new FormData();
          for (const [k, v] of fields) f.append(k, v);
          f.append("file", new Blob([bytes], { type }), `diktat.${ext}`);
          return f;
        },
      });
      return { ok: true, result };
    } catch (e) {
      return { ok: false, kind: e instanceof DictationError ? e.kind : "server" };
    }
  }

  /**
   * Titel und Art eines Programmier-Eintrags (4.10). Ohne `force` nur, wenn „Titel und Art vorschlagen“
   * eingeschaltet ist; „Neu vorschlagen“ im Detail fragt immer.
   */
  async suggestTitle(note: string, list: string, force = false): Promise<TitleResult> {
    const settings = this.settings();
    if (!force && !settings.autoTitle) return { ok: false, kind: "off" };
    try {
      const suggestion = await suggestTitle({
        fetch: this.fetch,
        key: this.key() ?? "",
        model: settings.titleModel,
        note: typeof note === "string" ? note : "",
        list: typeof list === "string" ? list : "",
        baseUrl: this.baseUrl,
      });
      return { ok: true, suggestion };
    } catch (e) {
      if (e instanceof DictationError) return { ok: false, kind: e.kind, detail: e.message, ...(e.status ? { status: e.status } : {}) };
      return { ok: false, kind: "server", detail: e instanceof Error ? e.message : String(e) };
    }
  }

  /** „Checkliste einfügen“ (4.11): zerlegt Text in Einträge, mit dem Modell für Titel und Listen. */
  async checklist(text: string, list: string): Promise<ChecklistResult> {
    try {
      const items = await checklistFromText({
        fetch: this.fetch,
        key: this.key() ?? "",
        model: this.settings().titleModel,
        text: typeof text === "string" ? text : "",
        list: typeof list === "string" ? list : "",
        baseUrl: this.baseUrl,
      });
      return { ok: true, items };
    } catch (e) {
      if (e instanceof DictationError) return { ok: false, kind: e.kind, detail: e.message, ...(e.status ? { status: e.status } : {}) };
      return { ok: false, kind: "server", detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

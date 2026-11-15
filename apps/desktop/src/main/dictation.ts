// Diktieren (4.9) im Main-Prozess: Schlüssel verschlüsselt in settings.json (safeStorage), Aufrufe an die
// Anbieter von hier aus (seit 4.12 je Anbieter ein Schlüssel). Der Renderer sieht die Schlüssel nie, nur die
// Maske; die CSP des Renderers bleibt unverändert.
import {
  API_PROVIDERS,
  checkClaudeKey,
  checkKey,
  checklistFromText,
  DictationError,
  maskKey,
  parseDictationSettings,
  runDictation,
  suggestTitle,
  textModels,
  type ApiProvider,
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

interface StoredKey {
  /** Base64; verschlüsselt mit safeStorage, sonst Klartext (plain) */
  enc: string;
  plain?: boolean;
}

export interface StoredDictation extends Partial<DictationSettings> {
  /** OpenAI-Schlüssel (seit 4.9). Base64; verschlüsselt mit safeStorage, sonst Klartext (keyPlain) */
  keyEnc?: string;
  keyPlain?: boolean;
  /** Schlüssel der übrigen Anbieter (4.12) */
  keys?: Partial<Record<Exclude<ApiProvider, "openai">, StoredKey>>;
}

export interface KeyStatus {
  hasKey: boolean;
  masked: string | null;
}

export interface DictationStatus {
  /** OpenAI-Schlüssel (wie seit 4.9) */
  hasKey: boolean;
  masked: string | null;
  /** Alle Schlüssel je Anbieter (4.12) */
  keys: Record<ApiProvider, KeyStatus>;
  /** Schlüssel liegt nicht in einem Schlüsselbund */
  insecure: boolean;
  settings: DictationSettings;
}

/** Basis-URLs je Anbieter; nur für E2E-Tests (lokaler Ersatzserver) gesetzt. */
export type BaseUrls = Partial<Record<ApiProvider, string>>;

const provider = (p: unknown): ApiProvider => (API_PROVIDERS.includes(p as ApiProvider) ? (p as ApiProvider) : "openai");

export type TitleResult = { ok: true; suggestion: TitleSuggestion } | { ok: false; kind: DictationErrorKind | "off"; detail?: string; status?: number; provider?: ApiProvider };
export type ChecklistResult = { ok: true; items: string[] } | { ok: false; kind: DictationErrorKind; detail?: string; status?: number; provider?: ApiProvider };

export type DictationRunResult = { ok: true; result: DictationResult } | { ok: false; kind: DictationErrorKind };

export class DictationService {
  constructor(
    private readonly box: SecretBox,
    private readonly load: () => StoredDictation | undefined,
    private readonly save: (d: StoredDictation | undefined) => Promise<void>,
    private readonly fetch: FetchLike,
    private readonly baseUrls: BaseUrls = {},
    /** Claude: eigenes fetch (Tests); sonst das globale */
    private readonly claudeFetch?: typeof globalThis.fetch,
  ) {}

  private insecure(): boolean {
    if (!this.box.isEncryptionAvailable()) return true;
    return this.box.getSelectedStorageBackend?.() === "basic_text";
  }

  private stored(p: ApiProvider): StoredKey | undefined {
    const d = this.load();
    if (p === "openai") return d?.keyEnc ? { enc: d.keyEnc, ...(d.keyPlain ? { plain: true } : {}) } : undefined;
    return d?.keys?.[p];
  }

  key(p: ApiProvider = "openai"): string | null {
    const k = this.stored(p);
    if (!k?.enc) return null;
    try {
      const buf = Buffer.from(k.enc, "base64");
      return k.plain ? buf.toString("utf8") : this.box.decryptString(buf);
    } catch {
      return null; // z. B. anderer Schlüsselbund nach Umzug
    }
  }

  settings(): DictationSettings {
    return parseDictationSettings(this.load());
  }

  status(): DictationStatus {
    const keys = Object.fromEntries(
      API_PROVIDERS.map((p) => {
        const k = this.key(p);
        return [p, { hasKey: !!k, masked: k ? maskKey(k) : null }];
      }),
    ) as Record<ApiProvider, KeyStatus>;
    return { hasKey: keys.openai.hasKey, masked: keys.openai.masked, keys, insecure: this.insecure(), settings: this.settings() };
  }

  async setKey(key: string, which?: ApiProvider): Promise<DictationStatus> {
    const p = provider(which);
    const k = String(key ?? "").trim();
    if (!k) return this.status();
    const enc = this.box.isEncryptionAvailable();
    const data = (enc ? this.box.encryptString(k) : Buffer.from(k, "utf8")).toString("base64");
    if (p === "openai") {
      const { keyPlain: _old, ...rest } = this.load() ?? {};
      await this.save({ ...rest, keyEnc: data, ...(enc ? {} : { keyPlain: true }) });
    } else {
      const cur = this.load() ?? {};
      await this.save({ ...cur, keys: { ...cur.keys, [p]: { enc: data, ...(enc ? {} : { plain: true }) } } });
    }
    return this.status();
  }

  async clearKey(which?: ApiProvider): Promise<DictationStatus> {
    const p = provider(which);
    const cur = this.load() ?? {};
    let next: StoredDictation;
    if (p === "openai") {
      const { keyEnc: _k, keyPlain: _p, ...rest } = cur;
      next = rest;
    } else {
      const { [p]: _gone, ...keys } = cur.keys ?? {};
      const { keys: _all, ...rest } = cur;
      next = Object.keys(keys).length ? { ...rest, keys } : rest;
    }
    await this.save(Object.keys(next).length ? next : undefined);
    return this.status();
  }

  async setSettings(s: Partial<DictationSettings>): Promise<DictationStatus> {
    const next = parseDictationSettings({ ...this.settings(), ...s });
    await this.save({ ...this.load(), ...next });
    return this.status();
  }

  async check(which?: ApiProvider): Promise<{ ok: true } | { ok: false; kind: DictationErrorKind }> {
    const p = provider(which);
    if (p === "anthropic") return checkClaudeKey({ key: this.key(p) ?? "", baseUrl: this.baseUrls.anthropic, fetch: this.claudeFetch });
    return checkKey(this.fetch, this.key() ?? "", this.baseUrls.openai);
  }

  /** Anbieter, Schlüssel und Modell für Titel und Checkliste (4.12). */
  private textTarget() {
    const m = textModels(this.settings());
    return { provider: m.provider, key: this.key(m.provider) ?? "", baseUrl: this.baseUrls[m.provider], model: m.title, claudeFetch: this.claudeFetch };
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
        baseUrl: this.baseUrls.openai,
        text: (({ provider, key, baseUrl, claudeFetch }) => ({ provider, key, baseUrl, claudeFetch }))(this.textTarget()),
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
      const t = this.textTarget();
      const suggestion = await suggestTitle({
        fetch: this.fetch,
        provider: t.provider,
        key: t.key,
        model: t.model,
        note: typeof note === "string" ? note : "",
        list: typeof list === "string" ? list : "",
        baseUrl: t.baseUrl,
        claudeFetch: t.claudeFetch,
      });
      return { ok: true, suggestion };
    } catch (e) {
      if (e instanceof DictationError) return { ok: false, kind: e.kind, detail: e.message, ...(e.status ? { status: e.status } : {}), ...(e.provider ? { provider: e.provider } : {}) };
      return { ok: false, kind: "server", detail: e instanceof Error ? e.message : String(e) };
    }
  }

  /** „Checkliste einfügen“ (4.11): zerlegt Text in Einträge, mit dem Modell für Titel und Listen. */
  async checklist(text: string, list: string): Promise<ChecklistResult> {
    try {
      const t = this.textTarget();
      const items = await checklistFromText({
        fetch: this.fetch,
        provider: t.provider,
        key: t.key,
        model: t.model,
        text: typeof text === "string" ? text : "",
        list: typeof list === "string" ? list : "",
        baseUrl: t.baseUrl,
        claudeFetch: t.claudeFetch,
      });
      return { ok: true, items };
    } catch (e) {
      if (e instanceof DictationError) return { ok: false, kind: e.kind, detail: e.message, ...(e.status ? { status: e.status } : {}), ...(e.provider ? { provider: e.provider } : {}) };
      return { ok: false, kind: "server", detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

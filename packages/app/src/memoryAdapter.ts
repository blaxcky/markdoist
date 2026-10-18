// In-Memory-Adapter für Tests: zählt Schreibvorgänge und erlaubt Fehlerinjektion.
import { hashText } from "@markdoist/core";
import type { FileMeta, ReadResult, RecoveryCase, Scope, StorageAdapter, WriteResult } from "./storage";

type Fault = Exclude<WriteResult["status"], "ok" | "conflict">;

export class MemoryAdapter implements StorageAdapter {
  readonly tasks = new Map<string, { text: string; mtime: number }>();
  readonly trash = new Map<string, { text: string; mtime: number }>();
  /** Unterordner/versteckte Einträge, die nie gelistet werden dürfen */
  readonly hidden = new Map<string, string>();
  writes = 0;
  listFails = false;
  /** Metadaten unbekannt wie bei manchen SAF-Anbietern (mtime/size null) */
  unknownMeta = false;
  /** offene Vorgänge des simulierten Journals */
  readonly journal = new Map<string, RecoveryCase>();
  private faults: { fault: Fault; applied: boolean }[] = [];
  private clock = 1;
  private opCounter = 0;

  /** Nächsten Schreibvorgang scheitern lassen; bei „unknown“ optional mit tatsächlich geschriebenem Inhalt. */
  failNext(fault: Fault, opts: { applied?: boolean } = {}) {
    this.faults.push({ fault, applied: opts.applied ?? false });
  }

  private fault(): WriteResult | null {
    const f = this.faults.shift();
    return f ? ({ status: f.fault, message: `injiziert: ${f.fault}` } as WriteResult) : null;
  }

  private map(scope: Scope) {
    return scope === "tasks" ? this.tasks : this.trash;
  }

  private parse(ref: string): { scope: Scope; name: string } {
    const i = ref.indexOf("/");
    return { scope: ref.slice(0, i) as Scope, name: ref.slice(i + 1) };
  }

  /** Simuliert eine externe Änderung (z. B. Sync oder Editor). */
  external(name: string, text: string | null) {
    if (text === null) this.tasks.delete(name);
    else this.tasks.set(name, { text, mtime: this.clock++ });
  }

  async list(scope: Scope): Promise<FileMeta[]> {
    if (this.listFails) throw new Error("Ordner nicht erreichbar");
    return [...this.map(scope).entries()].map(([name, f]) => ({
      name,
      ref: `${scope}/${name}`,
      mtime: this.unknownMeta ? null : f.mtime,
      size: this.unknownMeta ? null : f.text.length,
    }));
  }

  async read(ref: string): Promise<ReadResult> {
    const { scope, name } = this.parse(ref);
    const f = this.map(scope).get(name);
    if (!f) throw Object.assign(new Error(`Datei fehlt: ${name}`), { code: "ENOENT" });
    return { text: f.text, hash: hashText(f.text), mtime: f.mtime };
  }

  private check(ref: string, expectedHash: string): WriteResult | { scope: Scope; name: string; text: string } {
    const { scope, name } = this.parse(ref);
    const f = this.map(scope).get(name);
    if (!f) return { status: "missing", message: name };
    const h = hashText(f.text);
    if (h !== expectedHash) return { status: "conflict", currentHash: h };
    return { scope, name, text: f.text };
  }

  async write(ref: string, text: string, expectedHash: string): Promise<WriteResult> {
    const f = this.faults.shift();
    if (f?.fault === "unknown") return this.unclear(ref, text, f.applied);
    if (f) return { status: f.fault, message: `injiziert: ${f.fault}` } as WriteResult;
    const c = this.check(ref, expectedHash);
    if ("status" in c) return c;
    this.map(c.scope).set(c.name, { text, mtime: this.clock++ });
    this.writes++;
    return { status: "ok", ref, name: c.name, hash: hashText(text) };
  }

  /** Unklarer Ausgang: Journal bleibt offen und wird als Fall zurückgegeben (7.3). */
  private unclear(ref: string, text: string, applied: boolean): WriteResult {
    const { scope, name } = this.parse(ref);
    const before = this.map(scope).get(name)?.text ?? null;
    if (applied && before !== null) {
      this.map(scope).set(name, { text, mtime: this.clock++ });
      this.writes++;
    }
    const recovery: RecoveryCase = {
      opId: `mem-${++this.opCounter}`,
      kind: "write",
      ref,
      name,
      before,
      desired: text,
      current: this.map(scope).get(name)?.text ?? null,
      message: "Ausgang unklar",
    };
    this.journal.set(recovery.opId, recovery);
    return { status: "unknown", message: "injiziert: unknown", recovery };
  }

  private free(map: Map<string, unknown>, name: string): string {
    const lower = new Set([...map.keys()].map((k) => k.toLowerCase()));
    if (!lower.has(name.toLowerCase())) return name;
    const m = /^(.*?)(\.md)?$/i.exec(name)!;
    for (let n = 2; ; n++) {
      const c = `${m[1]} ${n}${m[2] ?? ""}`;
      if (!lower.has(c.toLowerCase())) return c;
    }
  }

  async create(name: string, text: string): Promise<WriteResult> {
    const fault = this.fault();
    if (fault) return fault;
    if ([...this.tasks.keys()].some((k) => k.toLowerCase() === name.toLowerCase())) {
      return { status: "exists", message: name };
    }
    this.tasks.set(name, { text, mtime: this.clock++ });
    this.writes++;
    return { status: "ok", ref: `tasks/${name}`, name, hash: hashText(text) };
  }

  private async move(ref: string, expectedHash: string, to: Scope, newName?: string): Promise<WriteResult> {
    const fault = this.fault();
    if (fault) return fault;
    const c = this.check(ref, expectedHash);
    if ("status" in c) return c;
    const target = this.map(to);
    const name = newName ? newName : this.free(target, c.name);
    if (newName && [...target.keys()].some((k) => k.toLowerCase() === newName.toLowerCase() && k !== c.name)) {
      return { status: "exists", message: newName };
    }
    this.map(c.scope).delete(c.name);
    target.set(name, { text: c.text, mtime: this.clock++ });
    this.writes++;
    return { status: "ok", ref: `${to}/${name}`, name, hash: hashText(c.text) };
  }

  moveToTrash(ref: string, expectedHash: string) {
    return this.move(ref, expectedHash, "trash");
  }
  restoreFromTrash(ref: string, expectedHash: string) {
    return this.move(ref, expectedHash, "tasks");
  }
  rename(ref: string, newName: string, expectedHash: string) {
    return this.move(ref, expectedHash, "tasks", newName);
  }
  async deletePermanently(ref: string, expectedHash: string): Promise<WriteResult> {
    const c = this.check(ref, expectedHash);
    if ("status" in c) return c;
    this.map(c.scope).delete(c.name);
    this.writes++;
    return { status: "ok", ref, name: c.name, hash: expectedHash };
  }
  async recover(): Promise<RecoveryCase[]> {
    return [...this.journal.values()].map((c) => {
      const { scope, name } = this.parse(c.ref);
      return { ...c, current: this.map(scope).get(name)?.text ?? null };
    });
  }
  async resolveRecovery(opId: string): Promise<void> {
    this.journal.delete(opId);
  }
}

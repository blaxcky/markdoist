// Gerätelokale Einstellungen und Schlüssel-Wert-Speicher unter ~/.config/markdoist (Plan 3.1).
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import { join } from "node:path";

let tmpCounter = 0;

// Temp-Name aus PID, Zähler und Zufallsanteil: Gleichzeitige Schreibvorgänge auf dasselbe
// Ziel teilen sich nie eine Temp-Datei (R3).
async function atomicWrite(path: string, data: string) {
  const tmp = `${path}.${process.pid}.${++tmpCounter}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    const h = await fs.open(tmp, "wx", 0o600);
    try {
      await h.writeFile(data, "utf8");
      await h.sync();
    } finally {
      await h.close();
    }
    await fs.rename(tmp, path);
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

// Ordnet Aufträge pro Schlüssel strikt in Aufrufreihenfolge. Ein Fehler wird an den Aufrufer
// weitergegeben, hält aber spätere Aufträge nicht auf. Leere Ketten werden entfernt.
class SerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const result = prev.then(job, job);
    const tail = result.catch(() => {});
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
}

export class LocalStore {
  private readonly queue = new SerialQueue();

  constructor(private readonly dir: string) {}

  private path(key: string) {
    const safe = createHash("sha256").update(key).digest("hex").slice(0, 32);
    return join(this.dir, "kv", `${safe}.json`);
  }

  async get(key: string): Promise<string | null> {
    try {
      return JSON.parse(await fs.readFile(this.path(key), "utf8")).value as string;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): Promise<void> {
    const path = this.path(key);
    return this.queue.run(path, async () => {
      await fs.mkdir(join(this.dir, "kv"), { recursive: true });
      await atomicWrite(path, JSON.stringify({ key, value }));
    });
  }

  delete(key: string): Promise<void> {
    const path = this.path(key);
    return this.queue.run(path, () => fs.unlink(path).catch(() => {}));
  }
}

export interface Settings {
  folder: string | null;
  theme: "system" | "light" | "dark";
}

export async function loadSettings(dir: string): Promise<Settings> {
  try {
    return { folder: null, theme: "system", ...JSON.parse(await fs.readFile(join(dir, "settings.json"), "utf8")) };
  } catch {
    return { folder: null, theme: "system" };
  }
}

// Eine Kette pro settings.json, damit der zuletzt gespeicherte Stand auch zuletzt auf der Platte landet.
const settingsQueue = new SerialQueue();

export function saveSettings(dir: string, s: Settings): Promise<void> {
  const path = join(dir, "settings.json");
  const data = JSON.stringify(s, null, 2);
  return settingsQueue.run(path, async () => {
    await fs.mkdir(dir, { recursive: true });
    await atomicWrite(path, data);
  });
}

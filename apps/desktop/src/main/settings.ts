// Gerätelokale Einstellungen und Schlüssel-Wert-Speicher unter ~/.config/markdoist (Plan 3.1).
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { join } from "node:path";

async function atomicWrite(path: string, data: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  const h = await fs.open(tmp, "w", 0o600);
  try {
    await h.writeFile(data, "utf8");
    await h.sync();
  } finally {
    await h.close();
  }
  await fs.rename(tmp, path);
}

export class LocalStore {
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

  async set(key: string, value: string): Promise<void> {
    await fs.mkdir(join(this.dir, "kv"), { recursive: true });
    await atomicWrite(this.path(key), JSON.stringify({ key, value }));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.path(key)).catch(() => {});
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

export async function saveSettings(dir: string, s: Settings): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await atomicWrite(join(dir, "settings.json"), JSON.stringify(s, null, 2));
}

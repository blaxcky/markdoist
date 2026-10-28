import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import icon from "../../build/icons/256x256.png?asset";
import { FsAdapter } from "./fsAdapter";
import { LocalStore, loadSettings, saveSettings, type Settings } from "./settings";

// Datenverzeichnis: ~/.config/markdoist (Plan 3.1). Für Tests überschreibbar.
const dataDir = process.env.MARKDOIST_DATA_DIR ?? join(app.getPath("appData"), "markdoist");
app.setPath("userData", dataDir);

// Nur eine App-Instanz schreibt; weitere Starts aktivieren sie (2.1).
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win: BrowserWindow | null = null;
let settings: Settings = { folder: null, theme: "system" };
let adapter: FsAdapter | null = null;
let unwatch: (() => void) | null = null;
const store = new LocalStore(dataDir);

function journalDir(folder: string) {
  const id = createHash("sha256").update(folder).digest("hex").slice(0, 16);
  return join(dataDir, "journal", id);
}

function openFolder(folder: string | null) {
  unwatch?.();
  unwatch = null;
  // Nur für E2E-Abbruchtests: MARKDOIST_TEST_CRASH=write:before-rename beendet den Prozess hart.
  const crash = process.env.MARKDOIST_TEST_CRASH;
  const hook = crash
    ? (kind: string, phase: string) => {
        // Harter Abbruch wie bei einem Absturz; process.exit liefe in Electron noch weiter.
        if (`${kind}:${phase}` === crash) process.kill(process.pid, "SIGKILL");
      }
    : undefined;
  adapter = folder ? new FsAdapter(folder, journalDir(folder), hook) : null;
  if (adapter) {
    unwatch = adapter.watch((overflow) => win?.webContents.send("storage:changed", overflow));
  }
}

function requireAdapter(): FsAdapter {
  if (!adapter) throw new Error("Kein Aufgabenordner gewählt");
  return adapter;
}

function createWindow(): void {
  // Nur für E2E-Tests: MARKDOIST_TEST_HIDDEN=1 lässt das Fenster verborgen, damit Testläufe nicht stören.
  const hidden = !!process.env.MARKDOIST_TEST_HIDDEN;
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    title: "Markdoist",
    icon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1f22" : "#ffffff",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: !hidden,
    },
  });
  if (!hidden) win.on("ready-to-show", () => win?.show());
  // Links nur extern und nur http(s) öffnen (2.2).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("focus", () => win?.webContents.send("app:focus"));
  // Testuhr nur für E2E-Tests (MARKDOIST_TEST_NOW=2026-10-12T10:00, MARKDOIST_TEST_TZ=Europe/Berlin).
  const query: Record<string, string> = {};
  if (process.env.MARKDOIST_TEST_NOW) {
    query.now = process.env.MARKDOIST_TEST_NOW;
    query.tz = process.env.MARKDOIST_TEST_TZ ?? "Europe/Berlin";
  }
  if (process.env.ELECTRON_RENDERER_URL) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    void win.loadURL(u.toString());
  } else void win.loadFile(join(__dirname, "../renderer/index.html"), { query });
}

function registerIpc() {
  ipcMain.handle("app:info", () => ({ version: app.getVersion() }));
  ipcMain.handle("settings:get", () => settings);
  ipcMain.handle("settings:theme", async (_e, theme: Settings["theme"]) => {
    if (!["system", "light", "dark"].includes(theme)) return settings;
    settings = { ...settings, theme };
    nativeTheme.themeSource = theme;
    await saveSettings(dataDir, settings);
    return settings;
  });
  ipcMain.handle("folder:choose", async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: "Aufgabenordner wählen",
      properties: ["openDirectory", "createDirectory"],
    });
    if (r.canceled || !r.filePaths[0]) return settings;
    return setFolder(r.filePaths[0]);
  });
  ipcMain.handle("folder:set", async (_e, folder: string) => setFolder(folder));
  // Müllabfuhr-Import (4.7): nur lesen, die Datei bleibt, wo sie ist.
  ipcMain.handle("ics:choose", async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: "Kalender der Müllabfuhr importieren",
      properties: ["openFile"],
      filters: [{ name: "Kalender (ICS)", extensions: ["ics"] }],
    });
    const path = r.filePaths[0];
    if (r.canceled || !path) return null;
    const info = await stat(path);
    if (info.size > 5 * 1024 * 1024) return { name: basename(path), error: "Datei ist größer als 5 MB" };
    return { name: basename(path), text: await readFile(path, "utf8") };
  });
  ipcMain.handle("open:external", (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  // Ordnerbezogene Speicheroperationen; Referenzen werden im Adapter gegen den Ordner geprüft.
  // Jeder Aufruf nennt seinen Ordner: Aufträge eines alten Repositorys schreiben nach einem
  // Ordnerwechsel nie in den neuen Ordner (7.1, AK-36).
  const s = (name: string, fn: (...args: never[]) => Promise<unknown>) =>
    ipcMain.handle(`storage:${name}`, (_e, folder: unknown, ...args) => {
      if (folder !== settings.folder) throw new Error("Der Aufgabenordner wurde gewechselt – Vorgang verworfen");
      return (fn as (...a: unknown[]) => Promise<unknown>)(...args);
    });
  s("list", (scope: "tasks" | "trash") => requireAdapter().list(scope));
  s("read", (ref: string) => requireAdapter().read(ref));
  s("write", (ref: string, text: string, h: string) => requireAdapter().write(ref, text, h));
  s("create", (name: string, text: string) => requireAdapter().create(name, text));
  s("moveToTrash", (ref: string, h: string) => requireAdapter().moveToTrash(ref, h));
  s("restoreFromTrash", (ref: string, h: string) => requireAdapter().restoreFromTrash(ref, h));
  s("rename", (ref: string, n: string, h: string) => requireAdapter().rename(ref, n, h));
  s("deletePermanently", (ref: string, h: string) => requireAdapter().deletePermanently(ref, h));
  s("recover", () => requireAdapter().recover());
  s("resolveRecovery", (opId: string) => requireAdapter().resolveRecovery(opId));

  ipcMain.handle("kv:get", (_e, k: string) => store.get(k));
  ipcMain.handle("kv:set", (_e, k: string, v: string) => store.set(k, v));
  ipcMain.handle("kv:delete", (_e, k: string) => store.delete(k));
}

async function setFolder(folder: string): Promise<Settings> {
  const st = await stat(folder);
  if (!st.isDirectory()) throw new Error("Kein Ordner");
  settings = { ...settings, folder };
  await saveSettings(dataDir, settings);
  openFolder(folder);
  return settings;
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

void app.whenReady().then(async () => {
  settings = await loadSettings(dataDir);
  if (process.env.MARKDOIST_FOLDER) settings.folder = process.env.MARKDOIST_FOLDER;
  nativeTheme.themeSource = settings.theme;
  openFolder(settings.folder);
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  unwatch?.();
  app.quit();
});

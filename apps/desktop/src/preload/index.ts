import { contextBridge, ipcRenderer } from "electron";

const call = (ch: string) => (...args: unknown[]) => ipcRenderer.invoke(ch, ...args);
const methods = [
  "list",
  "read",
  "write",
  "create",
  "moveToTrash",
  "restoreFromTrash",
  "rename",
  "deletePermanently",
  "recover",
  "resolveRecovery",
];

contextBridge.exposeInMainWorld("markdoist", {
  info: call("app:info"),
  settings: { get: call("settings:get"), setTheme: call("settings:theme") },
  folder: { choose: call("folder:choose"), set: call("folder:set") },
  ics: { choose: call("ics:choose") },
  openExternal: call("open:external"),
  copyText: call("clipboard:write"),
  storage: Object.fromEntries(methods.map((m) => [m, call(`storage:${m}`)])),
  kv: { get: call("kv:get"), set: call("kv:set"), delete: call("kv:delete") },
  dictation: {
    status: call("dictation:status"),
    setKey: call("dictation:setKey"),
    clearKey: call("dictation:clearKey"),
    check: call("dictation:check"),
    setSettings: call("dictation:setSettings"),
    run: call("dictation:run"),
    title: call("dictation:title"),
    onPhase(fn: (p: string) => void) {
      const h = (_e: unknown, p: string) => fn(p);
      ipcRenderer.on("dictation:phase", h);
      return () => ipcRenderer.removeListener("dictation:phase", h);
    },
  },
  onStorageChanged(fn: (overflow: boolean) => void) {
    const h = (_e: unknown, overflow: boolean) => fn(overflow);
    ipcRenderer.on("storage:changed", h);
    return () => ipcRenderer.removeListener("storage:changed", h);
  },
  onFocus(fn: () => void) {
    const h = () => fn();
    ipcRenderer.on("app:focus", h);
    return () => ipcRenderer.removeListener("app:focus", h);
  },
});

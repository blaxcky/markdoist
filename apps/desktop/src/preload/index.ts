import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("markdoist", {
  version: process.env.npm_package_version ?? "",
});

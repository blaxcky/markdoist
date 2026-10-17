// Repository je SAF-Ordner und React-Anbindung.
import { createContext, use, useSyncExternalStore } from "react";
import { getRandomValues } from "expo-crypto";
import { Repository, type RepoState } from "@markdoist/app";
import { Temporal, type Clock } from "@markdoist/core";
import SafStorage from "../modules/saf-storage/src/SafStorageModule";
import { nativeKv, SafAdapter } from "./storage/safAdapter";

export const kv = nativeKv(SafStorage);

export interface Folder {
  treeUri: string;
  rootDocId: string;
  name: string;
}

export function systemClock(): Clock {
  return { now: () => Temporal.Now.instant(), timeZone: Temporal.Now.timeZoneId() };
}

export function createRepository(folder: Folder): Repository {
  return new Repository({
    adapter: new SafAdapter(SafStorage, folder.treeUri, folder.rootDocId),
    kv,
    folder: folder.treeUri,
    clock: systemClock,
    random: (b) => {
      getRandomValues(b);
    },
    batchSize: 25,
  });
}

export const RepoContext = createContext<Repository | null>(null);

export function useRepo(): Repository {
  const r = use(RepoContext);
  if (!r) throw new Error("Kein Repository");
  return r;
}

export function useRepoState(): RepoState {
  const repo = useRepo();
  return useSyncExternalStore(
    (fn) => repo.subscribe(fn),
    () => repo.getState(),
  );
}

export async function loadFolder(): Promise<Folder | null> {
  const raw = await kv.get("folder");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Folder;
  } catch {
    return null;
  }
}

export async function saveFolder(f: Folder): Promise<void> {
  await kv.set("folder", JSON.stringify(f));
}

export const DOCUMENTS_URI = "content://com.android.externalstorage.documents/document/primary%3ADocuments";

// Diktieren (4.9): Schlüssel im Keystore (expo-secure-store), Modelle und Schalter im gerätelokalen kv.
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { parseDictationSettings, type DictationSettings } from "@markdoist/app";
import { kv } from "../repo";

const KEY = "openai_api_key";
const SETTINGS = "dictation";

type Listener = () => void;
const listeners = new Set<Listener>();
const changed = () => listeners.forEach((l) => l());

export async function getApiKey(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(KEY)) || null;
  } catch {
    return null; // z. B. nach Wiederherstellung einer Sicherung nicht entschlüsselbar
  }
}

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, key.trim());
  changed();
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  changed();
}

export async function loadDictationSettings(): Promise<DictationSettings> {
  const raw = await kv.get(SETTINGS);
  try {
    return parseDictationSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return parseDictationSettings(null);
  }
}

export async function saveDictationSettings(s: DictationSettings): Promise<void> {
  await kv.set(SETTINGS, JSON.stringify(s));
  changed();
}

/** Aktueller Schlüssel (nur in den Einstellungen gebraucht, um die Maske zu zeigen) und Einstellungen. */
export function useDictationConfig(): { key: string | null; settings: DictationSettings; loaded: boolean } {
  const [state, setState] = useState<{ key: string | null; settings: DictationSettings; loaded: boolean }>({ key: null, settings: parseDictationSettings(null), loaded: false });
  useEffect(() => {
    let alive = true;
    const load = () => void Promise.all([getApiKey(), loadDictationSettings()]).then(([key, settings]) => alive && setState({ key, settings, loaded: true }));
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);
  return state;
}

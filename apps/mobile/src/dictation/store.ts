// Diktieren (4.9, 4.12): Schlüssel je Anbieter im Keystore (expo-secure-store), Modelle und Schalter im
// gerätelokalen kv.
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { API_PROVIDERS, parseDictationSettings, textModels, type ApiProvider, type DictationSettings, type TextTarget } from "@markdoist/app";
import { kv } from "../repo";

/** Ablagename im Keystore; OpenAI behält den Namen aus 4.9. */
const keyName = (p: ApiProvider) => `${p}_api_key`;
const SETTINGS = "dictation";

type Listener = () => void;
const listeners = new Set<Listener>();
const changed = () => listeners.forEach((l) => l());

export async function getApiKey(p: ApiProvider = "openai"): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(keyName(p))) || null;
  } catch {
    return null; // z. B. nach Wiederherstellung einer Sicherung nicht entschlüsselbar
  }
}

export async function setApiKey(key: string, p: ApiProvider = "openai"): Promise<void> {
  await SecureStore.setItemAsync(keyName(p), key.trim());
  changed();
}

export async function clearApiKey(p: ApiProvider = "openai"): Promise<void> {
  await SecureStore.deleteItemAsync(keyName(p));
  changed();
}

/** Text-Anbieter mit Schlüssel und Modell für Titel und Listen (4.12). */
export async function loadTextTarget(): Promise<TextTarget & { model: string; settings: DictationSettings }> {
  const settings = await loadDictationSettings();
  const m = textModels(settings);
  return { provider: m.provider, key: (await getApiKey(m.provider)) ?? "", model: m.title, settings };
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

/** Meldet Änderungen an Schlüssel oder Einstellungen; Rückgabe meldet ab. */
export function onDictationConfigChange(l: Listener): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

type Keys = Record<ApiProvider, string | null>;
const NO_KEYS = Object.fromEntries(API_PROVIDERS.map((p) => [p, null])) as Keys;

/** Schlüssel je Anbieter (nur in den Einstellungen gebraucht, um die Maske zu zeigen) und Einstellungen. */
export function useDictationConfig(): { key: string | null; keys: Keys; settings: DictationSettings; loaded: boolean } {
  const [state, setState] = useState<{ key: string | null; keys: Keys; settings: DictationSettings; loaded: boolean }>({ key: null, keys: NO_KEYS, settings: parseDictationSettings(null), loaded: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      void Promise.all([Promise.all(API_PROVIDERS.map((p) => getApiKey(p))), loadDictationSettings()]).then(([list, settings]) => {
        const keys = Object.fromEntries(API_PROVIDERS.map((p, i) => [p, list[i] ?? null])) as Keys;
        if (alive) setState({ key: keys.openai, keys, settings, loaded: true });
      });
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);
  return state;
}

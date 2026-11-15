// „Checkliste einfügen“ (4.11) am Handy: Schlüssel aus dem Keystore, Modell für Titel und Listen aus den Einstellungen.
import { checklistFromText, type FetchLike } from "@markdoist/app";
import { loadTextTarget } from "./store";

/** Zerlegt Text in Einträge. Fehler (auch ein fehlender Schlüssel) kommen als `DictationError`. */
export async function checklistItems(text: string, list: string, signal?: AbortSignal): Promise<string[]> {
  const t = await loadTextTarget();
  return checklistFromText({ fetch: fetch as unknown as FetchLike, provider: t.provider, key: t.key, model: t.model, text, list, ...(signal ? { signal } : {}) });
}

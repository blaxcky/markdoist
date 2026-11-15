// Titelvorschlag (4.10) am Handy: Schlüssel aus dem Keystore, Modell und Schalter aus den Einstellungen.
import { suggestTitle, type FetchLike, type TitleSuggester } from "@markdoist/app";
import { loadTextTarget } from "./store";

function suggester(force: boolean): TitleSuggester {
  return async (note, list) => {
    const t = await loadTextTarget();
    if (!force && !t.settings.autoTitle) return null;
    // Fehler (auch ein fehlender Schlüssel) gehen als DictationError weiter: „Neu vorschlagen“ zeigt die Ursache.
    return suggestTitle({ fetch: fetch as unknown as FetchLike, provider: t.provider, key: t.key, model: t.model, note, list });
  };
}

/** Automatisch nach dem Anlegen und beim Öffnen einer Liste; respektiert den Schalter. */
export const suggestTitleAuto = suggester(false);
/** „Neu vorschlagen“ im Detail: fragt auch bei abgeschaltetem Automatismus. */
export const suggestTitleForced = suggester(true);

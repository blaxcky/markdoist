// Titelvorschlag (4.10) am Handy: Schlüssel aus dem Keystore, Modell und Schalter aus den Einstellungen.
import { suggestTitle, type FetchLike, type TitleSuggester } from "@markdoist/app";
import { getApiKey, loadDictationSettings } from "./store";

function suggester(force: boolean): TitleSuggester {
  return async (note, list) => {
    const [key, settings] = await Promise.all([getApiKey(), loadDictationSettings()]);
    if (!key || (!force && !settings.autoTitle)) return null;
    try {
      return await suggestTitle({ fetch: fetch as unknown as FetchLike, key, model: settings.titleModel, note, list });
    } catch {
      return null;
    }
  };
}

/** Automatisch nach dem Anlegen und beim Öffnen einer Liste; respektiert den Schalter. */
export const suggestTitleAuto = suggester(false);
/** „Neu vorschlagen“ im Detail: fragt auch bei abgeschaltetem Automatismus. */
export const suggestTitleForced = suggester(true);

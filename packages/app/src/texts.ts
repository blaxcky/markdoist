// Zentrale deutsche Texte (Plan 4.5).
import type { Priority, Status } from "@markdoist/core";
import type { WriteResult } from "./storage";
import { T_DICTATION } from "./dictation";

export const T = {
  appName: "Markdoist",
  dictation: T_DICTATION,
  views: {
    inbox: "Eingang",
    today: "Heute",
    all: "Alle offenen",
    done: "Erledigt",
    problems: "Probleme",
    trash: "Papierkorb",
    history: "Verlauf",
    search: "Suche",
    lists: "Listen",
    more: "Mehr",
    waste: "Müllabfuhr",
    dev: "Programmieren",
  },
  dev: {
    newList: "Neue Programmier-Liste",
    titlePlaceholder: "Name der Liste, z. B. die App",
    addItem: "Idee, Bug oder Aufgabe eintragen",
    startWork: "In Arbeit nehmen",
    stopWork: "Nicht mehr in Arbeit",
    done: "Erledigt",
    removeDone: "Erledigte entfernen",
    rename: "Umbenennen",
    deleteList: "Liste löschen",
    deleteConfirm: (title: string, n: number) =>
      n ? `„${title}“ und ${n === 1 ? "einen Eintrag" : `${n} Einträge`} in den Papierkorb legen?` : `„${title}“ in den Papierkorb legen?`,
    orphans: "Ohne Liste",
    orphansHint: "Diese Einträge gehören zu keiner vorhandenen Liste, z. B. weil die Liste gelöscht wurde.",
    badge: "Programmieren",
    hasNote: "hat eine Notiz",
    emptyList: "Noch keine Einträge.",
    progress: (done: number, total: number) => `${done}/${total}`,
    copy: "Titel und Notiz kopieren",
    copied: "Kopiert",
    copyFailed: "Kopieren fehlgeschlagen",
  },
  lists: {
    newList: "Neue Liste",
    titlePlaceholder: "Name der Liste",
    addItem: "Eintrag hinzufügen",
    checked: "Abgehakt",
    removeChecked: "Abgehakte entfernen",
    resetAll: "Alle Haken zurücksetzen",
    rename: "Umbenennen",
    editMarkdown: "Als Markdown bearbeiten",
    deleteList: "Liste löschen",
    deleteItem: "Eintrag löschen",
    editItem: "Eintrag bearbeiten",
    dragHandle: "Ziehen zum Verschieben",
    badge: "Liste",
    progress: (done: number, total: number) => `${done}/${total}`,
    emptyList: "Noch keine Einträge.",
    otherContent: "Diese Liste enthält weiteren Text. Er bleibt erhalten und ist unter „Als Markdown bearbeiten“ sichtbar.",
  },
  today: {
    due: "Fällig",
    plannedToday: "Heute eingeplant",
    plannedEarlier: "Früher eingeplant",
  },
  status: { open: "Offen", "in-progress": "In Arbeit", done: "Erledigt" } satisfies Record<Status, string>,
  priority: { none: "Keine", low: "Niedrig", normal: "Normal", high: "Hoch" } satisfies Record<Priority, string>,
  fields: {
    title: "Titel",
    status: "Status",
    priority: "Priorität",
    inbox: "Eingang",
    due: "Frist",
    scheduled: "Geplant",
    note: "Notiz",
  },
  badges: { inbox: "Eingang", overdue: "überfällig", series: "Serie", warning: "Hinweis", readOnly: "schreibgeschützt" },
  actions: {
    capture: "Neue Aufgabe",
    complete: "Erledigen",
    reopen: "Wiederöffnen",
    file: "Einsortieren",
    toInbox: "Zurück in den Eingang",
    delete: "Löschen",
    restore: "Wiederherstellen",
    emptyTrash: "Papierkorb leeren",
    undo: "Rückgängig",
    rescan: "Neu einlesen",
    skip: "Überspringen",
    renameToTitle: "Dateinamen an Titel angleichen",
    adopt: "Als Aufgabe übernehmen",
    chooseFolder: "Ordner wählen",
    keepVariant: "Diese Variante behalten",
    keepBoth: "Beide behalten",
  },
  preview: {
    noop: "Keine Änderung – es wird nichts geschrieben.",
    ends: "Die Serie endet damit; es gibt kein weiteres Vorkommen.",
    nextOccurrence: "Nächstes Vorkommen",
    firstOccurrence: "Erster Termin",
    passedDone: "ist schon erledigt und wird übergangen",
    passedSkipped: "ist als Ausnahme übersprungen und wird übergangen",
    reopens: "Die Serie wird wieder offen.",
    newSection: "Neuer Abschnitt: die bisherige Historie bleibt im Archiv und zählt nicht mit.",
    supersededPrefix: "Der überfällige Termin",
    supersededSuffix: "wird abgelöst und nicht als erledigt gezählt.",
    shiftResolved: "Die Einzelverschiebung wird dabei aufgelöst.",
  },
  save: {
    pending: "Änderungen offen",
    draft: "Entwurf lokal gesichert",
    saved: "Gespeichert",
    failed: "Speichern fehlgeschlagen",
    conflict: "Konflikt",
  },
  empty: {
    inbox: "Der Eingang ist leer.",
    today: "Für heute steht nichts an.",
    all: "Keine offenen Aufgaben.",
    done: "Noch nichts erledigt.",
    lists: "Noch keine Listen. Einkaufszettel, Packliste, Gesprächsthemen – alles, was du nur abhaken willst.",
    listsOpen: "Keine Listen mit offenen Einträgen.",
    listsNoneOpen: "Keine Listen ohne offene Einträge.",
    dev: "Noch keine Programmier-Listen. Lege eine je App an und sammle darin Ideen, Bugs und Aufgaben, jeweils mit Notiz.",
    noFolder: "Bitte einen Aufgabenordner wählen.",
    waste: "Noch keine Abfuhrtermine. Importiere die ICS-Datei deiner Müllabfuhr, dann steht jeder Abholtag als Aufgabe in Heute.",
    wasteMobile: "Noch keine Abfuhrtermine. Den Kalender der Müllabfuhr importierst du am Desktop.",
  },
  waste: {
    import: "Kalender importieren …",
    noMore: "Keine Termine mehr",
    upcoming: "Weitere Termine",
    past: "Vergangene Termine",
    skip: "Überspringen",
    unskip: "Nicht mehr überspringen",
    remaining: (n: number) => (n === 1 ? "noch 1 Termin" : `noch ${n} Termine`),
    leadTime: "Vorlauf",
  },
  unverified: "Anzeige aus dem Zwischenspeicher – wird geprüft …",
  /** Kurzform in der Kopfzeile (Android): ohne eigenes Banner, damit die Liste beim Start nicht springt */
  unverifiedShort: "wird geprüft …",
};

export function writeResultMessage(r: WriteResult): string {
  switch (r.status) {
    case "ok":
      return "Gespeichert";
    case "conflict":
      return "Die Datei wurde inzwischen geändert";
    case "permission":
      return `Keine Berechtigung: ${r.message}`;
    case "missing":
      return `Datei fehlt: ${r.message}`;
    case "full":
      return `Speicher voll: ${r.message}`;
    case "exists":
      return `Datei existiert bereits: ${r.message}`;
    case "unknown":
      return `Unklarer Ausgang – bitte Wiederherstellung prüfen: ${r.message}`;
  }
}

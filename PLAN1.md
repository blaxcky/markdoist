# Plan: Markdoist – Markdown-Todo-App (Fedora/Electron + Android/React Native mit Expo)

**Stand:** 2026-10-17. Alle Rückfragen aus FRAGEN.md (F001–F018) sind beantwortet und eingearbeitet. Neu seit 2026-10-12: Nutzung der Expo-Skills und des Expo-MCP (Abschnitt 2.3).

## Stand der Umsetzung (18.10.2026)

M0–M8 sind umgesetzt und abgenommen; Version 1.0 ist veröffentlicht. Am 18.10.2026 wurde die Umsetzung vollständig gegen diese Spezifikation abgeglichen; die gefundenen Lücken (Vorschau vor Serienaktionen, Ausnahmen übernehmen, Robustheit nach 7.1/7.3/7.6, fehlende AK-Tests u. a.) sind geschlossen. Nachweise, Messwerte und alle [V]-Abweichungen stehen in [`docs/ABNAHME.md`](docs/ABNAHME.md), das Dateiformat in [`docs/DATEIFORMAT.md`](docs/DATEIFORMAT.md). Repository: https://github.com/blaxcky/markdoist (öffentlich, keine Lizenz).

**Umgesetzt am 28.10.2026 (M9):** Müllabfuhr mit ICS-Import (4.7), Serien mit fester Terminliste (5.7) und die kompaktere untere Leiste am Handy (4.5). Abnahmenotiz in `docs/ABNAHME.md`.

## Auftrag an die Umsetzung

**Die Umsetzung ist beauftragt.** Dieses Dokument ist die verbindliche Spezifikation. Vorgehen:

- Beginne mit Meilenstein M0 (Abschnitt 8) und arbeite die Meilensteine in Reihenfolge ab. Jeder Meilenstein endet mit grünen automatisierten Tests.
- Freigegeben sind: Anlegen des öffentlichen Repositorys `blaxcky/markdoist` mit der GitHub CLI, Setzen der Secrets, Erzeugen des Signierschlüssels, Einrichten der Workflows, erster Push und erstes Release. Zusätzliche Werkzeuge dürfen installiert werden (F014).
- Umfang von v1 ist nur, was nicht ausdrücklich als **„nach 1.0“** markiert ist. Abschnitt 12 listet alle zurückgestellten Punkte. Für zurückgestellte Punkte werden keine Gerüste vorab angelegt.
- Vor jeder Arbeit an `apps/mobile` (Expo/React Native) zuerst den Skill `expo:expo-overview` laden, dann den passenden Fach-Skill aus Abschnitt 2.3. Für aktuelle Expo-Doku und die Prüfung der laufenden App im Emulator den Expo-MCP nutzen (ebenfalls 2.3). Festlegungen dieses Plans haben Vorrang vor Skill-Standards.
- Bei echter fachlicher Unklarheit: Fragen gesammelt über das Fragen-Tool stellen (Skill `fragen`, Dateien unter `.fragen/`, siehe `CLAUDE.md`), nie im Chat oder über AskUserQuestion. Bis zur Antwort mit der nächstmöglichen unabhängigen Arbeit weitermachen.
- Mit **[F]** markierte Festlegungen sind nicht verhandelbar. Mit **[V]** markierte Vorschläge dürfen angepasst werden, wenn die Umsetzung es erfordert; die Abweichung wird kurz in der Abnahmenotiz des Meilensteins festgehalten.

## Kontext

Du willst eine persönliche, lokal arbeitende Todo-App mit einer Markdown-Datei pro Aufgabe. Sie soll auf Fedora als Electron-App und auf Android als React-Native-App (mit Expo) laufen. Ein externes Sync-Programm, das du bereits eingerichtet hast, gleicht den Ordner ab.

## Entscheidungen aus FRAGEN.md

| Frage | Ergebnis | Wirkt auf |
|---|---|---|
| F001 Name | **Markdoist**, applicationId `de.markdoist.aufgaben` | 1, 2.1, 10 |
| F002 Dateiname | lesbarer Name aus dem Titel bei der Erstellung, bereinigt; maßgeblich bleibt `title` im YAML; keine automatische Umbenennung | 3.1 |
| F003 Unterordner | nur die oberste Ebene wird eingelesen | 3.1 |
| F004 Papierkorb | `.todo-trash/` im Aufgabenordner, wird mitsynchronisiert; Leeren nur von Hand, kein automatisches Löschen in v1 | 3.1, 4.4 |
| F005 Zeitumfang | Stufe (2): optional eine feste Uhrzeit pro Vorkommen; mehrere Vorkommen pro Tag und stündliche Regeln sind nicht in v1 | 3.2, 5, 6 |
| F006 Erledigungszeit je Vorkommen | nein, wie TaskNotes nur Datumslisten | 5.5 |
| F007 Manuelle Reihenfolge | nein | 3.1, 4.3 |
| F008 Globale Schnellerfassung (Desktop) | nein | 4.5 |
| F009 Android-Schnellerfassung | ja, App-Verknüpfung „Neue Aufgabe“ am App-Symbol | 2.2, 4.5, 9 |
| F010 Fedora-Paket | RPM per `dnf` über das GitHub-Release; zusätzlich AppImage für die lokale Installation (Entscheidung vom 21.10.2026); kein Flatpak | 10.1 |
| F011 Android-Auslieferung | GitHub baut die APK und stellt sie bereit; Installation am Handy über Obtainium; React Native mit Expo. Details siehe F015–F018. | 2, 8, 9, 10.2 |
| F012 Sync | Ordner liegt am Handy unter `Documents/…`, Obsidian liest ihn mit; um die Synchronisation kümmert sich die App nicht | 1, 7.4, 7.5, 8 |
| F013 Bestehende Dateien | kein automatischer Import; manuell hinzugefügte Dateien werden tolerant gelesen | 3.2, 7.1 |
| F014 Werkzeuge | Expo ist gesetzt; zusätzliche Installationen sind erlaubt | 10 |
| F015 Repository | öffentlich, Name `markdoist`; angelegt und verwaltet mit der GitHub CLI (`gh`). Das angemeldete Konto ist `blaxcky`, das Repository heißt also `blaxcky/markdoist`; es existiert noch nicht. | 2.1, 8, 10 |
| F016 Veröffentlichung | **jeder Push auf `main` wird ein Release** zum Testen (Option a) | 8, 9, 10.2 |
| F017 RPM über GitHub | ja, das RPM wird mitgebaut und an dasselbe Release gehängt | 10.1 |
| F018 Handy und Tests | Android 16 (API 36). **Keine Prüflisten am Handy**: Alle Android-Prüfungen mache ich selbst im Emulator mit API 36 und kennzeichne sie so. Du nutzt die App einfach. | 8, 9, 10.2 |

**Entscheidungen aus `.fragen/2026-10-17-1624-repo-und-lizenz.md` (17.10.2026):**
- Repository-Anlage, Secrets und Push führt die Umsetzung aus; die Freigabe bestätigst du im Claude-Code-Dialog (der Auto-Modus blockiert öffentliche Aktionen sonst).
- **Keine Lizenz** [F]: alle Rechte vorbehalten, keine Lizenzdatei; RPM-Lizenzfeld `UNLICENSED`. Später änderbar.
- Expo-CLI ist angemeldet; der Expo-MCP kann für Emulator-Prüfungen genutzt werden (2.3).

**Entscheidung aus `.fragen/2026-10-18-1242-serienstatus.md` (18.10.2026):** Das Statusfeld einer wiederkehrenden Aufgabe bietet kein „Erledigt“ an. Erledigen und Beenden laufen nur über die Serienknöpfe („Vorkommen erledigen“, „Erledigen und Serie beenden“, „Serie ohne Erledigung beenden“); Wischen, Leertaste und Listen-Checkbox erledigen das aktuelle Vorkommen. Eine beendete Serie zeigt „Erledigt“ weiter als aktuellen Wert (3.2).

**Zusätzliche Entscheidung (Chat, 12.10.2026) [F]:** Wird eine Wiederholung auf „noch fünfmal“ geändert, gelten **ab der Änderung fünf weitere Vorkommen**. Frühere Erledigungen werden nicht angerechnet; die alte Historie bleibt in derselben Datei erhalten (3.2, 5.1, 5.4).

**Entscheidungen aus `.fragen/2026-10-26-2303-listen.md` (26.10.2026, neue Funktion „Listen“, Abschnitt 4.6):**
- Einfache Abhaklisten ohne Termine (Einkauf, Packliste, Gesprächsthemen) ergänzen die Aufgaben. Sie erscheinen in keiner Aufgabenansicht.
- Abgehakte Einträge wandern in einen einklappbaren Bereich „Abgehakt (n)“ am Listenende.
- Eine nicht mehr gebrauchte Liste wird gelöscht (Papierkorb, Undo); es gibt kein „Abschließen“.
- Android: fünfter Reiter „Listen“ (am 28.10.2026 ersetzt durch „⋯ Mehr → Listen“, siehe unten); kein Eintrag „Neue Liste“ in der App-Verknüpfung.
- Sammelaktionen: „Abgehakte entfernen“, „Alle Haken zurücksetzen“, Reihenfolge per Ziehen. Kein Duplizieren.
- Übersicht: zuletzt geänderte Liste zuerst.

**Entscheidungen aus `.fragen/2026-10-28-1849-muellabfuhr.md` (28.10.2026, neue Funktion „Müllabfuhr“, Abschnitte 4.5, 4.7, 5.7):**
- Die Abholtermine der Müllabfuhr kommen einmal im Jahr als ICS-Datei und werden importiert. Je Abfuhrart entsteht **eine Serie mit fester Terminliste**, keine Einzelaufgabe je Abholtag. Frist am Abholtag, geplant eine Woche vorher.
- Ein verstrichener, nicht abgehakter Abholtermin bleibt überfällig, bis er abgehakt oder übersprungen wird, wie jede Aufgabe (5.2). Je Abfuhrart steht so höchstens ein überfälliger Eintrag.
- Import nur am Desktop. Am Handy werden die Termine angezeigt und erledigt.
- **Untere Leiste am Handy: Eingang, Heute, Alle, ⋯ Mehr.** „Mehr“ öffnet ein Blatt mit den drei Einträgen Erledigt, Listen und Müllabfuhr; jeder öffnet seine Übersicht. **Das ersetzt die Entscheidung vom 26.10.2026 „fünfter Reiter Listen“.**
- Das ⋮-Menü der Kopfzeile bleibt unverändert (Neu einlesen, Verlauf, Probleme, Papierkorb, Einstellungen).
- Vorlage ist die vom Nutzer bereitgestellte ICS-Datei im Ordner `abfuhrtermine/`. Sie enthält die Wohnadresse und gehört deshalb nicht ins öffentliche Repository (`.gitignore`); Tests verwenden eine anonymisierte Nachbildung.

**Entscheidungen aus `.fragen/2026-10-23-2320-wiederholungen.md` (23.10.2026, Testrunde Wiederholungen, Bericht `docs/TEST-WIEDERHOLUNGEN.md`):**
- „Ab Erledigung“ mit Regel ohne BY-Teile rechnet als fester Abstand ab dem Erledigungstag mit Klemmen ans Monatsende (31.10. + 1 Monat = 30.11.); rrule-Verhalten gilt nur noch für Completion-Regeln mit BY-Teilen (5.2).
- Kalenderserien mit COUNT bleiben wie in 5.2: versäumte Termine verlängern die Serie nicht.
- Außerdem festgelegt: Fehlen in einer Fremddatei `recurrence_revision` oder `recurrence_start`, ergänzt die erste Serienaktion beide Felder mit den beim Lesen abgeleiteten Werten (3.2, 5.4) Das gilt für jede schreibende Serienaktion einschließlich Bezugsfeld ändern und Wiederöffnen.

Das Projektverzeichnis `/home/markus/GitHub/local-first-todo` enthält bislang nur die Planungsdokumente. Festgestellte Umgebung (in M0 erneut prüfen):
- Node 22.22
- Android SDK in `~/Android/Sdk` (Plattformen 35/36, Build-Tools 35–37, Emulator-Images 36/37)
- JDK 21 und 25, aber kein JDK 17
- `rpmbuild`, `podman` und `syncthing`

**Dokumente:**
- `PLAN1.md` (diese Datei): Spezifikation und Entwicklungsplan.
- `FRAGEN.md`: Archiv der Rückfragen F001–F018 mit Antworten, wird nicht mehr erweitert.
- `.fragen/`: neue Rückfragen über das Fragen-Tool (siehe `CLAUDE.md`).

Technische Annahmen werden in den Meilensteinen überprüft; eine fertige Planung ersetzt diesen Nachweis nicht.

---

# TEIL A – Spezifikation

# Spezifikation: Markdoist (Stand: 2026-10-12)

**Legende:**
- **[F]** = von dir festgelegt.
- **[V]** = mein Umsetzungsvorschlag oder Standardwert. Er gilt, solange du nicht widersprichst.
- **nach 1.0** = bewusst aus v1 ausgenommen, siehe Abschnitt 12.

## 1. Feststehende Anforderungen (Kurzfassung) [F]

- **Name:** Markdoist, Android-applicationId `de.markdoist.aufgaben` (F001).
- **Plattformen:** Electron auf Fedora, React Native mit **Expo** auf Android (F011/F014). Die App arbeitet vollständig lokal und offline. Es gibt keinen eigenen Sync-Server. Dein bestehendes Sync-Programm gleicht den Ordner ab; die App muss es weder kennen noch einrichten (F012).
- **Auslieferung:**
  - Android: GitHub baut die APK und stellt sie als Release bereit; du installierst sie über Obtainium (F011).
  - Fedora: RPM, Installation mit `dnf` (F010).
  - Nutzer ist nur eine Person.
- **Dateien:**
  - Eine Aufgabe entspricht genau einer Markdown-Datei mit YAML-Frontmatter.
  - Eine Wiederholungsserie bleibt eine Datei.
  - Der Ordner ist frei wählbar, voraussichtlich ein Unterordner eines Obsidian-Vaults. Am Handy liegt er unter `Documents/…`, was SAF freigeben kann. Es entsteht keine Abhängigkeit von Obsidian.
  - Eingelesen wird nur die oberste Ordnerebene (F003).
  - Die Dateien bleiben mit externen Editoren bearbeitbar.
  - TaskNotes dient nur als Vorbild; Formatkompatibilität ist keine Anforderung.
- **Funktionsumfang v1:**
  - Listen, Schnellerfassung, Suche und Filter.
  - Status, Priorität, `due` (Frist) und `scheduled` (geplanter Bearbeitungstag), beide unabhängig und optional.
  - Umfassende Wiederholungen.
  - Markdown-Editor mit Vorschau und Checklisten.
  - Formularfelder für die YAML-Eigenschaften.
- **Nicht in v1:** Projekte, Unteraufgaben, Abhängigkeiten, Kalender, Kanban, Anhänge, natürlichsprachige Erfassung, Erinnerungen und Benachrichtigungen. Dafür werden auch keine Gerüste vorab angelegt.
- **Eingang:**
  - Jede neu erfasste Aufgabe landet immer im Eingang, auch wenn sie aus „Heute“ heraus erfasst wird oder einen Termin hat.
  - Neue Aufgaben übernehmen keinen Termin aus der gerade geöffneten Ansicht.
  - „Ohne Termin“ und „im Eingang“ sind verschiedene Zustände.
  - Wird eine Serie fortgeschrieben, kommt sie nicht zurück in den Eingang.
  - „Alle offenen Aufgaben“ ist gut erreichbar.
- **Heute:**
  - Der Hauptbereich enthält Aufgaben, deren `due` heute oder früher liegt.
  - Ein eigener Unterbereich enthält die `scheduled`-Aufgaben.
- **Wiederholungen:**
  - Zwei Arten: Kalenderrhythmus und „when done“ (ab tatsächlicher Erledigung).
  - Regeln werden mit einer RRULE-Bibliothek berechnet, nicht über feste Presets.
  - Die Historie (erledigte und übersprungene Vorkommen) steht in derselben Frontmatter.
  - Die Listenposition der Historie hat keine fachliche Bedeutung.
  - Mehrfache Verarbeitung derselben Aktion bleibt ohne zusätzliche Wirkung.
  - Nach einer Regeländerung gilt eine neu gesetzte Anzahl nur für den neuen Serienabschnitt; die bisherige Historie bleibt in derselben Datei erhalten [F].
- **Speichern:**
  - Die Markdown-Dateien sind die maßgebliche Quelle; der Index lässt sich jederzeit neu daraus aufbauen.
  - Unbekannte Felder und der Notiztext bleiben erhalten.
  - Bloßes Einlesen schreibt nichts.
  - Konfliktvarianten bleiben erhalten.
  - Android greift über das Storage Access Framework (SAF) zu.

## 2. Architektur

### 2.1 Struktur [V]

Ein gemeinsames Repository (pnpm-Workspaces) mit einem plattformfreien TypeScript-Kern. Darauf setzen zwei getrennte Oberflächen und zwei getrennte Speicheradapter auf.

```
local-first-todo/            (auf GitHub: blaxcky/markdoist, öffentlich, F015)
  PLAN1.md, FRAGEN.md
  docs/DATEIFORMAT.md        (später aus Abschnitt 3 abgeleitet)
  .github/workflows/         ci.yml (Prüfungen), release.yml (APK + RPM bei jedem Push auf main)
  packages/core/     Datenmodell, Frontmatter-Parser/-Serializer, Datumslogik, Wiederholungen,
                     Abfragen (Eingang/Heute/…), Suche, Filter, Sortierung, Aktionen,
                     Konflikterkennung. Rein funktional, keine Datei- oder Plattform-APIs.
  packages/app/      StorageAdapter-Schnittstelle, Index/Store (zustand), Schreibwarteschlange,
                     Undo-Journal, deutsche Texte und Datumsformatierung, gemeinsame React-Hooks.
  apps/desktop/      Electron: Main-Prozess (Dateisystem, Watcher, IPC), Preload, Renderer (React DOM)
  apps/mobile/       React Native mit Expo (Prebuild + Gradle; Release-Build in GitHub Actions)
                     + modules/saf-storage (Kotlin, Expo-Modul) + Config-Plugin für die App-Verknüpfung
```

Bewertung deines Architekturvorschlags: **übernommen.**
- Der gemeinsame Kern enthält alles, was fachlich fehleranfällig ist: Datumsregeln, Wiederholungen, Formaterhalt und Ansichtslogik. Diese Teile werden einmal geschrieben und einmal getestet.
- Die React-Oberflächen bleiben getrennt (React DOM bzw. React Native). Zustand und Hooks teilen sie sich über `packages/app`.
- Eine gemeinsame Oberfläche über react-native-web lehne ich ab: Sie brächte für eine Desktop-App mit Tastaturbedienung mehr Kompromisse als Ersparnis.

**StorageAdapter** (auf beiden Plattformen derselbe fachliche Vertrag; die Plattform verantwortet auch ihr dauerhaftes Journal und die Wiederherstellung):

```ts
interface StorageAdapter {
  list(scope: "tasks" | "trash"): Promise<FileMeta[]>; // name, ref, mtime/size nullable
  read(ref): Promise<{ text: string; hash: string; mtime: number | null }>;
  write(ref, text, expectedHash): Promise<WriteResult>;   // Konflikt, wenn aktueller Hash ≠ expectedHash
  create(name, text): Promise<FileMeta>;       // liefert den tatsächlich vergebenen Namen
  moveToTrash(ref, expectedHash) / restoreFromTrash(ref, expectedHash)
  rename(ref, newName, expectedHash) / deletePermanently(ref, expectedHash)
  recover(): Promise<RecoveryCase[]>;          // offene Vorgänge vor weiteren Schreibaktionen
  watch?(onChange): Unsubscribe;               // nur Desktop
}
```

Dies ist eine Vertragsskizze, kein Anwendungscode. Schreiboperationen liefern die tatsächlich gültige Referenz und den Namen zurück; insbesondere nach SAF-Umbenennen/Verschieben darf eine alte URI nicht weiterbenutzt werden. Ergebnisse unterscheiden Erfolg, Konflikt, fehlende Berechtigung, fehlende Datei, vollen Speicher und unklaren Ausgang. Pro Datei werden Aktionen serialisiert. Auf dem Desktop schreibt nur eine App-Instanz; weitere Starts aktivieren sie. Wiederholungen eines unklar ausgegangenen Vorgangs werden erst nach Journalprüfung zugelassen (7.3).

### 2.2 Bibliotheken [V]

| Bereich | Wahl | Begründung |
|---|---|---|
| Monorepo | pnpm-Workspaces (`node-linker=hoisted` für Metro), TypeScript strict, ESLint, Prettier | Ein Repo, gemeinsame Typen; `hoisted` vermeidet die bekannten Symlink-Probleme von Metro. |
| Datum/Zeit | `temporal-polyfill` (Version in M0 pinnen; PlainDate, PlainDateTime, Instant, gezielte Zeitzonenauflösung) | Kalenderberechnung bleibt unabhängig von UTC. Für Fristen mit Uhrzeit, Offset-Importe und die doppelte Sommerzeitstunde wird dagegen eine Zeitzonenauflösung benötigt (3.3). Gerätezone und Uhr werden injiziert; native bzw. Polyfill-Unterstützung auf Hermes wird in M0 geprüft. Kein pauschales Versprechen, ohne Zeitzonen-API auszukommen. |
| Wiederholungen | `rrule` (rrule.js) 2.8.x, gekapselt hinter einer eigenen `RecurrenceEngine`-Schnittstelle | Bewährte, sehr verbreitete Teilportierung von python-dateutil. Unterstützt alle FREQ-Werte, INTERVAL, COUNT, UNTIL, BYDAY mit Ordinalen, BYMONTHDAY, BYSETPOS, BYYEARDAY, BYWEEKNO, BYMONTH, BYHOUR/BYMINUTE und WKST. Markdoist nutzt in v1 davon nur den Umfang aus Abschnitt 6. Bekannte Einschränkungen siehe Abschnitt 6. Die letzten Versionen (2.8.x) stammen von 2023/24, die Bibliothek wird kaum noch weiterentwickelt; deshalb die Kapselung. |
| Wiederholungen (Alternative) | `rrule-temporal` (geprüft, nicht gewählt) | Temporal-nativ, unterstützt RFC 7529 SKIP und deutsche Textausgabe. Das Projekt ist aber noch jung (≈ 120 Sterne). Es bleibt eine Reserveoption hinter derselben Schnittstelle. |
| RRULE-Validierung | eigener Tokenizer mit Positivliste | rrule.js ist beim Parsen zu nachsichtig. Unbekanntes muss erkannt und unverändert erhalten werden (Abschnitt 6). |
| Testreferenz | Golden-Fixtures aus python-dateutil (nur zur Entwicklung) | Unabhängige Referenzimplementierung für die Erwartungswerte. |
| YAML | `yaml` 2.x (eemeli) | Standard ist YAML 1.2 Core; `2026-10-14` bleibt dabei ein String. YAML 1.1 würde daraus ein UTC-`Date` machen, ein klassischer stiller Verschiebungsfehler. Quellbereiche (`range`) und CST ermöglichen chirurgische Änderungen (7.2). |
| Markdown-Vorschau | `markdown-it` (`html: false`, linkify) + eigene Checkbox-Regel | Läuft in Electron und Hermes. Auf Android wird dasselbe HTML in einer WebView gezeigt, damit beide Vorschauen gleich aussehen. Checkboxen lassen sich zeilengenau umschalten. |
| Desktop | aktuelles stabiles Electron (in M0 festgelegt), `electron-vite`, React 19, CodeMirror 6 (Markdown), `chokidar` 4, `electron-builder` (Ziel: nur RPM), Playwright (Electron-E2E) | Standardwerkzeuge. CodeMirror ist ein schlanker, erweiterbarer Editor. chokidar ist der robuste Watcher. electron-builder erzeugt das RPM. |
| Android [F: Expo] | React Native über das **Expo SDK** (aktuelle stabile Version, gepinnt). Expo wird so genutzt: Continuous Native Generation (`expo prebuild`), Expo Modules API für das eigene Kotlin-Modul, Config-Plugins für native Einstellungen, `expo-dev-client` für Entwicklungs-Builds. **Kein Expo Go**: Expo Go kann keine eigenen nativen Module laden. **Kein EAS Build**: Releases baut GitHub Actions (siehe 10.2); für Build und Release ist kein Expo-Konto nötig. Das Konto wird nur für den Expo-MCP in der Entwicklung genutzt (2.3). | Expo ist von dir vorgegeben (F011/F014). Mit dem Expo-Modules-API lässt sich das SAF-Modul sauber einbinden; der Build bleibt mit Gradle reproduzierbar und läuft lokal wie in GitHub Actions. |
| Android-Schnellerfassung | statische App-Verknüpfung „Neue Aufgabe“ (`shortcuts.xml` über ein eigenes kleines Config-Plugin), öffnet `markdoist://capture` | F009. Kein zusätzliches Paket nötig; der Deep-Link öffnet direkt den Erfassungsdialog. |
| CI/Auslieferung | GitHub Actions: Prüfungen bei jedem Push; jeder Push auf `main` startet den Release-Workflow (F016). Er baut die signierte APK und das RPM (F017) und hängt beide an ein GitHub-Release; Obtainium verfolgt diese Releases. Repository und Secrets werden mit der GitHub CLI eingerichtet (F015). | F011. Der Signierschlüssel liegt nur als verschlüsseltes GitHub-Secret vor, nie im Repository. |
| Android-Speicher | eigenes Kotlin-Modul `saf-storage` (Expo-Modul) | Kontrolliert Baumauswahl mit `takePersistableUriPermission`, Metadatenabfragen, `"wt"`-Schreiben, Journal, MIME-Typ, Verschieben und Umbenennen. Der Umfang ergibt sich aus den Fehler- und Wiederherstellungsfällen in M1; eine feste Zeilenzahl wird nicht zugesichert. |
| Android-UI | React Navigation, FlashList, react-native-webview, `@react-native-community/datetimepicker`, react-native-gesture-handler, Maestro (E2E auf dem Emulator) | Etablierte Bausteine. Maestro kann auch den SAF-Ordnerdialog automatisieren. |
| Zustand | zustand | Klein, läuft identisch unter React DOM und React Native. |
| Konfliktansicht | `diff` (jsdiff) | Zeilendiff für die Gegenüberstellung von Varianten. |
| IDs | ULID (eigene kleine Funktion; Zufall über `crypto.getRandomValues`, auf Android über `expo-crypto`) | Stabil, sortierbar, ohne zentrale Vergabe. |
| Tests | Vitest + fast-check (Eigenschaftstests) | Prüft unter anderem, dass die Reihenfolge der Historie egal ist und dass Aktionen idempotent sind. |

**Electron-Sicherheit [V]:** `contextIsolation`, `sandbox` und kein `nodeIntegration`. Der Renderer erreicht über IPC nur ordnerbezogene Operationen. Links öffnen extern über `shell.openExternal` und nur für http(s).

### 2.3 Expo-Skills und Expo-MCP in der Umsetzung [V]

Für die Android-App nutzt die Umsetzung die Skills des Expo-Plugins und den Expo-MCP. Sie liefern aktuelle Expo-Muster und -Doku und erlauben, die laufende App im Emulator zu prüfen. Sie ändern keine Festlegung dieses Plans: [F]-Punkte und die Bibliotheksauswahl in 2.2 gehen den Standardempfehlungen der Skills vor. Will ein Skill etwas anderes (etwa `@expo/ui` statt `@react-native-community/datetimepicker` oder Expo Router statt React Navigation), wird das als [V]-Abweichung begründet und in der Abnahmenotiz festgehalten, nicht stillschweigend getauscht.

**Skills und wo sie greifen:**

| Skill | Einsatz | Meilenstein |
|---|---|---|
| `expo:expo-overview` | Einstieg vor jeder Expo-Aufgabe; gemeinsame Setup-Regeln (SDK-Pinning, `expo install` für passende Versionen) | alle mit `apps/mobile` |
| `expo:expo-upgrade` | SDK-Version wählen und pinnen, Abhängigkeiten mit `expo install --check` abgleichen, spätere SDK-Updates | M0, laufend |
| `expo:expo-dev-client` | lokaler Development-Build im Emulator (nur der lokale Teil; TestFlight/EAS entfällt) | M0, M1 |
| `expo:expo-module` | Kotlin-Modul `saf-storage` mit der Expo Modules API; Config-Plugins (App-Verknüpfung, `shortcuts.xml`, Manifest) | M1, M5 |
| `expo:expo-native-ui` | Android-gerechte Oberfläche, Farben, Bedienelemente, hell/dunkel | M5, M6 |
| `expo:expo-design-system` | gemeinsame Tokens und Bausteine, damit alle Ansichten einheitlich wirken | M5, M6 |
| `expo:expo-ui` | Prüfung, ob `@expo/ui` (Jetpack Compose) für Auswahl, Schalter, Menüs oder Bottom-Sheets besser passt; Abweichung von 2.2 nur wie oben beschrieben | M5, M6 |
| `expo:expo-animation` | Wischgesten und Rückmeldungen mit Gesture Handler und Reanimated | M5 |
| `expo:expo-skill-feedback` | Rückmeldung an Expo, wenn ein Skill fehlt, irreführt oder sich nicht bewährt hat | bei Bedarf |

Nicht genutzt: alle `eas-*`-Skills (kein EAS Build, Update, Hosting, Workflows oder EAS-Simulator, siehe 10.2), `expo-router` und `expo-project-structure` (Navigation und Ordnerstruktur sind in 2.1/2.2 festgelegt), `expo-app-clip` und `expo-brownfield` (kein iOS, keine native Bestandsapp), `expo-data-fetching` (die App arbeitet ohne Netzwerk).

**Expo-MCP (`plugin:expo:expo`):**
- **Genutzt (Server):** `search_documentation` und `read_documentation` für aktuelle Expo-Doku, bevor Expo-APIs, Config-Plugins oder Prebuild-Einstellungen geschrieben werden; `add_library` als Alternative zu `pnpm expo install`.
- **Genutzt (lokal, ab SDK 54):** `automation_take_screenshot`, `automation_tap`, `automation_find_view`, `collect_app_logs` und `open_devtools` gegen den Development-Build im API-36-Emulator. Damit prüft die Umsetzung Oberflächenänderungen während der Entwicklung selbst. Interaktive Elemente erhalten dafür stabile `testID`s, die auch Maestro nutzt. Lokale Werkzeuge gibt es auf Linux nur für Android; das passt zum Ziel.
- **Nicht genutzt:** `build_*`, `workflow_*`, `simulator_*`, `sandbox_*`, `observe_*`, `testflight_*`, `appstore_*`, `playstore_*` und `usage_budget_*`. Sie gehören zu EAS bzw. den Stores, die der Plan ausschließt.
- **Abnahme bleibt bei Maestro:** MCP-Screenshots und -Taps ersetzen die Maestro-Flows nicht. Abnahmekriterien gelten erst mit grünen Maestro-Flows.
- **Datenschutz:** Lokale Screenshots und Logs laufen über den Expo-Server zurück zum Werkzeug. Im Emulator werden deshalb nur Testdaten verwendet, nie deine echten Aufgaben.
- **Keine Abhängigkeit der Auslieferung:** `expo-mcp` ist nur Entwicklungsabhängigkeit. CI, Release-Workflow und die gebaute APK brauchen weder das Paket noch ein Expo-Konto. Fällt der MCP aus, geht die Umsetzung ohne ihn weiter (Doku im Browser, Prüfung über Maestro und adb).

## 3. Dateiformat

### 3.1 Ordner und Dateien

- **Aufgabenordner [F]:** frei wählbar. Eingelesen wird **nur die oberste Ebene** (F003). Unterordner werden nicht durchsucht, neue Aufgaben entstehen immer in der obersten Ebene.
- **Erkennung [V]:**
  - Jede `.md`-Datei mit einer YAML-Frontmatter (Mapping) gilt als Aufgabe.
  - Dateien ohne Frontmatter erscheinen unter „Probleme → Nicht erkannte Dateien“. Die Aktion „Als Aufgabe übernehmen“ schreibt dort ausdrücklich eine Frontmatter.
  - Versteckte Dateien und Ordner (Name beginnt mit `.`) werden ignoriert.
  - Konfliktkopien des Sync-Programms werden als Konfliktvariante behandelt, nicht als eigene Aufgabe (7.4).
- **Dateiname [F, F002]:** Ein lesbarer Name wird bei der Erstellung aus dem Titel gebildet, z. B. `Zahnarzttermin vereinbaren.md`. Wegen Sonderzeichen kann er vom Titel abweichen; maßgeblich ist immer `title` im YAML.
  - Bereinigung:
    - Folgende Zeichen werden entfernt: `/ \ : * ? " < > |` sowie Steuerzeichen und `# ^ [ ]` (stören Obsidian-Links).
    - Unicode wird nach NFC normalisiert.
    - Führende und abschließende Punkte und Leerzeichen werden gekürzt.
    - Der Name ist höchstens 100 Zeichen lang.
    - Zusätzlich höchstens 240 UTF-8-Bytes einschließlich Kollisionssuffix und `.md`; ohne ein Unicode-Zeichen zu zerschneiden kürzen. Wird der bereinigte Name leer, `Aufgabe <kurze ID>.md` verwenden.
  - Bei einer Namenskollision wird eine Zahl angehängt: `… 2.md`.
  - Ändert sich der Titel, wird die Datei **nicht** automatisch umbenannt. Dafür gibt es die ausdrückliche Aktion „Dateinamen an Titel angleichen“.
  - Maßgeblich für den Titel ist immer `title` im YAML.
- **Papierkorb [F, F004]:** `.todo-trash/` im Aufgabenordner. Der Ordner wird mitsynchronisiert, dadurch ist Wiederherstellen auf allen Geräten möglich. Obsidian ignoriert Punkt-Ordner. Endgültig gelöscht wird nur über „Papierkorb leeren“. Automatisches Löschen nach einer Frist ist eine mögliche spätere Erweiterung, in v1 aber nicht vorgesehen.
- **Synchronisierbare Nutzerdaten [F, F007]:** In v1 entstehen keine. Es gibt keine manuelle Reihenfolge und daher keine Zusatzdateien außer dem Papierkorb.
- **Technische Caches** liegen nur im App-Datenverzeichnis, nie im Aufgabenordner (Desktop: `~/.config/markdoist/`, Android: app-privater Speicher).
- **Vorhandene Dateien [F, F013]:** Es gibt keinen Import beim Start. Von Hand hinzugefügte Dateien werden tolerant gelesen (Standards siehe 3.2) und erst bei einer Nutzeraktion geschrieben.

### 3.2 YAML-Schema

| Feld | Typ / Werte | Pflicht? | Bedeutung | Lese-Standard bei Fehlen [V] | Herkunft |
|---|---|---|---|---|---|
| `id` | ULID-String | geschrieben immer | stabile Identität, bleibt bei Umbenennen und Verschieben gleich | temporäre, ordnerbezogene Identität aus der Dateireferenz. Die App vergibt eine echte ULID erst beim ersten **aktiven** Schreiben. | [V] |
| `format_version` | positive Ganzzahl, zunächst `1` | bei neuen Dateien | Version der von Markdoist interpretierten Semantik | fehlt = tolerant gelesene Altfassung, siehe unten | [V] |
| `title` | String | geschrieben immer | maßgeblicher Titel | Dateiname ohne `.md`, mit Hinweis | [F] |
| `status` | `open` \| `in-progress` \| `done` | geschrieben immer | Zustand. Bei einer Serie: `done` = Serie beendet (gesetzt nur über die Serienknöpfe, Entscheidung 18.10.2026) | `open`. Unbekannter Wert (z. B. `waiting`): wird als offen gelistet, Warnsymbol, Rohwert bleibt erhalten. | [F]-Feld, Werte [V] |
| `priority` | `none` \| `low` \| `normal` \| `high` | geschrieben immer | Priorität | `none`. Unbekannter Wert: `none` + Hinweis, Rohwert bleibt. | [F]-Feld, Werte [V] |
| `inbox` | YAML-Boolean `true`/`false` | geschrieben immer | Eingangszustand | `true` bei offenen Aufgaben (extern angelegte Dateien gehen nicht verloren). Nicht-Boolean (z. B. `"yes"`): `true` + Hinweis. | [V] |
| `due` | Datum `YYYY-MM-DD` oder lokale Datumszeit `YYYY-MM-DDTHH:mm` | optional | Frist | keine Frist. Ungültiger Wert: wird ignoriert, Hinweis, bleibt unverändert. | [F] |
| `scheduled` | wie `due` | optional | geplanter Bearbeitungstag | wie `due` | [F] |
| `recurrence` | RRULE-Wert nach RFC 5545 **ohne** DTSTART, z. B. `FREQ=WEEKLY;BYDAY=MO` | optional | Regel; vorhanden = Serie | keine Serie. Präfix `RRULE:` und die TaskNotes-Form `DTSTART:…;FREQ=…` werden gelesen und nicht umgeschrieben. | [F]-Feld, Form [V] |
| `recurrence_dates` | Liste von Daten `YYYY-MM-DD` | statt `recurrence` bei einer Serie mit fester Terminliste (5.7) | die Termine der Serie; vorhanden = Serie | keine Serie. Zusammen mit `recurrence`, mit Uhrzeiten oder ungültigen Einträgen: Probleme, Serienaktionen gesperrt, Rohwert bleibt. | [V], Entscheidung 28.10.2026 |
| `recurrence_revision` | ULID-String | bei neu angelegter/geänderter Serie | Identität des aktiven Serienabschnitts; neue Regel oder neue Begrenzung = neue Revision | temporäre Alt-Revisionskennung; wird erst bei einer ausdrücklichen Serienaktion materialisiert | [V] |
| `recurrence_archive` | Liste abgeschlossener Abschnitts-Snapshots, siehe 5.1 | optional | frühere Regeln mit ihrer Historie; zählen nicht im aktiven Abschnitt | leer | [V], erhält die Historie nach [F] |
| `recurrence_start` | Datum oder lokale Datumszeit | bei Serie | Beginn des Regelrasters (DTSTART). Eine Uhrzeit hier ist die feste Uhrzeit jedes Vorkommens (F005, 5.1). | DTSTART aus `recurrence` → `recurrence_instance` → Datum des Bezugsfelds → Datum aus `dateCreated`; bei fester Terminliste der erste Listentermin (5.7) | [V] |
| `recurrence_anchor` | `calendar` \| `completion` | bei Serie | Wiederholungsart: Kalenderrhythmus oder ab Erledigung | `calendar` | [F]-Konzept, Werte [V] |
| `recurrence_field` | `due` \| `scheduled` | bei Serie | welches Aufgabenfeld die Serie fortschreibt | `due`, wenn `due` gesetzt ist, sonst `scheduled` | [V] |
| `recurrence_offset_days` | Ganzzahl | optional | Abstand des **anderen** Datumsfelds zum Vorkommen in Kalendertagen (negativ = davor) | fehlt es und sind beide Felder gesetzt, wird der Abstand beim Fortschreiben aus den aktuellen Werten abgeleitet (5.3) | [V] |
| `recurrence_instance` | Vorkommensschlüssel (Datum innerhalb einer Revision) | bei laufender Serie | regulärer Termin des aktuell offenen Vorkommens; bei Ende ohne Folgetermin bleibt der letzte Schlüssel stehen. Einzelverschieben ändert ihn nicht. | Datum des Bezugsfelds, sonst erstes Regelvorkommen ab `recurrence_start`; fehlende Grundlage = Diagnose, niemals stillschweigend heute | [V] |
| `complete_instances` | Liste von Vorkommensschlüsseln | optional | erledigte Vorkommen des aktiven Abschnitts | leer. Reihenfolge und Duplikate haben keine Bedeutung. | [F]-Prinzip |
| `skipped_instances` | Liste von Vorkommensschlüsseln | optional | übersprungene Vorkommen. Zukünftige Einträge wirken als Ausnahmen. | leer | [F]-Prinzip |
| `last_completed_at` | Zeitstempel mit Offset | optional | tatsächlicher Zeitpunkt der letzten Vorkommenserledigung im aktiven Abschnitt; wird nur bei neuer Erledigung gesetzt | fehlt. Erster Termin einer neuen Serie = `recurrence_start`; bei inkonsistenter Historie keine erfundene Erledigungsbasis (5.2). | [F] (in deiner Ausgangsbeschreibung vorgeschlagen; bleibt trotz F006, siehe 5.5) |
| `waste_type` | String | bei Müllabfuhr-Serien | Abfuhrart so, wie sie im Titel der ICS-Termine steht (Leerraum zusammengefasst), z. B. `Restabfallbehaelter 120 l`. Kennzeichnet die Serie für die Müllabfuhr-Ansicht und ist der Schlüssel für den nächsten Import (4.7). | keine Müllabfuhr-Serie | [V], Entscheidung 28.10.2026 |
| `dateCreated` | Zeitstempel mit Offset | geschrieben immer | Erstellzeitpunkt | unbekannt. Sortierung fällt auf die Datei-mtime zurück. | [V] |
| `dateModified` | Zeitstempel mit Offset | geschrieben immer | letzte Änderung **durch die App** | unbekannt | [V] |
| `completedDate` | Zeitstempel mit Offset | bei `done` | Abschluss einer Einzelaufgabe bzw. Ende einer Serie | `dateModified`, sonst mtime | [V] |
| *alle anderen* | beliebig | – | bleiben byte-genau erhalten (z. B. `tags`, `aliases`, Kommentare) | – | [F] |

Die Feldnamen folgen deinen Vorschlägen. Dadurch mischen sie camelCase (`dateCreated`) und snake_case (`complete_instances`) [V].

**Formatversion und ältere Leser [V]:** Neue Dateien erhalten `format_version: 1`. Versionslose Dateien bleiben beim Lesen und bei unabhängigen Feldänderungen unverändert; eine ausdrückliche Serienaktion übernimmt sie nach validierter Vorschau in Version 1. Eine höhere als die unterstützte Formatversion oder eine unbekannte Struktur in den Serienfeldern führt zum schreibgeschützten Anzeigen unter Probleme, auch für Body-Änderungen. Kein automatisches Downgrade. Künftige semantische Erweiterungen, etwa mehrere Vorkommen pro Tag, benötigen eine neue Formatversion und Migrationstests; sie sind nicht pauschal „ohne Formatbruch“. Dateien werden als valides UTF-8 verarbeitet; bei ungültiger Kodierung kein Schreiben. **Formatversion 2** (28.10.2026) = Version 1 plus Serien mit fester Terminliste (5.7). Nur Dateien mit `recurrence_dates` werden mit `format_version: 2` geschrieben, alle anderen bleiben bei 1. Ein App-Stand, der nur Version 1 kennt, zeigt solche Dateien schreibgeschützt, statt eine Abfuhrart beim Abhaken als Einzelaufgabe zu erledigen. Die spätere Formatdokumentation beschreibt auch die vollständige Struktur von `recurrence_archive` aus 5.1.

Schreibweise beim Neuanlegen [V]:
- Reihenfolge der Felder: id, format_version, title, status, priority, inbox, due, scheduled, recurrence…, complete_instances, skipped_instances, last_completed_at, dateCreated, dateModified, completedDate. Bei fester Terminliste steht `recurrence_dates` an Stelle von `recurrence`, `waste_type` folgt auf `recurrence_instance` (5.7).
- Neue Felder in bestehenden Dateien werden am Ende der Frontmatter angehängt. Bestehende Felder werden nie umsortiert.
- Die App schreibt Historienlisten aufsteigend sortiert, damit sie lesbar bleiben. Beim Lesen spielt die Reihenfolge keine Rolle.

### 3.3 Datums- und Zeitwerte [V]

- **Datum** `2026-10-14`: ein Kalendertag ohne Zeitzone. Er wird nie in `Date`/UTC umgewandelt.
- **Lokale Datumszeit** `2026-10-14T17:00`: Wanduhrzeit des Geräts, ohne Offset („floating“). „Montag 9:00“ bleibt so über Sommer- und Winterzeit hinweg 9:00 Uhr.
  - Bewusste Abweichung von TaskNotes, das DTSTART in UTC (`Z`) speichert: Eine UTC-Bindung würde lokale Termine bei jeder Zeitumstellung um eine Stunde verschieben.
  - Werte mit Offset oder `Z` in `due`/`scheduled` (etwa von anderen Werkzeugen) werden gelesen, für die Anzeige in lokale Wanduhrzeit umgerechnet und unverändert gelassen, solange niemand sie bearbeitet.
- **Zeitstempel** (`dateCreated`, `dateModified`, `completedDate`, `last_completed_at`): `2026-10-12T08:14:03+02:00`, also ein Instant mit lokalem Offset zum Schreibzeitpunkt.
- **„Heute“** ist das lokale Kalenderdatum der Geräteuhr. Es wird um Mitternacht, beim Zurückwechseln in die App, bei Uhr-/Zeitzonenwechsel und beim Neueinlesen neu ausgewertet. Der Kern erhält Uhr und Gerätezone ausdrücklich als Eingaben. Überfällig-Anzeigen mit Uhrzeit werden zusätzlich am nächsten Fristzeitpunkt aktualisiert.
- **Überfällig:**
  - `due` als Datum: überfällig ab dem Folgetag. Die Frist gilt bis zum Ende des Tages.
  - `due` mit Uhrzeit: die gespeicherte Wanduhrzeit in der aktuellen Gerätezone einmal eindeutig auflösen und mit dem aktuellen Instant vergleichen; überfällig bei `jetzt > Frist-Instant`. Bei importierten Werten mit Offset gilt deren eindeutiger Instant, bis der Nutzer sie in eine lokale Frist ändert.
- **Sommerzeit:**
  - Nicht existierende Uhrzeiten werden auf den ersten gültigen Zeitpunkt nach der Zeitlücke gelegt: in `Europe/Berlin` am 28.03.2027 wird 02:30 zu 03:00 aufgelöst. Sie gelten ab diesem Übergang als verstrichen. Das ist eine ausdrückliche Produktregel; Temporals Standardverschiebung auf 03:30 genügt dafür nicht.
  - In der doppelt vorkommenden Stunde im Herbst gilt der frühere Instant. Eine Frist um 02:30 am 31.10.2027 bleibt nach dem ersten Überschreiten auch im zweiten Durchlauf um 02:15 überfällig. Dafür sind die Zeitzonenregeln nötig, nicht nur ein Vergleich von Stunden und Minuten.
  - Auflösung und Vergleich werden auf beiden Plattformen gleich getestet; für reine Datumswerte und das Kalender-Regelraster wird weiterhin keine UTC-Umrechnung verwendet.
- **Reisen:** Termine folgen der Zeitzone des jeweiligen Geräts (floating). Unterschiedliche Gerätezeitzonen werden nicht abgeglichen.
- **Wochenbeginn:** Montag (`WKST=MO`). Anzeige deutsch, z. B. `Mo, 12.10.2026`, `17:00`.

### 3.4 Beispieldateien

**a) Neue Eingangsaufgabe** – `Zahnarzttermin vereinbaren.md`
```markdown
---
id: 01K7C9V3QH2T8M4N6P0R5S1W9X
format_version: 1
title: Zahnarzttermin vereinbaren
status: open
priority: none
inbox: true
dateCreated: 2026-10-12T08:14:03+02:00
dateModified: 2026-10-12T08:14:03+02:00
---
Praxis Dr. Weber anrufen (0221 123456): Kontrolle und Zahnreinigung.
```

**b) Kalenderwiederholung** – `Wochenrückblick.md`

Jeden Freitag fällig, geplant jeweils am Donnerstag davor. Die Datei enthält ein unbekanntes Feld und einen Kommentar.

- 09-18 übersprungen (Urlaub).
- Das Vorkommen 10-02 wurde verspätet am Sa 10.10. erledigt. Weiter ging es deshalb zum nächsten zukünftigen Termin 10-16.
- 10-09 ist damit versäumt und steht weder in `complete_instances` noch in `skipped_instances`.

```markdown
---
id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C
format_version: 1
title: Wochenrückblick
status: open
priority: normal
inbox: false
due: 2026-10-16
scheduled: 2026-10-15
recurrence: FREQ=WEEKLY;BYDAY=FR
recurrence_revision: 01K69X4D2M7Q0B5T8V3W6Y1Z4D
recurrence_start: 2026-09-04
recurrence_anchor: calendar
recurrence_field: due
recurrence_offset_days: -1
recurrence_instance: 2026-10-16
complete_instances:
  - 2026-09-04
  - 2026-09-11
  - 2026-09-25
  - 2026-10-02
skipped_instances:
  - 2026-09-18
last_completed_at: 2026-10-10T10:32:00+02:00
tags: [routine]   # unbekanntes Feld, bleibt erhalten
dateCreated: 2026-09-01T19:02:11+02:00
dateModified: 2026-10-10T10:32:00+02:00
---
## Ablauf
- [ ] Erledigtes der Woche durchsehen
- [ ] Eingang leeren
- [ ] Nächste Woche grob planen

Notizen bleiben beim Fortschreiben erhalten.
```

Wird das Vorkommen 10-16 erst am Mo 19.10. erledigt, ergibt sich:
- `complete_instances` erhält 2026-10-16.
- Das nächste Vorkommen ist das erste nach max(10-16, 10-19), also **Fr 23.10.**: `due: 2026-10-23`, `scheduled: 2026-10-22` (Abstand −1).
- `recurrence_instance` wird 2026-10-23.
- Die Checkboxen werden auf `[ ]` zurückgesetzt.

**c) When-done-Wiederholung** – `Bettwäsche wechseln.md`

Vierzehn Tage nach der tatsächlichen Erledigung. Die Serie ist an `scheduled` gebunden und hat keine Frist.
- Das Vorkommen 09-05 wurde am 07.09. erledigt, daraus folgte 09-21.
- Das Vorkommen 09-21 wurde verspätet am 03.10. erledigt, daraus folgte **17.10.** (03.10. + 14).

```markdown
---
id: 01K6B2N8R4T6V8X0Z2C4E6G8J0
format_version: 1
title: Bettwäsche wechseln
status: open
priority: low
inbox: false
scheduled: 2026-10-17
recurrence: FREQ=WEEKLY;INTERVAL=2
recurrence_revision: 01K6B2N8R4T6V8X0Z2C4E6G8J1
recurrence_start: 2026-09-05
recurrence_anchor: completion
recurrence_field: scheduled
recurrence_instance: 2026-10-17
complete_instances:
  - 2026-09-05
  - 2026-09-21
last_completed_at: 2026-10-03T18:20:00+02:00
dateCreated: 2026-09-02T21:40:00+02:00
dateModified: 2026-10-03T18:20:00+02:00
---
Bezüge im Schrank links, oberstes Fach.
```

**d) Regeländerung: noch fünfmal, bisherige Historie behalten [F]**

Eine Montagsserie hat bereits die Vorkommen 28.09. und 05.10.2026 erledigt. Am 12.10. wird im Editor „noch fünfmal, jeden Montag, Beginn 12.10.“ gespeichert:
- Der bisherige Abschnitt einschließlich seiner beiden Erledigungen wird unter `recurrence_archive` abgelegt.
- Der aktive Abschnitt erhält eine neue `recurrence_revision`, `recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=5`, `recurrence_start: 2026-10-12`, `recurrence_instance: 2026-10-12` und leere C/S-Listen; `last_completed_at` des alten Abschnitts zählt nicht weiter.
- Seine fünf Kalendertermine sind **12.10., 19.10., 26.10., 02.11. und 09.11.2026**. Der erste angezeigte Termin ist bereits einer der fünf, kein zusätzliches sechstes Vorkommen.
- Nach fünf regulären Erledigungen enthält die gemeinsame Historienansicht sieben erledigte Vorkommen; für das neue COUNT zählen nur die fünf im aktiven Abschnitt. Bei Completion werden entsprechend fünf neue Erledigungen gezählt; die künftigen Termine hängen von deren tatsächlichen Tagen ab.

## 4. Regeln für Ansichten und Grundaktionen

### 4.1 Eingang [F]/[V]

- Ansicht „Eingang“: alle Aufgaben mit `status ≠ done` und wirksamem `inbox = true` [F].
- **Erfassen** [F]: Die Schnellerfassung braucht nur einen Titel; eine Notiz ist optional. Erfasst wird von jeder Ansicht aus per Taste oder Plus-Button. Die neue Datei erhält:
  - `inbox: true`, `status: open`, `priority: none`;
  - **kein** `due`/`scheduled`, auch nicht bei Erfassung aus „Heute“.
- Setzt der Nutzer ausdrücklich einen Termin (über „Erfassen & bearbeiten“ oder direkt danach im Detail), bleibt `inbox: true`. Die Aufgabe steht dann in Eingang **und**, falls zutreffend, in Heute [F].
- **„Einsortiert“** (Aus Eingang entfernen) setzt `inbox: false`, und nur diese Aktion tut das. „Zurück in den Eingang“ setzt ausdrücklich `inbox: true` [V].
- Termin setzen, ändern oder entfernen ändert `inbox` nie [F]. Erledigen und Wiederöffnen ändern `inbox` ebenfalls nicht [V].
- Das Fortschreiben einer Serie ändert `inbox` nie [F].
- Sortierung [V]: neueste zuerst (`dateCreated`), umschaltbar.

### 4.2 Heute [F]/[V]

Zwei Bereiche auf einer Seite. Jede Aufgabe erscheint höchstens einmal [F-Startvorschlag übernommen].

| Bereich | Bedingung | Sortierung [V] |
|---|---|---|
| **Fällig** | `status ≠ done` und Datumsteil von `due` ≤ heute | Überfällige zuerst (`due` aufsteigend), dann Priorität absteigend, dann Titel |
| **Geplant** | `status ≠ done`, Datumsteil von `scheduled` ≤ heute, nicht in „Fällig“. Untergruppen „Heute eingeplant“ und „Früher eingeplant“ (scheduled < heute) | `scheduled` aufsteigend, Priorität, Titel |

- Steht eine Aufgabe unter „Fällig“, wird ihr `scheduled` als Zusatz gezeigt („geplant Do 15.10.“).
- Eine überschrittene Frist bekommt die Kennzeichnung „überfällig“. Ein verstrichenes `scheduled` gilt **nicht** als überfällig; es erscheint nur in „Früher eingeplant“.
- Eingangsaufgaben erscheinen in Heute mit einem Kennzeichen „Eingang“.
- Bei einer Serie zählt das wirksame aktuelle Vorkommen (5.2).
- Aufgaben ohne `due` und `scheduled` erscheinen nur im Eingang (falls `inbox`) bzw. unter Alle offenen.
- Ungültige Datumsfelder werden einzeln ignoriert und unter Probleme gemeldet. Ein gültiges `scheduled: heute` erscheint weiterhin in Geplant, auch wenn `due` ungültig ist; ein gültiges heutiges `due` entsprechend in Fällig. Erst ohne gültigen passenden Termin fehlt die Aufgabe in Heute. Für unklare Serienfortschreibung gilt die ausdrückliche Sperre aus 5.2.

### 4.3 Weitere Ansichten [V]

- **Alle offenen Aufgaben:** alle Aufgaben mit `status ≠ done`, einschließlich der Eingangsaufgaben (mit Kennzeichen).
  - Standardsortierung: `due` aufsteigend (ohne Frist zuletzt), dann `scheduled`, Priorität, Titel.
  - Über Filter „Eingang: nein“ bleiben einsortierte Aufgaben ohne Termin dauerhaft auffindbar.
- **Erledigt:**
  - Erledigte Einzelaufgaben und beendete Serien, nach `completedDate` absteigend.
  - Darunter „Erledigte Vorkommen (letzte 30 Tage)“, abgeleitet aus den Vorkommensdaten der aktiven und archivierten C-Listen (5.5), nicht aus unbekannten tatsächlichen Erledigungszeitpunkten.
- **Probleme:** wird nur angezeigt, wenn nicht leer. Enthält ungültige Dateien, nicht unterstützte Werte und Regeln, Konflikte, doppelte IDs und nicht erkannte Dateien.

**Filter** (in jeder Ansicht kombinierbar; UND zwischen Merkmalen, ODER innerhalb einer Mehrfachauswahl):
- Status
- Priorität
- Eingang (egal/ja/nein)
- `due` (egal / keine / überfällig / heute / nächste 7 Tage / Zeitraum)
- `scheduled` (egal / keine / früher eingeplant / heute / nächste 7 Tage / Zeitraum); die Option heißt ausdrücklich nicht „überfällig“
- Wiederholung (egal / keine / Kalender / ab Erledigung / fehlerhaft)

Das Filtermodell ist ein serialisierbares Objekt. Gespeicherte eigene Listen (gespeicherte Filter) sind nicht Teil von v1, lassen sich aber später ohne Umbau ergänzen. Sie sind nicht dasselbe wie die Abhaklisten aus 4.6.

**Sortierung:** Fälligkeit, Planung, Priorität (high > normal > low > none), Titel (deutsche Sortierfolge), Erstelldatum. Leere Werte stehen immer zuletzt.

**Suche:**
- Erfasst Titel und Markdown-Inhalt.
- Groß-/Kleinschreibung und diakritische Zeichen werden ignoriert („Bettwasche“ findet „Bettwäsche“, „ss“ findet „ß“).
- Mehrere Wörter: alle müssen vorkommen.
- Titeltreffer stehen vor Inhaltstreffern.
- Standard: nur offene Aufgaben, umschaltbar auf „inkl. erledigt“.
- Umsetzung ohne Suchbibliothek: In-Memory-Suche über normalisierten Text. Bei einigen Tausend Dateien reicht das in Millisekunden.

### 4.4 Erledigen, Wiederöffnen, Löschen [V]

- **Einzelaufgabe erledigen:** `status: done` und `completedDate: <jetzt>`.
- **Wiederöffnen:** `status: open`, `completedDate` wird entfernt.
- Ein bereits erfüllter Zielzustand ist ein No-op, auch bei Zeitstempeln. Die Regeln für Wiederöffnen einer Serie stehen in 5.4.
- **Löschen:** Die Datei wandert in den Papierkorb `.todo-trash/` [F, F004]. „Wiederherstellen“ verschiebt sie zurück; bei Namenskollision wird eine Zahl angehängt.
- **Undo:**
  - Aufgaben-Undo bzw. „Rückgängig“ im Verlauf stellt den exakten vorherigen Dateiinhalt und bei Dateioperationen den vorherigen Ort/Namen wieder her. Rücknahme einer Neuanlage legt die Datei in den Papierkorb; sie wird nicht unwiederbringlich gelöscht. „Papierkorb leeren“ ist ausdrücklich endgültig und hat kein Undo.
  - Bedingung: Die Datei ist seitdem unverändert (Hash-Vergleich).
  - Das Undo-Journal ist gerätelokal, umfasst die letzten 50 Aktionen und überdauert einen Neustart.
  - **Verlauf** (Entscheidung 28.10.2026): eigener Punkt im Drei-Punkte-Menü (Android) bzw. in der Seitenleiste (Desktop), statt eines „Rückgängig“-Knopfs in der Meldung. Er zeigt die Einträge des Undo-Journals, neueste zuerst und nach Tagen gruppiert, je mit Art der Aktion, Uhrzeit und Titel; jeder Eintrag lässt sich einzeln zurücknehmen. Gesperrt mit Hinweis sind Einträge, auf deren Datei eine neuere Aktion im Journal folgt („Erst die neuere Aktion zurücknehmen“), deren Datei sich seitdem anders geändert hat oder die es nicht mehr gibt. Zurückgenommene Einträge bleiben als „Zurückgenommen“ sichtbar (höchstens die letzten 20). Desktop behält zusätzlich Ctrl+Z und den Knopf in der Kopfleiste für die letzte Aktion.
- **Detailansicht:** Formularfelder für alle Kernfelder, Markdown-Editor und Vorschau.
  - Textänderungen werden automatisch gespeichert, 1,5 s nach der letzten Eingabe und beim Verlassen.
  - Ein gerätelokaler Entwurf wird bereits während der Eingabe fortlaufend gesichert, unabhängig vom verzögerten Schreiben in die Markdown-Datei (7.6). „Gespeichert“ wird erst nach erfolgreichem Dateischreiben angezeigt.
  - Jede tatsächliche App-Änderung setzt `dateModified`; No-ops und die exakte Wiederherstellung durch Undo sind ausgenommen.
- **Status `in-progress`:** wird bei einer Serie beim Fortschreiben auf `open` zurückgesetzt.
- **Rückmeldung beim Abhaken** (Desktop und Android, gemeinsamer Ablauf `completionFlow` in `packages/app`):
  - Der Haken zeigt sofort den Zielzustand mit kurzem Aufspringen; das Schreiben startet im selben Moment.
  - Die Liste bleibt stehen, bis die Zeile fertig ist: Haken mindestens 250 ms halten, Zeile 150 ms ausblenden, Lücke 220 ms einklappen, die Zeilen darunter rücken nach.
  - Bleibt die Aufgabe nach dem Schreiben in der Ansicht (Serie in Alle oder Eingang), geht nur der Haken zurück. Schlägt das Schreiben fehl, springt die Zeile zurück und die Fehlermeldung erscheint (7.6).
  - Bei reduzierter Bewegung (System-Einstellung) entfallen Halten, Aufspringen und Einklappen.
- **Rückmeldung beim Anlegen und Löschen** (Desktop und Android, im `Repository`; Entscheidung 28.10.2026):
  - Eine neue Aufgabe oder Liste steht sofort in der Ansicht, das Erfassungsblatt schließt bzw. die Liste oder das Detail öffnet sich sofort; geschrieben wird im Hintergrund. Aktionen auf die neue Aufgabe warten, bis die Datei geschrieben ist.
  - Gelöschte Aufgaben und Listen verschwinden sofort aus allen Ansichten, das Detail schließt sofort; das Verschieben in den Papierkorb läuft im Hintergrund.
  - Nach erfolgreichem Schreiben steht die Aktion im Verlauf; eine Meldung erscheint nicht. Scheitert es, springt der Stand zurück und die Fehlermeldung erscheint; eine gescheiterte Erfassung öffnet sich erneut mit Titel und Beschreibung (7.6).
  - Ein Abgleich während eines solchen Vorgangs lässt die betroffene Datei unangetastet, damit nichts kurz zurückspringt.
- **Meldungen:** Aktionen, die im Verlauf landen, zeigen keine Meldung, außer die Aktion liefert einen Hinweis (z. B. zum Serienende). Fehler, Konflikte und endgültige Aktionen ohne Undo (z. B. „Papierkorb leeren“) melden sich weiter.
- **Lage der Meldung:** Android: Die Snackbar steht über dem Plus-Button und der unteren Leiste, auf Bildschirmen ohne Plus-Button knapp über dem unteren Rand; eine neue Meldung blendet über die alte. Desktop: unten mittig, mit Ein- und Ausblenden.

### 4.5 Bedienung [V]

- **Desktop:**
  - Aufbau: Seitenleiste (Erfassen, Suche, Eingang mit Zähler, Heute mit Zähler, Alle offenen, Erledigt, Listen, Müllabfuhr, Probleme, Papierkorb), zentrierte Liste, Details als Dialog über der Liste (Klick oder Enter öffnet, Escape schließt, ↑/↓ blättert). Gestaltung nach den Vorlage-Screenshots vom 18.10.2026 (Todoist-ähnlich): warme Seitenleiste, große Ansichtsüberschrift mit Aufgabenzahl, runde Haken in Prioritätsfarbe, Sortierung und Filter im Menü „Anzeige“.
  - Tasten:
    - Navigation und Ansichten: `N`/Ctrl+N erfassen, `/` bzw. Ctrl+F suchen, ↑/↓ bzw. `j`/`k` wählen, Enter für Details, Ctrl+1…6 für Eingang, Heute, Alle offenen, Erledigt, Listen und Müllabfuhr; „Probleme“ hat kein Kürzel, weil die Ansicht nur bei Bedarf erscheint.
    - Aufgabenaktionen: Leertaste erledigt/öffnet wieder, `E` sortiert ein, `D` setzt die Frist, `S` plant ein, `P` setzt die Priorität, Entf löscht.
    - Sonstiges: Ctrl+Z macht rückgängig, F5 liest neu ein.
  - In Eingabefeldern/Editoren sind Buchstaben-, Leertasten- und Entf-Aktionen deaktiviert. Ctrl+Z wirkt dort auf die Texteingabe; Aufgaben-Undo bleibt als eigener Befehl erreichbar. Fokus, Tastaturbedienung und Screenreader-Beschriftungen werden auch für Konflikt- und Wiederholungsdialoge geprüft.
  - Hell/dunkel folgt dem System, mit manueller Umschaltung.
  - Keine systemweite Schnellerfassung [F, F008]. Erfasst wird im App-Fenster (`N`/Ctrl+N).
- **Android:**
  - Untere Navigation mit vier Reitern: Eingang, Heute, Alle, ⋯ Mehr (Entscheidung 28.10.2026; vorher fünf Reiter mit Erledigt und Listen). Suche in der Kopfzeile, Plus-Button zum Erfassen, Ziehen nach unten zum Neueinlesen.
  - **Mehr:** Der Reiter wechselt nicht selbst die Ansicht, sondern öffnet ein Blatt von unten (wie die übrigen Blätter der App) mit den Einträgen Erledigt, Listen und Müllabfuhr. „Müllabfuhr“ erscheint nur, wenn es mindestens eine Müllabfuhr-Serie gibt, weil am Handy nicht importiert wird (4.7). Ein Eintrag öffnet die jeweilige Übersicht; solange eine dieser drei Ansichten aktiv ist, trägt „Mehr“ die hinterlegte Pille. Die Zurück-Taste führt von dort zur zuletzt gewählten Hauptansicht (Eingang, Heute oder Alle).
  - Gestaltung nach den Vorlage-Screenshots vom 19.10.2026 (Todoist-ähnlich, wie der Desktop): warmer Grund, Aufgaben als weiße Karten, runde Haken in Prioritätsfarbe, Datum mit Kalendersymbol in Farbstufe, „Eingang“ rechts in der Zeile; Kopfzeile mit großer Überschrift und Aufgabenzahl, Suche, Anzeige (Filter/Sortierung) und ⋮-Menü (Neu einlesen, Probleme, Papierkorb, Einstellungen); aktive Ansicht in der unteren Leiste mit hinterlegter Pille; roter Plus-Button.
  - Details und Erfassung als Blatt von unten über der Liste: Detail mit Eingang/Einsortiert und ⋮-Menü (Status, Wiederholung, Dateiname, Löschen), Titelkarte mit Haken, Terminzeilen, fehlende Eigenschaften als Chips (Beschreibung, Priorität, Frist, Geplant, Wiederholung), „Checklistenpunkt hinzufügen“; Erfassung mit Titelzeile, Chips und rotem Senden-Knopf über der Tastatur.
  - Wischgesten: nach rechts erledigt, nach links öffnet Aktionen (Einsortieren, Termin, Löschen).
  - Native Datums- und Zeitwahl. Die Uhrzeit bleibt hinter „Uhrzeit hinzufügen“ verborgen, bis man sie braucht (F005).
  - **App-Verknüpfung [F, F009]:** Langes Drücken auf das App-Symbol zeigt „Neue Aufgabe“. Das öffnet direkt den Erfassungsdialog; die Aufgabe landet wie jede Erfassung im Eingang. „Teilen an Markdoist“ kommt erst später, wenn gewünscht.
- **Sprache und Darstellung:** Oberfläche nur auf Deutsch, Texte zentral in `packages/app`. Hell/dunkel per Systemvorgabe oder manuell; die Einstellung ist gerätelokal.

### 4.6 Listen [F]/[V]

Entscheidungen vom 26.10.2026 (`.fragen/2026-10-26-2303-listen.md`) [F]; Umsetzung [V].

- **Zweck:** einmalige Abhaklisten ohne Termine, Priorität, Eingang oder Wiederholung, z. B. Einkaufsliste, Packliste, „mit Mama besprechen“.
- **Datei:** eine Markdown-Datei pro Liste in der obersten Ordnerebene wie eine Aufgabe, erkennbar an `kind: list`. Beim Anlegen werden zusätzlich `status: open` und `inbox: false` geschrieben, damit ältere App-Stände eine Liste höchstens unter „Alle offenen“ zeigen und nicht im Eingang. Felder beim Anlegen: `id`, `format_version`, `title`, `kind`, `status`, `inbox`, `dateCreated`, `dateModified`. Journal, Konfliktprüfung, Papierkorb, Undo und formaterhaltendes Schreiben gelten unverändert (7.2–7.4).
- **Einträge** sind Markdown-Checklistenelemente (`- [ ] Milch`). Neue Einträge werden hinter dem letzten Eintrag der obersten Ebene eingefügt. Anderer Inhalt im Body (Notizen, Überschriften) bleibt byte-genau erhalten und ist über „Als Markdown bearbeiten“ erreichbar; die Listenansicht weist darauf hin. Verschachtelte Einträge werden eingerückt angezeigt und bewegen sich mit ihrem Obereintrag.
- **Ansichten:** Listen erscheinen nicht in Eingang, Heute, Alle offenen oder Erledigt, unabhängig vom Status. Die Ansicht „Listen“ zeigt alle Listen, zuletzt geänderte zuerst, mit Fortschritt „abgehakt/gesamt“. Die Suche findet Listen (auch ohne „inkl. erledigt“) und öffnet die Listenansicht. Probleme und Konflikte gelten wie bei Aufgaben.
- **Geöffnete Liste:** offene Einträge oben. Abgehakte Einträge stehen durchgestrichen im einklappbaren Bereich „Abgehakt (n)“. Neue Einträge: Desktop über die Eingabezeile unter den offenen Einträgen, Android über den Plus-Knopf, der das Eingabeblatt der Erfassung (ohne Chips) öffnet; beide bleiben nach jedem Eintrag offen. Auch „Neue Liste“ nutzt am Handy dieses Blatt. Antippen des Kreises hakt ab oder wieder auf, mit demselben Ablauf wie bei Aufgaben (Haken sofort, kurze Haltezeit, dann gleitet der Eintrag in seinen Bereich und die übrigen rücken nach); ein Erfolg wird nicht gemeldet. Antippen des Texts bearbeitet ihn; ein geleerter Text löscht den Eintrag. Offene Einträge der obersten Ebene lassen sich am Griff verschieben.
- **Aktionen der Liste:** Umbenennen, „Abgehakte entfernen“, „Alle Haken zurücksetzen“, „Als Markdown bearbeiten“, „Liste löschen“ (Papierkorb). Jede Eintragsaktion ist ein eigener Schreibvorgang mit Undo; sie trägt den angezeigten Eintragstext mit. Steht in der Zeile inzwischen etwas anderes, wird nichts geschrieben (Meldung „Die Liste hat sich inzwischen geändert“).
- **Bedienung:** Desktop: Seitenleiste „Listen“, Ctrl+5, Escape führt von der Liste zur Übersicht zurück. Android: „⋯ Mehr → Listen“ (seit 28.10.2026, vorher fünfter Reiter, 4.5), Plus-Button legt eine Liste an, ⋮ in der Kopfzeile der Liste für die Listenaktionen, langes Drücken auf einen Eintrag für Bearbeiten/Löschen.
- **Nicht vorgesehen:** Liste abschließen, Liste duplizieren, „Neue Liste“ in der App-Verknüpfung, Termine an Listen.

### 4.7 Müllabfuhr [F]/[V]

Entscheidungen vom 28.10.2026 (`.fragen/2026-10-28-1849-muellabfuhr.md`) [F]; Umsetzung [V].

- **Zweck:** Die Abholtermine kommen einmal im Jahr als ICS-Datei. Jeder Abholtag soll an diesem Tag fällig sein und eine Woche vorher als geplant in Heute stehen, damit man sich rechtzeitig darum kümmert.
- **Modell [F]:** je Abfuhrart eine Aufgabe mit einer Serie aus fester Terminliste (5.7): Kalenderart, Bezugsfeld `due`, `recurrence_offset_days: -7` (Vorlauf), also `scheduled` = Abholtag − 7. Dazu `inbox: false`, `priority: none` und das Kennzeichen `waste_type`. Ein Abholtag ist ein Vorkommen. Abhaken erledigt das Vorkommen, danach rückt der nächste Termin nach. Ein verstrichener, nicht abgehakter Termin bleibt überfällig (5.2); wird er später abgehakt, springt die Serie auf den nächsten Termin nach dem Aktionstag.
- **In den normalen Ansichten** verhalten sich Müllabfuhr-Serien wie jede Serie: am Abholtag unter Fällig (mit „geplant …“ als Zusatz), in den sieben Tagen davor unter Geplant, am ersten Tag als „Heute eingeplant“, danach als „Früher eingeplant“. Je Abfuhrart steht nur das aktuelle Vorkommen in Heute und Alle offenen; Erledigt zeigt die Abholungen unter „Erledigte Vorkommen“. Suche, Filter („Wiederholung: Kalender“) und Probleme gelten unverändert. Die Zeile trägt ein kleines Tonnensymbol.
- **Übersicht „Müllabfuhr“:** eine Zeile je Abfuhrart mit Titel, nächstem Termin („Fr 13.11.“) und Zahl der restlichen Termine, nach dem nächsten Termin sortiert. Arten ohne weiteren Termin stehen unten mit „Keine Termine mehr“; am Desktop mit dem Hinweis auf den Import. Ohne Müllabfuhr-Serie zeigt der Desktop einen leeren Zustand mit dem Importknopf.
- **Ansicht einer Abfuhrart:**
  - Oben das aktuelle Vorkommen als normale Aufgabenzeile: abhaken, wischen, Detail öffnen.
  - Darunter „Weitere Termine“: die kommenden Daten der Terminliste, übersprungene durchgestrichen. Am Desktop über ⋮ an der Zeile, am Handy per langem Drücken: „Überspringen“ bzw. „Nicht mehr überspringen“ (Ausnahme, 5.4).
  - Darunter einklappbar „Vergangene Termine“, je Datum erledigt, übersprungen oder versäumt (5.5).
  - Das Detail ist das normale Seriendetail. Statt einer Regel steht dort „Feste Termine aus dem Kalender: noch n, bis Sa 19.12.2026“. Der Vorlauf ist als Abstand änderbar (5.3).
- **Navigation:** Desktop: Seitenleiste „Müllabfuhr“ unter „Listen“, immer sichtbar, Ctrl+6. Ein Klick auf eine Abfuhrart öffnet ihre Ansicht, Escape führt zur Übersicht zurück. Android: ⋯ Mehr → Müllabfuhr (4.5), von der Übersicht weiter zur Abfuhrart.
- **Import, nur Desktop [F]:**
  1. „Kalender importieren …“ in der Müllabfuhr-Übersicht öffnet die Dateiauswahl für `.ics`-Dateien.
  2. Die Datei wird eingelesen (siehe unten) und nach Abfuhrart gruppiert.
  3. Eine Vorschau zeigt je Abfuhrart einen Haken (übernehmen ja/nein), den Namen, Zahl und Zeitraum der Termine und die Wirkung: „neu, 5 Termine“, „+26 Termine“, „1 Termin verlegt“, „wird fortgesetzt“, „keine Änderung“ oder „nur vergangene Termine“.
  4. „Übernehmen“ schreibt je Abfuhrart eine Datei. Danach meldet die App „Kalender importiert: 4 Abfuhrarten, 10 Termine“. Die Meldung gilt als Hinweis nach 4.4, weil mehrere Dateien betroffen sind.
- **Vorschau im Einzelnen:**
  - **Name:** Ist die Abfuhrart bekannt, steht dort der Titel der bestehenden Serie. Sonst schlägt die App den Abfuhrart-Schlüssel ohne die Behältergröße am Ende vor (`80 l`, `120 l`), z. B. „Bioabfallbehaelter“; der Name ist frei änderbar, etwa zu „Biotonne“. Er wird zum Titel, `waste_type` behält den Schlüssel. Im folgenden Jahr ist der Name damit schon richtig.
  - **Zuordnen:** Eine unbekannte Abfuhrart kann statt „neu anlegen“ einer bestehenden Müllabfuhr-Serie zugeordnet werden, z. B. wenn sich die Behältergröße geändert hat. Deren `waste_type` wird dann auf den neuen Schlüssel gesetzt.
  - **Vorlauf:** ein Feld „Geplant … Tage vorher“, Standard 7. Es gilt für neu angelegte Arten; bestehende behalten ihren Abstand.
- **ICS einlesen [V]:**
  - Zeilen nach RFC 5545 entfalten (CRLF und LF), Escapes `\,` `\;` `\n` `\\` auflösen, Parameter wie `LANGUAGE=de` ignorieren.
  - Ausgewertet werden nur `VEVENT`s mit `DTSTART` und `SUMMARY`; `STATUS:CANCELLED` wird ausgelassen. `DTSTART;VALUE=DATE` ergibt den Tag. Ein Wert mit Uhrzeit (mit `TZID`, mit `Z` oder floating) ergibt das lokale Datum dieses Zeitpunkts in der Gerätezone (3.3); die Uhrzeit wird nicht übernommen.
  - `VEVENT`s mit `RRULE` oder `RDATE` werden in v1 nicht ausgewertet und in der Vorschau als „nicht übernommen“ gezählt.
  - **Abfuhrart-Schlüssel** = `SUMMARY` getrimmt, Leerraum zu einem Leerzeichen zusammengefasst. Verglichen wird ohne Groß-/Kleinschreibung. Gleiche Art am gleichen Tag zählt einmal.
  - `UID` wird nicht verwendet: Die vorliegende Datei vergibt sie bei jedem Herunterladen neu (`<Zeitstempel>-<n>@…`). `LOCATION` (Adresse) wird nicht übernommen.
  - Form der vorliegenden Datei (Stand 28.10.2026): ganztägige Termine (`DTSTART;VALUE=DATE`), ein `VEVENT` je Abholtag, vier Abfuhrarten (`Bioabfallbehaelter  80 l`, `Restabfallbehaelter  120 l`, `Leichtverpackungen  110 l`, `Papierbehaelter  240 l`), Umlaute als ae/oe/ue, doppelte Leerzeichen vor der Größe. Die Datei enthält nur Termine ab dem Tag des Herunterladens. Die Abstände sind unregelmäßig (Feiertagsverschiebungen, Bioabfall auch mittwochs, Leichtverpackungen auch samstags); eine RRULE könnte sie nicht abbilden.
- **Abgleich beim Übernehmen [V],** je Abfuhrart als ein Schreibvorgang:
  - **Neue Art:** Datei anlegen, Dateiname aus dem Namen nach F002. K ist der erste Termin ab dem Importtag; frühere Termine kommen mit in die Liste. Gibt es keinen Termin ab dem Importtag, wird nichts angelegt. Als Notiz übernimmt die App die `DESCRIPTION` der Termine (bei der vorliegenden Datei der Bereitstellhinweis „am Abfuhrtag um 7.00 Uhr“), wenn sie bei allen Terminen dieser Art gleich ist; sonst bleibt der Body leer.
  - **Bekannte Art:** neue Daten in `recurrence_dates` einfügen. Daten der Liste, die nach dem Importtag liegen, weder erledigt noch übersprungen sind, im Zeitraum der Importdatei liegen (erster bis letzter Termin aller Arten) und in der Datei fehlen, werden entfernt: Der Termin wurde verlegt. [V, Umsetzung 28.10.2026: zuerst war der Zeitraum je Art geplant; dann bliebe ein verlegter erster Termin doppelt stehen.] Vergangene, erledigte und übersprungene Daten bleiben immer. Fällt dabei das aktuelle K weg, wird der nächste ungelöste Termin ab dem alten K das neue K; die Datumsfelder folgen nach 5.3.
  - **Beendete Art** (`status: done`, gleich ob die Terminliste ausgeschöpft ist oder die Serie von Hand beendet wurde, 5.7): Bringt der Import **neue** Termine ab dem Importtag, wird die Serie fortgesetzt, also `status: open`, `completedDate` entfernen und als K den ersten ungelösten Termin ab dem Importtag setzen, in derselben Revision. Derselbe Import ein zweites Mal öffnet eine von Hand beendete Serie damit nicht wieder. Die Vorschau zeigt das als „wird fortgesetzt“; wer eine Abfuhrart nicht mehr hat, nimmt dort den Haken weg.
  - Derselbe Import ein zweites Mal ändert nichts (No-op). Jede geänderte Datei steht als eigener Eintrag im Verlauf und ist einzeln zurücknehmbar (4.4).
  - Vor dem Schreiben prüft der Abgleich wie jede Aktion den Datei-Hash (7.3). Hat sich eine Datei seit der Vorschau geändert, wird diese Art nicht geschrieben und gemeldet; die übrigen werden übernommen.
- **Nicht vorgesehen:** Import am Handy, Kalender-Abo per URL, Erinnerungen, Uhrzeiten, Termine von Hand zur Terminliste hinzufügen, Import beliebiger anderer Kalender als eigene Funktion.

## 5. Wiederholungen

### 5.1 Begriffe, Serienabschnitte und Historie [V]

- **Wiederholungsart** (`recurrence_anchor`): `calendar` = fester Kalenderrhythmus; `completion` = ab tatsächlicher Erledigung. Das Aufgabenfeld `scheduled` bezeichnet unabhängig davon den geplanten Bearbeitungstag.
- **Bezugsfeld** (`recurrence_field`): `due` oder `scheduled`; dieses Feld trägt den Termin des aktuellen Vorkommens.
- **Uhrzeit [F, F005 Stufe 2]:** optional genau eine Uhrzeit aus `recurrence_start`; beim Fortschreiben wird sie ins Bezugsfeld übernommen. Keine mehreren Vorkommen pro Tag.
- **Serienabschnitt:** `recurrence_revision` identifiziert eine unveränderte Regel einschließlich Start, Art und Begrenzung. Die obersten Serienfelder und Historienlisten gehören ausschließlich zu diesem aktiven Abschnitt.
- **Vorkommensschlüssel K:** reguläres Datum innerhalb eines Abschnitts, auch bei Serien mit Uhrzeit. Die vollständige fachliche Identität ist `(Aufgaben-id, recurrence_revision, K)`. Einzelverschieben der angezeigten Frist ändert K nicht. Dasselbe Datum in zwei verschiedenen Abschnitten bezeichnet zwei verschiedene Vorkommen.
- **C und S:** Mengen der erledigten bzw. übersprungenen Schlüssel im aktiven Abschnitt. Reihenfolge und Duplikate sind bedeutungslos. Steht K in beiden Listen, wird es als erledigt angezeigt, aber die widersprüchliche Auflösung muss vor weiteren Serienaktionen geklärt werden. Zukünftige Einträge in S sind Ausnahmen.
- **Vergleichsbasis:** Regeltermine werden nach Kalendertagen verglichen; Uhrzeiten bestimmen die Frist und gegebenenfalls die UNTIL-Grenze. Aktionen erhalten einen einmal festgehaltenen Aktionstag und -zeitpunkt; Wiederholungsversuche lesen nicht erneut „jetzt“ als neue Erledigung.

**Archiv in derselben Datei:** `recurrence_archive` enthält pro früherem Abschnitt einen Snapshot mit `recurrence_revision`, `recurrence`, `recurrence_start`, `recurrence_anchor`, `recurrence_field`, optional `recurrence_offset_days`, `recurrence_instance`, `complete_instances` (C), `skipped_instances` (S), `status`, gegebenenfalls `due`, `scheduled`, `completedDate` und `last_completed_at`. Zusätzlich hält `closed_reason` (`rule-change`, `removed`) den Anlass fest. Es gibt keine verschachtelten Archive. Reihenfolge ist fachlich bedeutungslos, Revisionen sind eindeutig; zwei abweichende Snapshots derselben Revision sind ein Konflikt. Historien bleiben Datumsmengen ohne Erledigungszeit je Vorkommen [F, F006]. Archivfelder und unbekannte Inhalte innerhalb eines Snapshots bleiben erhalten.

**Neuer Abschnitt bei Regeländerung [F/V]:** Eine Änderung von Regel, Start, Serienuhrzeit, Art, COUNT oder UNTIL archiviert den alten Abschnitt vollständig und erzeugt eine neue Revision. Die neue Zählung beginnt mit dem in der Vorschau bestätigten ersten Vorkommen; alte C/S-Einträge und `last_completed_at` werden nicht übernommen. Künftige Ausnahmen des alten Abschnitts bleiben im Archiv und werden nur nach ausdrücklicher Auswahl in den neuen übernommen. Änderungen nur an Titel, Notiz, Priorität, Eingang, Abstand, Bezugsfeld oder am verschobenen Einzeltermin starten keine neue Zählung. Eine semantisch unveränderte Regel erneut zu speichern startet ebenfalls keinen Abschnitt.

Die ausdrückliche Editoraktion **„Ab jetzt noch N-mal“** beginnt dagegen auch dann einen neuen Abschnitt, wenn vorher schon dasselbe COUNT gespeichert war. Beispiel: vorher COUNT=5 und zwei Erledigungen, erneut „ab jetzt noch fünfmal“ = fünf neue, nicht drei verbleibende. Bei einem neuen Abschnitt nach Änderung liegt der erste Termin frühestens am Änderungstag; der gewählte spätere Start ist zulässig. Der neue Abschnitt ist offen, `completedDate` wird entfernt; ein alter `in-progress`-Zustand wird nicht übernommen. Bestehende Checklisten werden bei der Regeländerung nicht ungefragt zurückgesetzt; die Vorschau bietet das ausdrücklich an.

Damit gilt: **„noch fünfmal“ = fünf weitere Vorkommen des neuen Abschnitts, bisherige Historie bleibt sichtbar und zählt nicht mit.** Die bisherige Unterscheidung bei COUNT bleibt bestehen: Kalender zählt Regeltermine, Completion zählt Erledigungen (5.2). Externes Ändern einer bestehenden Regel mit neuem Zählbeginn muss dieselbe Abschnittsstruktur einhalten; aus einem überschriebenen RRULE-Text allein kann die App keine gelöschte alte Regel oder Historie rekonstruieren.

### 5.2 Berechnung und stabiles Einlesen

`aufgelöst(K)` ⇔ K ∈ C ∪ S, jeweils **nur im aktiven Abschnitt**.

`vorkommen(regel, start)` bezeichnet eine begrenzt ausgewertete Folge im floating-Modus, keine vollständige Materialisierung einer unendlichen Regel. Alle Aufrufe unterliegen den Grenzen aus Abschnitt 6.

**Lesen einer konsistenten Datei:**
1. `status: done` bleibt beendet; keine automatische Wiederöffnung oder Erledigung.
2. Bei einer offenen Serie ist `recurrence_instance` maßgeblich. Fehlt es, wird der dokumentierte, ausschließlich dateibasierte Lese-Standard aus 3.2 verwendet. Fehlt auch eine eindeutige Grundlage, erscheint eine Diagnose.
3. Ist K nicht aufgelöst, bleibt es unabhängig vom Lesetag aktuell. Eine überfällige offene Aufgabe wird nicht durch bloßes Öffnen, Aktualisieren oder Mitternacht weitergeschaltet.

**Inkonsistente Fremdbearbeitung: K steht bereits in C oder S, aber die Datei ist noch offen:**
- Bei `calendar` wird als konservative Vorschau das erste nicht aufgelöste Regelvorkommen **nach K** berechnet. Der Lesetag und `dateModified` sind keine Fortschreibungsbasis. Ein solcher Folgetermin darf weiterhin überfällig sein. Ist die Regel erschöpft, lautet die Diagnose „Serienende noch nicht übernommen“.
- Bei `completion` ist aus Datumslisten allein nicht sicher erkennbar, welche Erledigung oder welcher Skip die stehen gebliebene Frist auflösen sollte. Keine automatische Neuberechnung aus einem möglicherweise älteren `last_completed_at`. Die Aufgabe bleibt in Alle offenen und Probleme als „Fortschreibung klären“ sichtbar; der bereits aufgelöste alte Termin wird nicht als offene Frist gezählt.
- Diese Zustände schreiben nichts und sperren Erledigen, Überspringen und Fortschreiben. Die Aufgabe erscheint unter Probleme mit dem berechneten Vorschlag bzw. dem Hinweis „Fortschreibung klären“. In v1 stehen dafür nur „Regel bearbeiten“ (erzeugt nach 5.1 einen neuen Abschnitt) und „Wiederholung entfernen“ zur Verfügung; eine unabhängige Titeländerung repariert nicht nebenbei die Serie. Ein eigener Reparaturdialog „Fortschreibung übernehmen/klären“ ist **nach 1.0**. Bei unklarer Checklistenhistorie wird nichts zurückgesetzt.
- Beispiel: K = Mo 05.10.2026 ist erledigt, die nächste offene Kalenderinstanz ist Mo 12.10. Dieselbe Datei zeigt am 08.10. und am 20.10. denselben Korrekturvorschlag 12.10.; am 20.10. ist dieser Vorschlag überfällig, nicht heimlich auf 26.10. verschoben.

**Fortschreiben bei einer neuen Nutzeraktion auf das aktuelle K:**
- **calendar:** erstes Regelvorkommen ab `recurrence_start` mit Datum `o > max(K, Aktionstag)` und `o ∉ C ∪ S`. Der Rhythmus bleibt fest. Dazwischen verstrichene Termine werden nicht automatisch in C oder S eingetragen. Ein regulärer Termin am Tag einer verspäteten Erledigung ist damit abgedeckt.
- **completion, Erledigen:** B ist der Kalendertag der **neuen** tatsächlichen Erledigung, so wie er mit Offset in `last_completed_at` gespeichert wird; er wird beim Lesen auf einem Gerät in anderer Zone nicht neu datiert. Mit der Serienuhrzeit aus `recurrence_start` wird die Regel ab B ausgewertet. Gesucht ist das erste `o > B`, das **weder in C noch in S** steht. **Regeln ohne BY-Teile** (die Formularoptionen „n Tage/Wochen/Monate/Jahre nach Erledigung“) zählen als fester Abstand ab B mit Klemmen ans Monatsende, jeder Kandidat von B aus gerechnet: 31.10. + 1 Monat = 30.11., + 2 Monate = 31.12.; 29.02. + 1 Jahr = 28.02. Regeln mit BY-Teilen werden mit rrule ab B ausgewertet [F, Fragen-Tool 23.10.2026].
- **completion, Überspringen:** B = `max(K, Aktionstag)`; dieselbe Suche ohne Änderung von `last_completed_at`. Der berechnete neue aktuelle Schlüssel wird gespeichert, spätere Leser verwenden diesen gespeicherten Zustand.
- **Kollision bei sehr früher Erledigung [V]:** Bereits aufgelöste Datumsschlüssel werden in derselben Revision nicht wiederverwendet. Beispiel: wöchentlich, K = 19.10., erledigt am 12.10. → Kandidat 19.10. steht nun in C, daher nächster freier Kandidat **26.10.**. Die UI erklärt vor dem Abschluss diese Ausnahme vom einfachen Abstand. Ein früherer, noch freier Kandidat ist bei Completion zulässig; deshalb darf die zeitliche Reihenfolge der tatsächlichen Aktionen nicht aus dem größten Historien-Datum abgeleitet werden.
- **Kein weiteres Vorkommen nachweisbar:** nur bei regulärer Erschöpfung, nicht bei Berechnungsabbruch, `status: done`, `completedDate` = festgehaltener Aktionszeitpunkt; `recurrence_instance` bleibt als letzter Schlüssel stehen. Ein Timeout oder ungültige Regel beendet niemals automatisch eine Serie.

**Begrenzungen:**

| Fall | Bedeutung |
|---|---|
| `calendar`, `COUNT=N` | N erzeugte Regeltermine ab dem Start des **aktiven** Abschnitts einschließlich des ersten Termins. Übersprungene oder versäumte Slots verlängern diesen Kalender nicht. |
| `completion`, `COUNT=N` | Höchstens N eindeutige Erledigungen im aktiven C. COUNT wird vor der Bibliotheksberechnung entfernt und separat geprüft; nicht mit jedem neuen B zurückgesetzt. Skips zählen nicht als Erledigung. |
| `UNTIL` | Inklusive Grenze. Bei reinen Datumsserien ein Datum; bei Serien mit Uhrzeit normalisierte lokale Datumszeit. Eine im Formular gewählte Enddatum-Grenze schließt den Termin dieses Tages ein. Inkompatible externe Werttypen müssen ausdrücklich korrigiert werden. |
| COUNT und UNTIL gemeinsam | Ungültig; nicht still auf eine der Grenzen reduzieren. |
| `COUNT=1` | Das erste aktuelle Vorkommen ist vorhanden. Bei Kalender endet die Serie nach dessen Auflösung; bei Completion nach dessen Erledigung, beim Skip bleibt eine Erledigung übrig. |
| Geändertes COUNT | Neue Revision; „noch fünfmal“ beginnt bei null erledigten bzw. null vergangenen Regelterminen dieses neuen Abschnitts. |

**Beispiel:** Vorkommen Mo 05.10.2026, erledigt am Do 08.10.2026: `calendar`, `FREQ=WEEKLY;BYDAY=MO` → Mo 12.10.; `completion`, `FREQ=WEEKLY` → Do 15.10.

### 5.3 Fortschreiben der Datumsfelder [V]

1. Das Bezugsfeld erhält den neuen Schlüssel und gegebenenfalls die Uhrzeit aus `recurrence_start`.
2. Ist das andere Datumsfeld gesetzt, wird sein Abstand übernommen: ausdrücklich gespeichertes `recurrence_offset_days`, sonst Differenz der Datumsanteile beider aktuellen Felder. Die Uhrzeit des anderen Felds bleibt erhalten.
3. Ein nicht gesetztes anderes Feld bleibt leer, auch wenn ein alter Abstand gespeichert ist. Ungültige beteiligte Datumswerte müssen vor dem Fortschreiben korrigiert werden; sie sind keine Grundlage für eine implizite Berechnung.

Beim Festlegen eines Abstands im Wiederholungseditor wird er ausdrücklich gespeichert. **Vor dem ersten Einzelverschieben einer Serie mit zwei Terminen** wird ein bisher nur abgeleiteter Abstand aus den unverschobenen Werten festgehalten. Sonst könnte ein angeblich einzelnes Verschieben unabsichtlich alle Folgetermine verändern. Wechsel des Bezugsfelds verwendet denselben regulären Schlüssel, eine Vorschau und einen ausdrücklich neu bestimmten Abstand; eine verschobene Frist wird dabei nicht zur neuen Identität.

### 5.4 Aktionen, Vorbedingungen und Wiederholungsversuche [V]

Eine Serienaktion trägt Aufgaben-ID, Revision, K, den gelesenen Regel-/Zustandskontext und ihren einmal festgehaltenen Zeitpunkt. Dateizustand und Vorbedingungen werden vor dem Schreiben erneut geprüft. Eine reine Schlüsselbindung allein beweist keine Idempotenz und keine Konfliktfreiheit (7.3).

| Aktion | Wirkung und Vorbedingungen |
|---|---|
| **Serie anlegen** | Ersten passenden Termin auswählen, neue Revision mit leerem C/S und ohne `last_completed_at`; `recurrence_start` und `recurrence_instance` auf diesen Termin setzen. Bezugsfeld und Abstand in der Vorschau prüfen, `inbox` unverändert. Der erste Termin wird auch bei Completion direkt verwendet, nicht nochmals um ein Intervall verschoben. |
| **Vorkommen erledigen (K)** | Nur das aktuelle, offene, ungelöste K derselben Revision. K → C; tatsächlichen Zeitpunkt setzen; nach 5.2 fortschreiben. **K bereits in C: immer keine Änderung und kein Schreiben**, auch beim letzten Vorkommen und bei `status: done`. K in S bedeutet widersprechende Aktion, kein stilles Entfernen aus S. |
| **Überspringen (K)** | Nur das aktuelle, offene, ungelöste K derselben Revision. K → S; nach 5.2 fortschreiben, `last_completed_at` unverändert. **K bereits in S: keine Änderung und kein Schreiben.** K in C bedeutet Konflikt, keine Rücknahme der Erledigung. |
| **Vorzeitig / verspätet erledigen** | Gleiche Aktion; für Kalender gelten der feste Rhythmus und für Completion die Kollisionsregel aus 5.2. Die Vorschau zeigt den tatsächlichen Folgetermin. |
| **Ausnahme hinzufügen/entfernen** | Ein zukünftiges K derselben Revision ausdrücklich in S aufnehmen bzw. daraus entfernen; gleicher Zielzustand = kein Schreiben. Das aktuelle K wird mit „Überspringen“ bearbeitet. Eine Ausnahme auf einem erledigten K ist ein Konflikt. |
| **Einzelnes Vorkommen verschieben** | Nur Datumsfelder ändern, K und Revision bleiben gleich; Abstand nach 5.3 sichern. Die UI kennzeichnet den regulären Termin. Das Entfernen des Bezugsdatums ist bei laufender Serie gesperrt; stattdessen Bezugsfeld wechseln oder Wiederholung entfernen. |
| **Regel / Start / Art / Grenze ändern** | Alten Abschnitt archivieren, neue Revision und leere aktive Historie. Für beide Arten ersten passenden Termin ab dem im Editor gewählten Start bestimmen; Standard heute, bei Änderung nicht davor. Zustand und ausdrücklicher Zählungsneustart nach 5.1. Alte `last_completed_at`-Basis wird nicht übernommen. Vorschau zeigt den neuen Zählbeginn, die nächsten maximal 10 Termine und einen dadurch abgelösten überfälligen Alttermin. Dieser wird nicht als erledigt/übersprungen erfunden. |
| **Nur Abstand / Bezugsfeld ändern** | Kein neuer Abschnitt, kein COUNT-Neustart. Datumsfelder zum aktuellen K nach 5.3 neu berechnen; Einzelverschiebungen in der Vorschau sichtbar auflösen. |
| **Serie beenden** | „Aktuelles erledigen und Serie beenden“ oder „Serie ohne Erledigung beenden“. Beide Varianten binden an das angezeigte K; ist es inzwischen fortgeschrieben, Konflikt statt Beenden des neuen Vorkommens. Regel, K und Historie bleiben; `status: done`, `completedDate`. Keine Checklistenrücksetzung, wenn es kein neues offenes Vorkommen gibt. Wiederholung derselben Beenden-Aktion ändert auch die Zeitstempel nicht. |
| **Beendete Serie wiederöffnen** | Ohne neuen Abschnitt: ungelöstes gespeichertes K wieder öffnen, auch wenn überfällig. Ist K aufgelöst, nur einen aus dem gespeicherten Zustand eindeutig ermittelbaren zulässigen Folgetermin anbieten. Sind COUNT/UNTIL erschöpft oder ist Completion nicht rekonstruierbar, kein stilles Zurücksetzen: „Serie mit neuer Regel fortsetzen“ führt durch die Vorschau eines neuen Abschnitts. |
| **Wiederholung entfernen** | Aktiven Abschnitt mit `closed_reason: removed` archivieren, aktive Serienfelder/C/S/`last_completed_at` entfernen. Aufgabe wird Einzelaufgabe; Titel, Body, Status, Eingang und angezeigte Datumsfelder bleiben. Das Archiv bleibt sichtbar, löst allein aber keine Wiederholung aus. |
| **Sofortiges Undo** | Nur bei passendem Nachher-Hash: exakten Vorher-Zustand aus dem lokalen Journal wiederherstellen, einschließlich Archiv, Checklisten und Zeitstempeln. Kein neues Fortschreiben. |
| **Späte Historienkorrektur** | **nach 1.0.** In v1 wird die Historie nur angezeigt; Einträge lassen sich extern in der Datei ändern. |
| **Fortschreibung übernehmen/klären** | **nach 1.0.** In v1 gilt die Sperre aus 5.2 mit „Regel bearbeiten“ oder „Wiederholung entfernen“. |

**Schutz vor alten Aktionen:** Veraltete Revision, geänderte Regel, nicht mehr aktuelles ungelöstes K oder inzwischen widersprechender Zustand führen zu Aktualisieren/Konflikt statt automatischem Weiterschalten. Ein No-op verändert weder Datei noch `dateModified`, Checklisten oder Undo-Journal. Strukturänderungen, Reparatur, Historienkorrektur und Undo werden bei geändertem Basis-Hash nicht automatisch wiederholt; bei unklarem Schreibausgang zuerst Journal prüfen. Eine alte Aktion nach einem bewussten Undo darf nicht erneut als neue Erledigung abgespielt werden.

**Synchronisation:** Gleiche Revision und gleicher erledigter Schlüssel werden nur einmal gezählt. Unterschiedliche Regeln, Completion-Basen oder gegensätzliche Erledigen/Skip-Aktionen werden nicht durch pauschale Mengenvereinigung aufgelöst. Die Regeln aus 7.4 gelten auch dann, wenn beide Varianten dieselbe Aufgaben-ID haben.

### 5.5 Historienanzeige [F]/[V]

- Aktiver Abschnitt und archivierte Abschnitte werden gemeinsam, mit ihrer jeweiligen Regel und Abschnittszuordnung angezeigt. Datumslisten bleiben erhalten; ein Datum in verschiedenen Revisionen wird nicht versehentlich dedupliziert.
- **Kein Erledigungszeitpunkt je Vorkommen [F, F006]:** angezeigt wird „Vorkommen Fr 02.10.2026 – erledigt“. `last_completed_at` beschreibt nur die letzte Erledigung eines Abschnitts, keine lückenlose Ereignisgeschichte.
- „Erledigte Vorkommen (letzte 30 Tage)“ bezieht sich auf das reguläre Vorkommensdatum, nicht auf einen unbekannten tatsächlichen Erledigungstag.
- „Versäumt“ lässt sich nur bei Kalenderabschnitten mit bekanntem Regelraster und bekannter Fortschreibung ableiten. Der aktuell offene überfällige Termin heißt „offen / überfällig“, nicht „versäumt“. Bei Completion und unvollständiger Fremdhistorie werden keine angeblich vergangenen Solltermine erfunden; nach Regelwechsel bleibt die alte Historie mit der damaligen Regel verknüpft.

### 5.6 Checklisten bei Serien [V – vorgeschlagenes Verhalten]

- Nur beim erfolgreichen Wechsel zu einem neuen offenen Vorkommen wird in echten Markdown-Checklistenelementen das `x`/`X` durch ein Leerzeichen ersetzt. Markdown-Token und Quellbereiche bestimmen die Stellen; ein Regex allein reicht wegen eingerückter Code-Blöcke und verschachtelter Listen nicht. Fenced und eingerückte Code-Blöcke bleiben unverändert. Am Serienende, bei No-op, Konflikt oder bloßem Lesen kein Reset.
- Das sofortige Undo stellt den vorherigen Zustand exakt wieder her (4.4).
- Einzelaufgaben setzen nichts zurück.
- Ein Klick auf eine Checkbox in der Vorschau ändert genau ein Zeichen in der Quellzeile.

### 5.7 Serien mit fester Terminliste [V]

Neue Serienform vom 28.10.2026 für die Müllabfuhr (4.7). Sie folgt der Kalenderart; abweichend ist nur, woher die Termine kommen.

- **Form:** `recurrence_dates` statt `recurrence`, eine Liste reiner Daten. Reihenfolge und Duplikate sind beim Lesen bedeutungslos; die App schreibt die Liste aufsteigend und ohne Duplikate. Die Vorkommen sind genau diese Daten. `recurrence_anchor` ist immer `calendar`; `completion` ist ungültig (Probleme). `recurrence_start` wird beim Anlegen auf den ersten Listentermin gesetzt (fehlt er, ergänzt ihn die erste Serienaktion so, Entscheidung 23.10.2026). Für die Berechnung spielt er keine Rolle und wird beim Ergänzen von Terminen nicht angepasst. Keine Serienuhrzeit.
- **K, C, S, Revision, Archiv und stabiles Einlesen** wie bei Kalenderserien (5.1, 5.2). Ein K, das nicht in der Liste steht, ist eine Diagnose unter Probleme, keine stille Reparatur.
- **Fortschreiben:** erster Listentermin `o > max(K, Aktionstag)` mit `o ∉ C ∪ S`. Gibt es keinen, endet die Serie regulär (`status: done`, `completedDate`, K bleibt; 5.2). Das ist der Normalfall am Jahresende.
- **Abweichungen von 5.1 und 5.4:**
  - Neue Termine anfügen oder künftige, ungelöste Termine entfernen (nur der Import, 4.7) startet **keinen** neuen Abschnitt. Eine Terminliste hat weder Raster noch Zählung, und die Schlüssel bleiben eindeutige Daten; die Historie bleibt so über die Jahre ein durchgehender Abschnitt.
  - Eine beendete Serie (ausgeschöpft oder von Hand beendet) setzt der Import in derselben Revision fort, anders als „Beendete Serie wiederöffnen“, das bei Erschöpfung einen neuen Abschnitt verlangt.
- **Editor und Aktionen:** Der Wiederholungseditor zeigt die kommenden Termine, ihre Anzahl und den letzten Termin. Möglich sind Abstand ändern, Bezugsfeld wechseln, Ausnahmen, Einzelverschieben, Vorkommen erledigen oder überspringen, Serie beenden und Wiederholung entfernen. Nicht möglich sind „Regel bearbeiten“ (kein Umwandeln in eine RRULE und zurück) und Termine von Hand hinzufügen.
- **Wiederholung entfernen:** Der Archiv-Snapshot (5.1) enthält `recurrence_dates` statt `recurrence`.
- **Beschreibung:** „an festen Terminen (noch n, bis Sa 19.12.2026)“; im Filter zählt die Form als „Kalender“.
- **Umfang:** Die Liste wächst je Art um rund 15–30 Daten im Jahr. In v1 kürzt die App sie nicht automatisch.
- **Formatversion:** Dateien mit `recurrence_dates` tragen `format_version: 2` (3.2).

Beispiel (Restabfall, angelegt beim Import am 28.10.2026):

```markdown
---
id: 01KAB3M6Q4X0V2N8R5T7W9Y1ZC
format_version: 2
title: Restmüll
status: open
priority: none
inbox: false
due: 2026-11-13
scheduled: 2026-11-06
recurrence_dates:
  - 2026-11-13
  - 2026-12-11
recurrence_revision: 01KAB3M6Q4Y6D8F0H2J4K6M8NP
recurrence_start: 2026-11-13
recurrence_anchor: calendar
recurrence_field: due
recurrence_offset_days: -7
recurrence_instance: 2026-11-13
waste_type: Restabfallbehaelter 120 l
dateCreated: 2026-10-28T19:10:00+01:00
dateModified: 2026-10-28T19:10:00+01:00
---
Stellen Sie bitte die Muellsammelgefaesse am Abfuhrtag um 7.00 Uhr … zur Entleerung bereit.
```

## 6. Unterstützter Wiederholungsumfang

**Einfache Optionen** (Formular, mit deutscher Beschreibung, z. B. „jeden 2. Dienstag im Monat“):
- täglich, alle n Tage
- werktags (Mo–Fr)
- wöchentlich an einem oder mehreren Wochentagen, alle n Wochen
- monatlich: am Tag X (1–31), am letzten Tag, am n-ten oder letzten bestimmten Wochentag (1.–4., letzter), alle n Monate
- jährlich am Datum, alle n Jahre
- Ende: nie / am Datum (UNTIL) / nach n Kalenderterminen bzw. n Erledigungen (COUNT, je nach Art; 5.2). Bei Änderung ausdrücklich „ab dieser Änderung“, alte Historie bleibt.
- Art: Kalender / ab Erledigung („n Tage, Wochen, Monate nach Erledigung“; Monate und Jahre mit Klemmen ans Monatsende, 5.2)
- Bezugsfeld, Abstand, Ausnahmen

**Monatsende und Schaltjahr:** Wer beim Monats- oder Jahrestag 29, 30 oder 31 wählt, wird im Formular ausdrücklich gefragt:
- „Monate ohne diesen Tag auslassen“ (RFC-Verhalten, `BYMONTHDAY=31`) oder
- „stattdessen am letzten Tag des Monats“:
  - `BYMONTHDAY=-1` für den 31.;
  - `BYMONTHDAY=28,29,30;BYSETPOS=-1` für den 30.;
  - für den 29.02.: `BYMONTH=2;BYMONTHDAY=-1` (ergibt den 28.02. bzw. 29.02. im Schaltjahr) statt „nur in Schaltjahren“.

Alles lässt sich mit Standard-RRULE ausdrücken und wird pro Serie entschieden.

**Erweiterte Regeleingabe** (validiertes Textfeld mit Live-Vorschau der nächsten 10 Termine). Unterstützte RRULE-Teile:
- `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`, `INTERVAL`, `COUNT`, `UNTIL` (Datum oder lokale Datumszeit)
- `BYDAY` mit Ordinalen (±1…±53 je nach FREQ), `BYMONTHDAY` (±1…31), `BYMONTH`, `BYYEARDAY`, `BYWEEKNO`, `BYSETPOS`, `WKST`
- Uhrzeit nur über `recurrence_start`, nicht über Regelteile

**Validierung und begrenzte Berechnung [V]:** Neben der Positivliste werden Wertebereiche, doppelte Tokens, Kombinationen von FREQ und BY-Teilen, positive INTERVAL/COUNT-Werte, COUNT/UNTIL-Ausschluss und Datumstypen geprüft. Die Vorschau zeigt maximal 10 Termine; keine unbeschränkte `.all()`-Abfrage. Berechnung läuft außerhalb des UI-Threads in einem abbrechbaren Worker bzw. einem entsprechend isolierten nativen Auftrag. Nach spätestens 1 s wird der Auftrag beendet und „Berechnung zu aufwendig“ angezeigt; dies ist nicht gleichbedeutend mit „keine Termine“ und beendet keine Serie. Syntaktisch gültige unmögliche Regeln wie `FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30` werden diagnostiziert. Ein Abbruch oder Parserfehler führt zu keinem Schreiben. Die konkreten Grenzen werden in M0/M3 auf beiden Laufzeiten nachgewiesen.

**Konkrete Grenzen [V, Review 23.10.2026, Nachprüfung 24.10.2026]:**
- `INTERVAL` höchstens 1000, `COUNT` höchstens 10000; größere oder nicht als sichere Ganzzahl darstellbare Werte sind ungültig.
- Zweistufige Suche ab dem Suchbeginn: Stufe 1 mit kurzem Horizont (DAILY 30, WEEKLY 30, MONTHLY 100, YEARLY 400 Jahre) für den Normalfall. Findet sie nichts, Stufe 2 über `400 × INTERVAL` Jahre, höchstens bis 9999. Der Gregorianische Kalender wiederholt sich nach 400 Jahren einschließlich Wochentagen und Schaltjahren; eine Regel, die nach dem Suchbeginn noch einen Termin hat, hat ihn daher innerhalb dieses Fensters. Beispiel: Schalttag am Montag springt über das Nicht-Schaltjahr 2100 von 2072 auf 2112 (40 Jahre).
- Zeitbudget je Abfrage 500 ms für beide Stufen gemeinsam, durchgesetzt auch ohne Treffer über einen Haken im rrule-Patch. Erreicht wird es nur von Regeln, die nie einen Termin erzeugen; dann gilt „Berechnung zu aufwendig“, nie Serienende.
- Die Formularvorschau verwendet für den ersten Termin dieselbe Berechnung wie „Serie anlegen“ (erster Regeltermin ab Start, mit Serienuhrzeit und UNTIL). Lässt sich nach dem ersten Termin der Folgetermin nicht berechnen, wird die Regel mit „Berechnung zu aufwendig“ abgelehnt statt angelegt.
- Kein geschriebenes Datumsfeld liegt nach dem Jahr 9999: weder der Vorkommensschlüssel noch das über den Abstand abgeleitete zweite Feld. Sonst wird die gesamte Aktion mit Hinweis gesperrt.
- rrule.js 2.8.1 wird mit einem versionierten Patch ausgeliefert (`patches/rrule@2.8.1.patch`, CJS- und ESM-Build): Abbruch hinter UNTIL, Zeitbudget-Haken je Zählzeitraum, BYSETPOS-Treffer nach Zeitwert dedupliziert, negative BYSETPOS-Positionen jenseits der Kandidatenliste verworfen. Zusätzlich ignoriert die Engine einen doppelt gelieferten Termin, bevor COUNT zählt.

Für Regeln außerhalb der einfachen Optionen gibt es eine deutsche Beschreibung nur, soweit der eigene Beschreiber sie abdeckt. Sonst werden Rohregel und Terminvorschau angezeigt.

**Ehrlich benannte Einschränkungen:**
- Nicht unterstützt (wird gelesen, angezeigt, aber gesperrt):
  - `FREQ=HOURLY|MINUTELY|SECONDLY`, `BYHOUR`, `BYMINUTE`, `BYSECOND` [F, F005]
  - `RSCALE`/`SKIP` (RFC 7529), `BYEASTER`, `TZID`
  - `RDATE`/`EXRULE`/`EXDATE` innerhalb von `recurrence` (Ausnahmen stehen stattdessen in `skipped_instances`)
  - mehrere Regeln pro Aufgabe
- **DTSTART-Behandlung:** Der Editor setzt den ersten Termin immer auf ein zur Regel passendes Datum; für Fremddateien wird rrule.js-Verhalten ausdrücklich verwendet und ein unpassender Start diagnostiziert. Beim Kalendermodus zählt COUNT nur die erzeugten Regelvorkommen. Die eigene COUNT-Semantik für Completion steht in 5.2 und wird nicht dem Bibliothekszähler überlassen.
- **Unbekannte oder ungültige Regeln:** Der eigene Tokenizer prüft gegen eine Positivliste. Bei Abweichung:
  - Rohtext anzeigen und Hinweis unter Probleme.
  - Erledigen, Überspringen und Fortschreiben sind gesperrt; möglich sind nur „Regel bearbeiten“ und „Wiederholung entfernen“.
  - Die Regel wird nie vereinfacht oder neu geschrieben. Andere Feldänderungen lassen sie byte-genau stehen.

**Uhrzeiten in v1 [F, F005 Stufe 2]:**
- **Enthalten:** optional eine feste Uhrzeit pro Vorkommen (`recurrence_start` mit Uhrzeit), Anzeige z. B. „Fr 16.10., 12:00“. Der Mehraufwand ist gering, vor allem Tests und Darstellung.
- **Nicht enthalten:** mehrere Vorkommen pro Tag (z. B. `BYHOUR=8,20`) sowie stündliche oder minütliche Regeln. Solche Regeln werden gelesen, angezeigt und byte-genau erhalten, aber gesperrt (siehe oben).
- **Spätere Erweiterung:** Mehrere Vorkommen pro Tag benötigen eine neue Formatversion mit anderen Vorkommensschlüsseln und explizitem Verhalten älterer Leser (3.2). Nicht Teil von v1.

## 7. Einlesen, Speichern, Konflikte

### 7.1 Einlesen und Cache-Gültigkeit [F]/[V]

- **Zeitpunkte:** beim Start, Zurückwechseln und manuell; Desktop zusätzlich Watcher-Ereignisse. Eine schnelle Anzeige aus dem Cache ist erlaubt, muss bis zum Abgleich aber als noch nicht geprüft erkennbar sein.
- **Schneller Abgleich:** Metadaten in einer Verzeichnisabfrage holen; hinzugefügte Dateien und solche mit geänderten/fehlenden Metadaten lesen und hashen. `mtime` und Größe sind Hinweise, kein Inhaltsnachweis; beide dürfen bei SAF unbekannt sein. Er läuft beim Zurückwechseln nach höchstens 30 Minuten im Hintergrund. Ein fehlerfrei abgeschlossener schneller Abgleich gilt als Prüfung: Der Hinweis „aus dem Zwischenspeicher“ verschwindet. Restrisiko: Eine externe Änderung mit gleicher mtime **und** Größe fällt erst beim nächsten vollständigen Abgleich auf; Schreiben prüft ohnehin den Hash. [F, `.fragen/2026-10-24-1721-startzeit.md`]
- **Vollständiger Abgleich:** beim Start, beim Zurückwechseln nach mehr als 30 Minuten im Hintergrund und bei ausdrücklichem „Neu einlesen“ werden anschließend **alle** Aufgabendateien in begrenzten Batches gelesen/gehasht, unabhängig von Größe und mtime. Ein Watcher-Überlauf löst dasselbe aus. Ein bereits laufender Scan wird nicht doppelt gestartet. Fortschritt und Abbruch erscheinen, sobald ein Abgleich länger als 1 s läuft; kürzere Abgleiche bleiben unsichtbar. Der Lade-Kreisel von „Ziehen zum Aktualisieren“ erscheint nur beim Ziehen selbst. [F, `.fragen/2026-10-24-1721-startzeit.md`] Auf Android bleibt manuelles Aktualisieren während längerer Vordergrundnutzung der Weg für externe Änderungen. Ein defekter/fehlender Cache ist jederzeit aus den Dateien rekonstruierbar.
- **Fehler sind keine Löschungen:** Nur eine vollständig erfolgreich aufgelistete Ordnerebene darf verschwundene Dateien aus dem Index entfernen. Bei entzogener Berechtigung, nicht erreichbarem Ordner oder Lesefehler bleibt der letzte bekannte Stand als veraltet sichtbar und schreibgeschützt; kein leerer Ordner wird vorgetäuscht.
- **Einlesen schreibt nie [F]:** keine Dateireparatur, ID-Vergabe, Migration oder Serienfortschreibung allein durch Lesen. Auch der vollständige Scan ändert keine Datei.
- **Ungültige Dateien:** Syntaxfehler, doppelte YAML-Schlüssel, Frontmatter ohne Mapping, ungültiges UTF-8 und nicht unterstützte Formatversionen erscheinen verständlich unter Probleme. Bei Syntax-/Formatfehlern keine automatischen Metadatenänderungen. Feldweise ungültige Werte werden nach 3.2/4.2 behandelt; unbekannte Inhalte bleiben erhalten.
- **Externe Änderungen:** Umbenennungen über ID zuordnen, lokale Referenzen aktualisieren. Ohne stabile ID darf die App eine Umbenennung nicht als gesicherte Identität behaupten. Bei geänderter/gelöschter Datei bleiben Editor und lokaler Entwurf erhalten; „Als neue Datei speichern“ bzw. Konfliktdialog anbieten. Die App erzeugt eine extern gelöschte Datei nicht durch Autosave erneut.
- **Ordnergrenze:** Versteckte Einträge und Unterordner nicht einlesen; Papierkorb wird nur über seinen eigenen Adapterbereich gelesen. Desktop-Symlinks werden nicht verfolgt. Vor jedem Schreiben werden Referenz und Zugehörigkeit zum gewählten Ordner erneut geprüft.

### 7.2 Formaterhaltendes Schreiben [F]/[V]

- Frontmatter und Body werden an der schließenden `---`-Zeile getrennt. Erhalten bleiben BOM, Zeilenenden (LF/CRLF) und ein fehlender Abschlusszeilenumbruch.
- **Metadatenänderung = chirurgische Änderung:**
  1. Das Frontmatter wird mit `yaml` 2.x geparst; alle Knoten tragen Quellbereiche.
  2. Für jedes geänderte Feld wird nur der Quelltext genau dieses Schlüssel-Wert-Paars ersetzt (bei Listen inklusive Folgezeilen).
  3. Neue Felder werden vor dem schließenden `---` angehängt; entfernte Felder verlieren nur ihre eigenen Zeilen.
  4. Alle übrigen Bytes, einschließlich unbekannter Felder, Kommentare und Anführungszeichen-Stile, bleiben identisch.
- **Grenzen:**
  - Kommentare **innerhalb** eines geänderten Paares können entfallen.
  - Frontmatter mit YAML-Ankern oder Aliasen, die geänderte Felder betreffen, wird nicht automatisch bearbeitet. Es erscheint ein Hinweis, die Datei extern zu bearbeiten.
- Der Body wird bei Metadatenänderungen byte-genau übernommen. Änderungen am Body gibt es nur über den Editor, das Umschalten einer Checkbox oder das Zurücksetzen von Checklisten [F].
- **Selbstprüfung vor jedem Schreiben:**
  1. Den neuen Text erneut parsen.
  2. Prüfen, dass die gewünschten Werte stimmen, alle anderen Felder gleich sind und der Body unverändert bzw. nur wie vorgesehen geändert ist.
  3. Schlägt eine Prüfung fehl, wird nicht geschrieben und eine Fehlermeldung angezeigt.

### 7.3 Schreiben, Nebenläufigkeit und Wiederherstellung [V]

**Vergleich mit der gelesenen Ausgangsfassung:** Jede Änderung kennt SHA-256-Hash, betroffene Werte und fachliche Vorbedingungen ihrer Basis. Direkt vor dem Schreiben wird erneut gelesen. Bei abweichendem Hash gilt:
- Gleicher gewünschter Zielwert bereits vorhanden: No-op, soweit die Aktionsvorbedingungen eindeutig erfüllt sind. Keine erneuten Zeitstempel oder Checklistenänderungen.
- **Unabhängige Änderungen:** Nur wenn alle gelesenen/geschriebenen Abhängigkeiten unverändert sind, darf die Aktion auf den frischen Text angewandt werden. Beispiel: extern geänderter Body plus lokale Prioritätsänderung lässt den externen Body erhalten.
- **Gleiches Feld oder fachlich gekoppelter Zustand:** Konflikt. Beispiel: dieselbe Frist extern auf Montag und lokal auf Freitag geändert; kein stilles Überschreiben. Bei Serien sind Revision, Regel, Start, Art, Begrenzung, aktuelle Instanz, Historie, Datumsfelder und Completion-Basis gekoppelt. Soll ein Checklistenzustand zurückgesetzt werden, gehört auch der Body zum Prüfbereich.
- **Textbearbeitung:** Ausgangsfassung, aktueller Dateitext und eigener Entwurf bleiben verfügbar. „Meine Version“, „Datei-Version“ und „Beide behalten“ sind bewusste Entscheidungen; auch nach dem Dialog muss der Hash der verglichenen Dateiversion noch passen. Ein neu aufgetretener Konflikt wird nicht übergangen.
- Strukturänderungen, Historienkorrektur und Undo werden nie blind auf einen anderen Stand übertragen. Automatische unabhängige Wiederholungen sind auf drei Versuche begrenzt; danach Entwurf erhalten und erneutes Speichern anbieten.

**Vorgänge und Reihenfolge:** Pro Datei eine Schreibwarteschlange mit eigener Vorgangs-ID und festem Aktionszeitpunkt. Ein wartender Auftrag wird beim Undo, Ordnerwechsel oder einer widersprechenden Änderung ungültig und nicht erneut abgespielt. Auf beiden Plattformen protokolliert ein dauerhaftes, app-lokales Operationsjournal vor Beginn mutierender Dateioperationen Vorgangs-ID, Art, Quell-/Zielreferenzen, Vorher-Hash/-Inhalt, gewünschten Inhalt und erreichte Phase. Es ist **kein löschbarer Cache**. Offene Vorgänge werden vor neuen Schreibaktionen auf betroffene Dateien geklärt. Eigene Watcher-Echos werden nur anhand des bestätigten Nachher-Hashes erkannt.

**Desktop (Fedora), bestehende Datei:**
1. Journal samt Wiederherstellungsinhalt dauerhaft schreiben.
2. Eindeutig benannte temporäre Datei `.markdoist-<vorgangs-id>.todo-tmp` im selben Ordner anlegen, schreiben und `fsync`. Der unabhängige Kurzname bleibt auch bei langen Zieldateinamen innerhalb des Dateisystemlimits.
3. Ziel-Hash prüfen; Konflikt beendet den Ersetzungsversuch, beide Fassungen bleiben erhalten.
4. `rename` über das Ziel, anschließend `fsync` des Ordners.
5. Ergebnis prüfen und Journal abschließen.

Bei Prozessabbruch bleibt die alte oder neue Zieldatei vollständig. Verwaiste Temp-Dateien werden beim Start anhand des Journals zugeordnet; unbekannte Inhalte nicht pauschal löschen. Eine bereinigte Temp-Datei darf erst entfernt werden, wenn ihre benötigte Fassung gesichert oder der Vorgang bestätigt abgeschlossen ist. Es gibt keine Zusicherung, dass ein externes Sync-Programm kurzlebige Dateien nie sieht; solche versteckten Dateien werden von Markdoist ignoriert. Das vorhandene Sync-Setup wird nicht umkonfiguriert.

**Android (SAF), bestehende Datei:** Atomarer Austausch ist für den vorgesehenen Provider nicht zugesichert. Vorgehen:
1. Operationsjournal mit altem und gewünschtem Inhalt dauerhaft speichern; schlägt das fehl, keine Zieldatei öffnen/kürzen.
2. Ziel erneut lesen und Hash prüfen.
3. `openFileDescriptor(uri, "wt")` zum ausdrücklichen Kürzen, schreiben, `flush` und `FileDescriptor.sync()`; notwendige Provider-Fähigkeiten werden in M1 überprüft.
4. Zurücklesen und Nachher-Hash prüfen. Erst dann Erfolg anzeigen und Journal abschließen.

**Wiederherstellung nach Abbruch/unklarem Ausgang:**
- Zieldatei entspricht dem gewünschten Inhalt: Vorgang abschließen, keine fachliche Aktion erneut ausführen.
- Zieldatei entspricht der Ausgangsfassung: ausstehende Änderung zum erneuten Speichern anbieten; keine neue Erledigungszeit bestimmen.
- Datei fehlt oder hat einen dritten Inhalt: nichts automatisch überschreiben/neu anlegen. Aktuelle Datei, Vorher- und gewünschte Fassung als Wiederherstellungsfall anbieten.
- Abgeschlossene Journal-Fassungen bleiben mindestens 7 Tage als lokale Sicherung erhalten; ungelöste Fälle und ungespeicherte Entwürfe werden nicht automatisch entfernt. Das 50-Aktionen-Limit des Undo-Journals gilt nicht für offene Wiederherstellungsfälle.

**Neue Dateien, Umbenennen, Papierkorb und Kopieren/Löschen:**
- Neuanlage: Name exklusiv vergeben, nie eine vorhandene Datei ersetzen; Vorgang vor Erstellung journalisieren. SAF-`createDocument` mit MIME-Typ `application/octet-stream`, tatsächlich vergebenen Namen/URI übernehmen. Leere oder unvollständige neue Dateien nach einem Abbruch werden mit dem Journal verknüpft, nicht als erfolgreicher Abschluss behandelt. Ein Wiederholungsversuch prüft zuerst das schon erzeugte Dokument.
- Umbenennen und providerseitiges Verschieben: Berechtigung/Fähigkeiten und Quell-Hash prüfen, Quell-/Zielreferenzen und Phasen journalisieren, zurückgelieferte URI übernehmen und Ergebnis verifizieren. Unklarer Ausgang wird vor einem erneuten Versuch durch Lesen beider Orte geklärt.
- Fallback Kopieren/Löschen: **Ziel vollständig schreiben, zurücklesen und Hash prüfen; danach Quelle erneut lesen und mit dem kopierten Quell-Hash vergleichen; erst dann Quelle löschen.** Ändert sie sich dazwischen oder scheitert ein Schritt, beide Fassungen behalten und den Vorgang als offen melden. Nach Abbruch zwischen Kopie und Löschen wird nicht nochmals kopiert, sondern der dokumentierte Zustand geprüft.
- Papierkorb-Wiederherstellung verwendet dieselbe Strategie; Namenskollisionen erzeugen ein Suffix. „Papierkorb leeren“ zeigt Umfang und Endgültigkeit an und bearbeitet nur die bestätigten Dateien/Hashes. Neue oder inzwischen geänderte Papierkorbdateien werden nicht mitgelöscht.
- Journale und Prüfschritte mindern Fehlerfolgen; das Rennen zwischen letzter Prüfung und externem Schreiben/Löschen bleibt bestehen (7.5).

**Unterstützter Provider:** lokaler gemeinsamer Speicher (`com.android.externalstorage.documents`). Andere Provider werden im Ordnerdialog abgewiesen, nicht mit ungeprüften Garantien zugelassen. Cloud-Provider sind nicht Teil von v1.

### 7.4 Konflikte und fachlich konsistente Varianten [F]/[V]

- Varianten werden über gleiche Aufgaben-ID, zusätzlich bekannte Sync-Konfliktnamen, Journalfälle und Abweichungen beim Speichern erkannt. Unbekannte Konfliktnamen ohne gemeinsame ID können nicht zuverlässig zugeordnet werden; Dateien ohne ID werden deshalb nicht vorschnell zusammengeführt.
- Die Oberfläche zeigt Feldvergleich und Body-Diff. Verfügbare Entscheidungen in v1: **eine ganze Variante behalten** (die andere wandert in den Papierkorb) oder **beide Dateien behalten** (die Kopie erhält eine neue ID). Feldweises Zusammenführen, manuelles Zusammenführen im Editor und das Vereinigen von Historieneinträgen sind **nach 1.0**.
- **Serienzustand als zusammengehöriges Ganzes:** Weil nur ganze Varianten gewählt werden, bleibt der Serienzustand automatisch konsistent. Es wird weder automatisch der spätere Schlüssel noch der spätere Zeitstempel bevorzugt.
- **Keine automatische Entscheidung [F].** Alle Quellfassungen werden vor dem Schreiben gesichert. Erst nach geprüftem Speichern der gewählten Fassung werden ausdrücklich verworfene Varianten mit weiterhin passendem Hash in den Papierkorb verschoben. Scheitert die Bereinigung, bleiben die übrigen Varianten mit Hinweis stehen.
- „Kopie erhält neue ID“ ist eine ausdrückliche Aktion. Es wird kein stilles Löschen nach Zeitstempel oder Dateinamen vorgenommen.

### 7.5 Ehrliche Grenzen [F]

- Es gibt keine Dateisperren.
- Zwischen Hash-Prüfung und Schreiben bleibt ein kleines Zeitfenster: auf dem Desktop Millisekunden, auf Android länger, da ohne atomares Ersetzen. Schreibt genau in diesem Fenster ein anderes Programm, kann dessen Änderung verloren gehen.
- Ein externer Editor mit offenem, ungespeichertem Puffer (z. B. Obsidian mit Autosave) kann App-Änderungen später überschreiben. Die App bemerkt das danach nur als Fremdänderung, nicht als Konflikt.
- Falls das externe Sync-Programm Konfliktkopien erhält, kann die App sie nach 7.4 anzeigen. Nicht jedes Sync-Verfahren garantiert eine solche Kopie; still verworfene Fassungen kann die App nicht aus dem Nichts rekonstruieren.
- Obsidian liest denselben Ordner am Handy mit (F012). Solange Obsidian nur liest, gibt es keine Konflikte. Bearbeitest du dieselbe Datei gleichzeitig in Obsidian und in Markdoist, gilt die Grenze oben.
- Auf Android gibt es keine native Dateiüberwachung. Änderungen werden durch die Abgleiche aus 7.1 sichtbar. Ein fremder Schreiber kann auch einen Zwischenstand eines SAF-Schreibvorgangs beobachten; lokale Journale sind keine geräteübergreifende Transaktion.

### 7.6 Entwürfe und Fehlerzustände [V]

- Editorzustand und zuletzt erfolgreich gespeicherter Dateistand werden getrennt geführt. Während der Eingabe wird ein lokaler Entwurf mit Ordneridentität, Dateireferenz, Aufgaben-ID, Basistext/-Hash und aktuellem Text fortlaufend gesichert, bevor ein späteres Autosave die gemeinsame Markdown-Datei schreibt. Entwürfe werden bei Neustart wieder angeboten, nicht ungefragt über die Datei geschrieben.
- Die UI unterscheidet „Änderungen offen“, „Entwurf lokal gesichert“, „Datei gespeichert“, „Speichern fehlgeschlagen“ und „Konflikt“. Bei abruptem Prozess-/Geräteausfall können noch nicht dauerhaft gesicherte letzte Eingaben verloren gehen; es gibt kein pauschales Null-Datenverlust-Versprechen.
- Voller Speicher, Schreibschutz, entzogene Berechtigung und fehlende Dateien erhalten konkrete Meldungen. Puffer/Entwurf bleiben erhalten; Wiederholen oder „Als neue Datei speichern“ sind möglich. Ein fehlgeschlagenes Speichern darf die Aufgabe nicht als erfolgreich erledigt aus der Liste verschwinden lassen.
- Bei Ordnerwechsel werden Schreibaufträge des alten Ordners beendet oder angehalten und Entwürfe dem alten Ordner zugeordnet. Nichts wird automatisch in den neu gewählten Ordner geschrieben. Erneute SAF-Freigabe ist eine Reparaturaktion; ohne Freigabe keine Schreibversuche.
- Journal, Undo, lokale Entwürfe und Cache sind getrennte Datenbestände. Cache löschen entfernt keine Wiederherstellungsdaten. Eine Deinstallation kann app-private Sicherungen/Entwürfe und Berechtigungen entfernen, auch wenn die Markdown-Dateien in Documents erhalten bleiben.

## 8. Meilensteine [V]

Jeder Meilenstein endet mit grünen automatisierten Tests und einer kurzen Abnahmenotiz.

| # | Inhalt | Ergebnis / Ausgang |
|---|---|---|
| **M0 Werkzeugkette + Auslieferung** | Monorepo, TS, Lint, Vitest, minimale Electron-/Expo-Apps. Nach ausdrücklichem Umsetzungsauftrag Repository/CI anlegen. Hermes-Spike für YAML, RRULE, Zeitzonenauflösung und abbrechbare Regelberechnung. Release-Warteschlange, SHA-Bindung, Versionsvergabe und Wiederholungsversuche prüfen. Expo-Werkzeuge nach 2.3 einrichten: SDK über `expo-upgrade` pinnen, `expo-mcp` als Entwicklungsabhängigkeit. | Beide Apps starten. Ein MCP-Screenshot und ein MCP-Tap gegen den Development-Build im Emulator funktionieren. APK-Update mit gleicher Signatur/höherem versionCode im API-36-Emulator; RPM-Installation im Fedora-43-Container. Drei schnelle Pushes erzeugen drei vollständige Releases. Obtainium wählt den neuesten Versionsstand auch nach verspätetem Nachholen eines älteren Releases. |
| **M1 Durchgängiger Dateizugriff + frühe Abbruchtests** | Minimaler Lese-/Schreibpfad, Desktop-/SAF-Adapter, Operationsjournal, dauerhafte Berechtigung, Neuanlage, Umbenennen, Verschieben und Wiederherstellen; Minimal-UI mit Fehlerzuständen. | Ordner wählen, extern ändern, App/Emulator neu starten. Abbruch an jeder Journal-/Schreib-/Kopier-/Löschphase, fehlende Berechtigung und voller Speicher werden bereits hier geprüft. Externe Änderungen werden mit Editor und adb einschließlich gleichzeitiger Änderungen simuliert; dies prüft die Dateischnittstelle, keine Garantie für jedes reale Sync-Setup. Keine Handy-Prüfliste. |
| **M2 Dateiformat und Wiederherstellung** | Vollständiges Schema einschließlich Formatversion und Abschnittsarchiv, Diagnosen, Serializer, Dateinamen, Papierkorb, Undo und lokale Entwürfe, vollständige Scans | Golden-Tests und AK-07 bis AK-11 sowie AK-22, AK-24, AK-34, AK-36, AK-37 grün; offene Journale/Entwürfe überstehen Neustart und Cache-Neuaufbau. |
| **M3 Datums- und Wiederholungskern** | Ansichten, Filter, Suche, Datumstypen, RecurrenceEngine, semantischer Validator, Abschnittswechsel und alle Aktionen aus 5.4 | Eigenschaftstests für Reihenfolge und Aktionswiederholung, COUNT/UNTIL-Grenzen, stabile Lesereparatur, Konfliktvorbedingungen, dateutil-Fixtures und Zeitzonen-/Abbruchtests grün. |
| **M4 Desktop-UI v1** | Ansichten, Schnellerfassung, Detail mit Feldern, CodeMirror + Vorschau, Filter und Suche, Tastatur, hell/dunkel, Undo, Probleme-Ansicht | Playwright-E2E grün |
| **M5 Android-UI v1** | dieselben Funktionen mit Touch-Bedienung, WebView-Vorschau, Wischgesten, App-Verknüpfung „Neue Aufgabe“. Während der Entwicklung prüft die Umsetzung jede Ansicht per MCP-Screenshot und -Tap im Emulator (2.3). | Maestro-Flows auf dem Emulator (API 36) grün; das Release-APK installiert sich als Update im Emulator |
| **M6 Wiederholungs-UI** | einfacher Editor, Monatsende-Abfrage, erweiterte Regeleingabe mit Validierung, Vorschau, deutscher Beschreibung, Historienansicht, Rücknahme, Serie beenden; beide Plattformen | Abnahme der Wiederholungskriterien |
| **M7 Gesamtrobustheit und Leistung** | Konfliktansicht (ganze Variante wählen), integrierte Wiederholungen der frühen Abbruchtests mit echten Oberflächen, Leistung mit 2 000 Dateien, simulierte konkurrierende Änderungen auf Desktop und API-36-Emulator | Alle Kriterien aus Abschnitt 9. Ziel: Cache-Anzeige Desktop < 2 s, Android < 3 s, Android-Vollscan < 15 s und Suche < 100 ms bei 2 000 Aufgaben à höchstens 4 KiB. API-36-AVD mit 4 vCPU/4 GiB, Host und Messverfahren dokumentieren; keine Übertragung als Garantie auf dein Handy. |
| **M8 Version 1.0** | RPM und signierte APK über den Release-Workflow, README und `docs/DATEIFORMAT.md` | Version 1.0 als GitHub-Release, über Obtainium und `dnf` installierbar |
| **M9 Müllabfuhr und kompakte Leiste** (umgesetzt 28.10.2026) | In dieser Reihenfolge, jeder Teil ein eigener Commit und erst nach grünen Tests gepusht: **(a)** Android-Leiste mit vier Reitern und Mehr-Blatt (4.5), alle Maestro-Flows mit `tab-done`/`tab-lists` umstellen. **(b)** Kern: Serienform feste Terminliste (5.7), `format_version: 2`, `waste_type`, Diagnosen; Eigenschaftstests mit dem bestehenden Invarianten-Orakel. **(c)** `packages/app`: ICS-Einleser und Importabgleich mit Vorschau (4.7), Tests mit anonymisierter Fixture. **(d)** Desktop: Seitenleiste, Müllabfuhr-Übersicht, Abfuhrart-Ansicht, Importdialog, Playwright. **(e)** Android: Müllabfuhr-Übersicht und Abfuhrart-Ansicht hinter „Mehr“, Maestro mit vorab angelegten Müllabfuhr-Dateien. | AK-45 bis AK-47 grün. `docs/DATEIFORMAT.md` beschreibt `recurrence_dates`, `waste_type` und Formatversion 2; Abnahmenotiz in `docs/ABNAHME.md`. |

## 9. Abnahmekriterien

**Testumgebung:** feste Testuhr, standardmäßig „heute = Mo 12.10.2026“, `Europe/Berlin`. Kern-Tests laufen zusätzlich unter `TZ=UTC`, `America/Los_Angeles` und `Pacific/Kiritimati`.

**Android-Nachweis:** Android-Prüfungen werden als „Emulator“ oder „echtes Gerät“ gekennzeichnet. Eine Prüfung auf einem echten Gerät wird nur behauptet, wenn sie dort stattgefunden hat [F]. Nach F018 gibt es keine Prüflisten am Handy. Alle Android-Kriterien prüfe ich im Emulator mit API 36 (= Android 16) und kennzeichne sie als „Emulator“. Meldest du beim Benutzen ein Problem, behandle ich es als Fehlerbericht.

| ID | Kriterium |
|---|---|
| AK-01 | Erfassung aus „Heute“ erzeugt eine Datei mit `inbox: true` und ohne `due`/`scheduled`. Sie erscheint im Eingang, nicht in Heute. |
| AK-02 | Eine neue Aufgabe mit ausdrücklich gesetztem heutigen `due` hat `inbox: true` und erscheint in Eingang **und** Heute/Fällig. |
| AK-03 | Eine einsortierte Aufgabe ohne Termin erscheint nur unter „Alle offenen“ (und mit Filter „Eingang: nein“) und wird von der Suche gefunden. Termin setzen oder entfernen ändert `inbox` nicht. |
| AK-04 | Heute-Matrix: `due` ∈ {gestern, heute, morgen, leer} × `scheduled` ∈ {gestern, heute, morgen, leer}. Jede der 16 Kombinationen landet im erwarteten Bereich (Fällig / Geplant-heute / Früher eingeplant / nicht in Heute). |
| AK-05 | Eigenschaftstest: Keine Aufgabe erscheint in Heute doppelt. Bei `due ≤ heute` und `scheduled ≤ heute` steht sie unter Fällig und zeigt das Planungsdatum. |
| AK-06 | `due: 2026-10-12` ist am 12.10. um 23:59 nicht überfällig, am 13.10. schon. `due: 2026-10-12T17:00` ist um 17:01 überfällig und bleibt unter Fällig. Ein `scheduled` von gestern ist nie „überfällig“. |
| AK-07 | Golden-Test mit vorhandenen Kernfeldern, unbekannten Feldern, Kommentaren, CRLF, BOM und Body ohne Abschlusszeilenumbruch: Prioritätsänderung ändert nur priority und dateModified. Neue Format-/Serienfelder werden dabei nicht nebenbei materialisiert. |
| AK-08 | Das Einlesen von 200 Dateien, darunter ungültige, verändert keine Datei: mtimes sind gleich, der Spion-Adapter zählt 0 Schreibvorgänge. |
| AK-09 | Eine ungültige Datei erscheint unter Probleme mit Meldung und bleibt nach allen Aktionen an anderen Dateien unverändert. |
| AK-10 | Extern geänderter Body plus lokale Priorität lässt beide Änderungen bestehen. Extern auf Montag und lokal auf Freitag geänderte gleiche Frist öffnet einen Konflikt. Eine Serienaktion nach geändertem Regel-/Revisionszustand wird nicht blind neu angewandt. Auch der Konfliktdialog prüft vor Übernahme erneut den Hash. |
| AK-11 | Eine Konfliktkopie (gleiche `id`, z. B. eine Syncthing-`sync-conflict`-Datei) erscheint als Variante. Ohne Nutzerentscheidung wird keine Datei gelöscht oder geändert, und keine Variante wird nach Zeitstempel bevorzugt. |
| AK-12 | Eine Serie zehnmal erledigen: Die Anzahl der Dateien im Ordner bleibt gleich, und `inbox: false` bleibt `false`. |
| AK-13 | Wöchentlich ab Mo 05.10., erledigt am Do 08.10.: `calendar` (`BYDAY=MO`) ergibt den 12.10., `completion` (`FREQ=WEEKLY`) den 15.10. Vorzeitige Erledigung des Vorkommens 19.10. am 15.10. ergibt beim Kalenderrhythmus den 26.10. |
| AK-14 | Eigenschaftstest: Beliebige Permutationen und Duplikate von `complete_instances`/`skipped_instances` ergeben dasselbe nächste Vorkommen. |
| AK-15 | Wiederholtes Erledigen desselben K derselben Revision ist byte-identisch und erzeugt genau einen Eintrag, auch beim letzten Vorkommen einer COUNT=1-Serie und bei status=done. Entsprechend für wiederholtes Überspringen. Kein neuer Zeitstempel, kein weiterer Reset, kein zusätzlicher Undo-Eintrag. Veraltete Aktionen (Revision A nach Regelwechsel zu B, Erledigen gegen inzwischen übersprungenes K, alte wartende Aktion nach Undo) schreiben nichts; doppeltes Beenden ist ein No-op. |
| AK-16 | Stabiles Einlesen: Kalender, K=05.10.2026 steht in C, Instanz blieb stehen → angezeigter Vorschlag 12.10. am Lesetag 08.10. ebenso wie am 20.10.; kein Schreiben, kein Sprung auf 26.10., Serienaktionen gesperrt, Eintrag unter Probleme. Completion mit unklarer Basis ebenso. Eine konsistente offene Instanz bleibt bei beliebigem Lesetag unverändert. |
| AK-17 | Monatsenden und Schaltjahre: `BYMONTHDAY=31` lässt November aus; `BYMONTHDAY=-1` ergibt 30.11.2026, 28.02.2027, 29.02.2028; `BYMONTHDAY=28,29,30;BYSETPOS=-1` ergibt den 30. bzw. das Februarende; `BYMONTH=2;BYMONTHDAY=29` trifft nur Schaltjahre; „letzter Freitag“ (`BYDAY=-1FR`) stimmt. Alle Werte werden gegen python-dateutil-Fixtures geprüft. |
| AK-18 | Zeitzonen: Reine Datumswerte bleiben unverändert. In Europe/Berlin gilt 02:30 am 28.03.2027 ab 03:00 als verstrichen; am 31.10. bleibt 02:30 nach erstem Überschreiten auch im zweiten Durchlauf um 02:15 überfällig. 09:00-Serien behalten ihre Wanduhrzeit. Offset-Importe behalten ihren Instant, Completion-Basen ihren gespeicherten Aktionstag. |
| AK-19 | Eine nicht unterstützte Regel (`BYHOUR=8,20`, `FREQ=HOURLY`, `RSCALE`, Tippfehler) wird angezeigt, ihre Aktionen sind gesperrt, und nach Änderungen an anderen Feldern ist die Zeile `recurrence` byte-identisch. |
| AK-20 | entfällt, in AK-19 aufgegangen. |
| AK-21 | Checklisten werden nur beim Wechsel zu einem neuen offenen Vorkommen zurückgesetzt; alle anderen Bytes bleiben identisch. Fenced und eingerückte Code-Blöcke sowie Serienende, No-op und Lesereparaturvorschau verursachen keinen Reset. Sofortiges Undo stellt den alten Zustand exakt wieder her. |
| AK-22 | Bereits in M1: Prozessabbruch an allen Schreibphasen, auch bei Neuanlage, Umbenennen und Papierkorb-Kopie vor/nach Quelllöschung. Desktop behält eine vollständige alte/neue Fassung; Android kann Ausgangs- und Zielfassung aus dem Journal anbieten. Ein dritter externer Inhalt wird nicht überschrieben, keine ungeprüfte Löschung, keine doppelte Neuanlage, gültige neue URI wird übernommen. Ein erkannter Schreibabschluss wird nicht als fachliche Aktion wiederholt. |
| AK-23 | Android: Die Berechtigung überdauert App- und Geräteneustart; die Datei heißt exakt `X.md`; kürzerer Inhalt hinterlässt keine Restbytes; eine externe Änderung wird beim Zurückwechseln erkannt. |
| AK-24 | Löschen und Wiederherstellen stellt die Datei byte-identisch wieder her; bei Namenskollision wird eine Zahl angehängt. |
| AK-25 | Suche findet Begriffe in Titel und Body, unabhängig von Groß-/Kleinschreibung und Umlauten. Kombinierte Filter (z. B. priority=high UND due=überfällig UND Eingang=nein) liefern die erwartete Menge. |
| AK-26 | Die App-Verknüpfung „Neue Aufgabe“ öffnet den Erfassungsdialog. Die erfasste Aufgabe hat `inbox: true` und keinen Termin (wie AK-01). |
| AK-27 | Release-APK: applicationId de.markdoist.aufgaben, konstante Signatur, genau eine APK und ein RPM. versionCode ist je neuem Push-Lauf höher; die angebotene Latest-Version geht nie zurück. Tag, APK und RPM gehören zum gleichen Commit. Drei schnelle main-Pushes ergeben drei Releases; fehlgeschlagene Prüfung veröffentlicht nichts; Rerun eines fertigen Releases ist ein No-op. |
| AK-28 | Unterordner im Aufgabenordner werden nicht eingelesen; eine `.md`-Datei darin erscheint in keiner Ansicht. |
| AK-29 | COUNT-Neustart: Zwei Erledigungen im alten Abschnitt, Änderung am 12.10.2026 auf wöchentlich montags COUNT=5 → neuer Abschnitt mit 12./19./26.10. und 02./09.11.; fünf neue Erledigungen, insgesamt sieben in der Anzeige. Auch zuvor bereits COUNT=5: ausdrückliches „ab jetzt noch fünfmal“ zählt fünf neue. Für Completion zählen fünf neue Erledigungen, Skips nicht. Alte Historie unverändert im Archiv. |
| AK-30 | Completion-Kollision: K=19.10., wöchentlich, erledigt am 12.10. → 19.10. wird nicht erneut geöffnet; Vorschau und Ergebnis 26.10. Bereits erledigte und übersprungene Schlüssel werden ausgeschlossen, Einträge alter Revisionen blockieren den neuen Abschnitt nicht. |
| AK-31 | entfällt, in AK-15 aufgegangen. |
| AK-32 | COUNT=1 bei beiden Arten, Skip bei Completion, inklusive UNTIL-Grenze und ausgeschöpfte Serie wiederöffnen: kein automatischer Neustart. „Mit neuer Regel fortsetzen“ erzeugt eine neue Revision. Ein Berechnungsabbruch beendet die Serie niemals. |
| AK-33 | Konfliktvarianten: Nach „Variante behalten“ ist genau die gewählte Datei byte-identisch erhalten, die andere liegt im Papierkorb. Nach „beide behalten“ haben beide Dateien verschiedene IDs. Varianten bleiben bis zum geprüften Abschluss erhalten. Feldweises Zusammenführen: nach 1.0. |
| AK-34 | Dateiinhalt bei gleicher Größe/mtime ändern: vollständiges Neueinlesen erkennt den neuen Hash. Fehlende Metadaten erzwingen Lesen. Fehlgeschlagene Verzeichnisabfrage entfernt keine Aufgaben aus dem Index. |
| AK-35 | entfällt, in AK-22 aufgegangen. |
| AK-36 | Autosave bei vollem Speicher oder entzogener Freigabe schlägt sichtbar fehl; Entwurf bleibt. Neustart bietet dauerhaft gesicherten Entwurf an. Ordnerwechsel und externe Löschung führen nicht zu Schreiben am falschen Ort oder stiller Neuerstellung. |
| AK-37 | Höhere format_version und unbekannte Serienstruktur sind schreibgeschützt; versionslose Fremddatei wird beim Lesen nicht migriert. Aktives/archiviertes Datum derselben Tageszahl bleibt nach Regelwechsel unterscheidbar; Cache-Neuaufbau verliert keine Historie. |
| AK-38 | Unmögliche, ungültig kombinierte und aufwendige Regeln blockieren keine Oberfläche. Nach begrenzter Berechnung Diagnose statt Serienende; 0 Schreibvorgänge. COUNT zusammen mit UNTIL wird zurückgewiesen. |
| AK-39 | entfällt, in AK-27 aufgegangen. |
| AK-40 | Leistungsziele aus M7 mit 2 000 Dateien: Cache-Anzeige, vollständiger SAF-Scan und Suche getrennt messen; UI bleibt während Scan und Regelberechnung bedienbar. |
| AK-41 | Wiederholung entfernen behält alle Historiendaten im Archiv. Späte Historienkorrektur: nach 1.0. |
| AK-42 | Ungültiges due plus gültiges heutiges scheduled bleibt in Geplant und Probleme sichtbar. Erstes Einzelverschieben ohne expliziten Abstand hält den bisherigen Abstand für spätere Termine fest. |
| AK-43 | Tastaturaktionen lösen beim Schreiben keinen Aufgabenabschluss aus; Text-Undo und Aufgaben-Undo sind getrennt. Unicode-Dateinamen, leer bereinigter Titel und Kollisionssuffix bleiben innerhalb des Byte-Limits. |
| AK-44 | Listen (4.6): Eine neue Liste hat `kind: list`, `inbox: false` und keine Termine. Sie erscheint in keiner Aufgabenansicht, aber in „Listen“ und in der Suche. Anfügen, Abhaken, Text ändern, Entfernen, Verschieben, „Abgehakte entfernen“ und „Alle Haken zurücksetzen“ ändern nur die betroffenen Body-Zeilen und sind rückgängig zu machen; eine extern verschobene Zeile führt zu keinem Schreiben. |
| AK-45 | Feste Terminliste (5.7): Liste 13.11./11.12.2026, Bezugsfeld `due`, Abstand −7. Am 06.11. steht die Aufgabe unter „Heute eingeplant“, am 10.11. unter „Früher eingeplant“, am 13.11. unter Fällig. Erledigen am 15.11. ergibt K = 11.12. und `scheduled` = 04.12.; Erledigen am 20.12. beendet die Serie regulär. Verspätetes Erledigen überspringt einen dazwischen verstrichenen Termin, ohne ihn in C oder S einzutragen. Permutationen und Duplikate in `recurrence_dates` ergeben dasselbe nächste Vorkommen. Eine Datei mit `format_version: 2` ist für einen Leser, der nur Version 1 kennt, schreibgeschützt (wie AK-37). |
| AK-46 | ICS-Import (4.7) mit einer anonymisierten Nachbildung der Vorlage (CRLF, `SUMMARY;LANGUAGE=de`, doppelte Leerzeichen, 10 Termine in 4 Arten): legt 4 Dateien mit zusammen 10 Terminen an, `inbox: false`, Abstand −7, Namen aus der Vorschau. Derselbe Import erneut: 0 Schreibvorgänge. Eine Folgedatei mit neuen UIDs, zusätzlichen Terminen und einem verlegten Termin ergänzt, entfernt nur den verlegten, ungelösten Zukunftstermin und setzt eine ausgeschöpfte wie eine von Hand beendete Serie in derselben Revision fort; vergangene, erledigte und übersprungene Daten bleiben. Die Adresse aus `LOCATION` steht in keiner Datei. Eine seit der Vorschau geänderte Datei wird nicht überschrieben. |
| AK-47 | Android-Leiste (4.5): genau vier Reiter (Eingang, Heute, Alle, ⋯ Mehr). Mehr öffnet das Blatt mit Erledigt, Listen und, nur wenn eine Müllabfuhr-Serie existiert, Müllabfuhr; jeder Eintrag öffnet seine Übersicht, die Pille liegt dann auf „Mehr“, Zurück führt zur letzten Hauptansicht. Alle bisherigen Maestro-Flows laufen über den neuen Weg grün. |

## 10. Build-Plan

### 10.1 Fedora (Electron, RPM und AppImage) [F, F010]

- **Format:** RPM, Installation per `dnf`, dazu AppImage für die lokale Installation. Kein Flatpak; die App nutzt nur eine Person. Die ursprüngliche Antwort zu F010 lautete „nur RPM“; am 21.10.2026 hat der Nutzer das AppImage ausdrücklich bestätigt.
- **AppImage lokal:** `pnpm desktop:install` baut `Markdoist.AppImage`, legt es unter `~/Applications` ab und schreibt Menüeintrag und Icon nach `~/.local/share` (`scripts/install-desktop-local.sh`). Das GitHub-Release baut weiterhin nur das RPM.
- **Lokaler Build:**
  - Voraussetzungen: Node 22 und `rpm-build` sind vorhanden; pnpm kommt über `corepack enable`. Für das fpm-Werkzeug von electron-builder ist eventuell `libxcrypt-compat` nötig, was in M0 geprüft wird. Installationen sind erlaubt (F014).
  - Befehle: `pnpm install` → `pnpm --filter desktop build` → `pnpm --filter desktop dist`
  - Ergebnis: `apps/desktop/release/markdoist-<version>.x86_64.rpm`
- **Installation und Update:** `sudo dnf install ./markdoist-<version>.x86_64.rpm`; eine neuere Version installiert sich mit demselben Befehl darüber. Das RPM ist nicht signiert, es dient der lokalen Nutzung. Es enthält einen Desktop-Eintrag und ein Icon.
- **Über GitHub [F, F017]:** Der Release-Workflow baut das RPM bei jedem Push auf `main` mit und hängt es an dasselbe Release wie die APK (10.2). Du lädst es von der Release-Seite (`gh release download` oder Browser) und installierst es mit `sudo dnf install ./markdoist-<version>.x86_64.rpm`. Der lokale Build bleibt für die Entwicklung möglich.
- **Wayland:** Electron wählt Ozone automatisch.

### 10.2 Android (APK über GitHub und Obtainium) [F, F011/F014]

**Weg zum Handy [F, F016]:** Jeder erfolgreich geprüfte und gebaute Push auf `main` erhält ein GitHub-Release mit genau **einer** APK und dem RPM. Fehlgeschlagene Läufe veröffentlichen nichts. Obtainium bietet die neueste Version als Update an; ein weiterer Push ist kein Grund, einen schon laufenden oder wartenden Release-Build zu verwerfen.

**Release-Workflow `.github/workflows/release.yml` [V]:**
- **Auslöser:** `push` auf `main`. Pushes auf andere Zweige lösen nur `ci.yml` aus, also kein Release.
- **Nebenläufigkeit:** Repositoryweit eindeutige Release-Gruppe mit `cancel-in-progress: false` und `queue: max` auf Workflow-Ebene. Alle Hauptzweig-Releases durchlaufen dieselbe Gruppe, auch nach Umbenennen des Workflows. Einfach nur `false` reicht nicht: Die Standardwarteschlange würde weitere wartende Läufe ersetzen. Bei GitHubs Warteschlangenlimit (derzeit 100 wartende Läufe) wird ein abgewiesener Lauf als Fehler nachgeholt, nicht als erledigt gezählt. Die Reihenfolge des Einreihens ist kein garantierter Versionsvergleich; Latest wird deshalb ausdrücklich gegen die bereits veröffentlichten Versionsnummern geprüft. [GitHub-Dokumentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- **Commit-Bindung:** Alle Jobs checken genau `github.sha` des auslösenden Pushes aus. Gemeinsame Versionsmetadaten werden einmal bestimmt und an beide Build-Jobs übergeben; kein Job baut den inzwischen weitergewanderten Branch-Kopf. Nur der Release-Job erhält die benötigte Schreibberechtigung für Repository-Inhalte; Fork-PRs erhalten keine Signier-Secrets.
- **Job `test`:** Lint, Typprüfung, Vitest mit Zeitzonen-Matrix. Schlägt er fehl, entsteht **kein** Release.
- **Job `android`** (nach `test`):
  1. Runner `ubuntu-latest`, Node 22 (`actions/setup-node`), pnpm, **Temurin JDK 17** (`actions/setup-java`); das Android-SDK ist auf dem Runner vorinstalliert. Der JDK-17-Engpass von Fedora 43 spielt hier keine Rolle.
  2. `pnpm install --frozen-lockfile`
  3. `pnpm --filter mobile exec expo prebuild --platform android --clean`. Der generierte `android/`-Ordner wird nicht eingecheckt; der Kotlin-Code liegt in `apps/mobile/modules/saf-storage`.
  4. `./gradlew assembleRelease`, signiert mit dem Keystore aus dem GitHub-Secret (Base64) plus Passwort-Secrets; ein Gradle-Cache beschleunigt den Build.
  5. Ergebnis: eine **universelle** APK `markdoist-<version>.apk`. So findet Obtainium eindeutig eine Datei, und sie läuft auf jedem Gerät. Sie ist etwas größer als eine reine arm64-APK; das lässt sich später optimieren.
- **Job `rpm`** (nach `test`, parallel zu `android`): `ubuntu-latest` mit dem Paket `rpm` (`apt-get install rpm`), `pnpm --filter desktop dist`, Ergebnis `markdoist-<version>.x86_64.rpm`. Dass sich das Paket unter Fedora 43 installieren lässt, prüfe ich in M0 lokal in einem `podman`-Container `fedora:43`.
- **Job `release`** (nach `android` und `rpm`): signierte APK, RPM und ihre Build-Metadaten auf denselben Commit und dieselbe Version prüfen. Neues Release zunächst als Entwurf über `gh release create v<version> --target <vollständige github.sha> --draft --generate-notes` anlegen, beide Assets hochladen, Namen/Hashes/Signatur prüfen und erst danach veröffentlichen. Ein vorhandener Tag muss exakt auf diesen Commit zeigen; andernfalls Abbruch. Ohne `--target` würde die CLI einen neuen Tag am aktuellen Standardbranch anlegen. [GitHub-CLI-Dokumentation](https://cli.github.com/manual/gh_release_create)
- **Wiederholungsversuche:** Ein Rerun prüft zuerst, ob das Release seines Laufs schon existiert. Existiert es vollständig, ist der Rerun ein No-op; existiert nur ein Entwurf, werden fehlende Assets ergänzt. Es wird nie eine zweite Version für denselben Lauf erzeugt.
- **Latest und Obtainium:** Latest ist ausdrücklich die höchste veröffentlichte reguläre Version; ein verspätetes niedrigeres Release erhält `--latest=false`. Die Obtainium-Einrichtung dokumentiert die Option zur Beachtung von GitHubs Latest-Auswahl (`verifyLatestTag`); diese Auswahl wird in M0 im Emulator geprüft. So sind nachgeholte ältere Releases auf GitHub verfügbar, ohne ein Downgrade als neues Update anzubieten. Die tatsächliche Obtainium-Auswahl hängt von dieser Einstellung ab, nicht allein von GitHubs Markierung. [Obtainium-Implementierung](https://github.com/ImranR98/Obtainium/blob/main/lib/app_sources/github.dart)
- **Aufbewahrung:** Alle Releases bleiben stehen. Automatisches Aufräumen alter Releases ist in v1 nicht vorgesehen.

**Versionen [V]:**
- Die Version setzt sich zusammen als `<Major>.<Minor>.<Laufnummer>`, z. B. `0.1.57`. Major und Minor stehen in `package.json` (Start `0.1`, zu M8 `1.0`); die Laufnummer ist `VERSION_CODE_OFFSET + github.run_number`, anfangs bei Offset 0 also `github.run_number`.
- Der Tag `v0.1.57` wird vom Workflow automatisch gesetzt; Obtainium liest die Version aus dem Tag.
- `versionCode` = `VERSION_CODE_OFFSET + github.run_number`, Startoffset 0. Die Nummer steigt für neue Push-Läufe; ein Rerun behält seine ursprüngliche Nummer. Wird der Workflow jemals neu angelegt, muss der Offset vorher über den bisherigen Höchststand angehoben werden. Die als Update ausgewählte Version steigt immer.
- Versionsmetadaten (Run-ID, Commit, versionCode, versionName und Asset-Hashes) werden in der Release-Beschreibung festgehalten.
- `versionName` = die Version, also auch in der App sichtbar (Einstellungen → Über).

**Signierschlüssel [V]:**
1. Ich erzeuge in M0 einen Release-Keystore lokal (`keytool`) unter `~/.local/share/markdoist/release.jks`.
2. Ich lege ihn mit `gh secret set` als Secrets im Repository `blaxcky/markdoist` ab (Keystore als Base64, Passwörter getrennt). Ins Repository selbst kommt er nie. Bevor ich das Repository anlege, Secrets setze und den ersten Push mache, kündige ich das in M0 kurz an.
3. **Du sicherst den Keystore**, z. B. im Passwortmanager. Ohne passenden Schlüssel ist ein normales Update nicht möglich. Bei Deinstallation bleiben Dateien in Documents zwar erhalten, app-private Entwürfe/Journale und Freigaben können jedoch verloren gehen; deshalb erst benötigte Wiederherstellungsfassungen sichern.

**Ohne EAS; Expo-Konto nur für die Entwicklung:** Expo wird als Framework genutzt (Prebuild, Modules, Config-Plugins). Gebaut wird mit Gradle in GitHub Actions; Build und Release brauchen kein Expo-Konto. Dein Expo-Konto wird nur für den Expo-MCP in der Entwicklung verwendet (2.3).

**Prüf-Workflow `ci.yml` [V]:** Bei Pushes auf andere Zweige und bei Pull Requests laufen Lint, Typprüfung und Vitest mit der Zeitzonen-Matrix; auf `main` übernimmt das der Job `test` im Release-Workflow. Maestro- und Playwright-E2E laufen lokal, weil Android-Emulatoren in CI langsam und wackelig sind. Ich führe sie vor jedem Push auf `main` aus, der Android- oder Desktop-Oberfläche betrifft.

**Lokale Entwicklung:**
- Vorhanden sind `~/Android/Sdk` (Plattformen 35/36, Build-Tools, Emulator-Images 36/37) und JDK 21.
- Ich versuche zuerst JDK 21. Falls Gradle oder React Native damit scheitern, installiere ich Temurin 17 im Benutzerverzeichnis (erlaubt laut F014).
- Für die Entwicklung gibt es einen Development-Build mit `expo-dev-client` im Emulator. Expo Go geht nicht, weil das Kotlin-Modul nativ ist.
- Expo-MCP mit lokalen Werkzeugen (2.3): `pnpm --filter mobile exec expo install expo-mcp --dev` einmalig; zum Entwickeln `EXPO_UNSTABLE_MCP_SERVER=1 pnpm --filter mobile exec expo start` mit laufendem Emulator. Nach jedem Start oder Stopp des Dev-Servers wird die MCP-Verbindung in Claude Code neu verbunden (`/mcp`).
- **Einmalige Anmeldung durch dich:** Die Expo-CLI muss mit demselben Konto angemeldet sein wie der MCP. Du führst dazu einmal `pnpm --filter mobile exec expo login` aus; ich gebe keine Zugangsdaten ein. Prüfen lässt sich die Anmeldung mit `expo whoami`.

**Mindestversion:** die minSdk der gewählten React-Native/Expo-Version (aktuell 24, Android 7). `targetSdk` 36. Getestet wird im Emulator mit API 36, also Android 16 wie auf deinem Handy (F018). Prüfungen auf dem Handy selbst gibt es nicht.

## 11. Risiken und Prüfpunkte

| Risiko | Gegenmaßnahme |
|---|---|
| `temporal-polyfill`/`rrule` unter Hermes | M0 prüft Kalenderberechnung, benötigte Zeitzonenauflösung und abbrechbare Berechnung auf der gewählten Laufzeit. Plattformfreie Funktionen erhalten Uhr/Zone als Eingaben. |
| rrule.js wird kaum noch gepflegt | Kapselung, python-dateutil-Fixtures; `rrule-temporal` als Reserve |
| SAF: `"w"` kürzt nicht, `.md` wird zu `.md.txt`, Berechtigung geht verloren | M1-Probe deckt alle drei ab |
| JDK 17 fehlt auf Fedora 43 | Releases baut GitHub mit Temurin 17; lokal JDK 21, sonst Temurin 17 im Benutzerverzeichnis |
| Signierschlüssel geht verloren | Sicherung nach 10.2; vor einer Neuinstallation auch app-private Entwürfe/Wiederherstellungsfälle beachten. |
| Restrisiko ohne Gerätetest: Hersteller-Eigenheiten beim SAF-Zugriff | Emulator API 36, frühe Abbruch-/Berechtigungstests und getesteter Provider. Journal/Hashes mindern Fehlerfolgen, garantieren aber weder jede Herstellerimplementierung noch den Erhalt unbekannter Fremdänderungen. Keine Handy-Prüfliste; Fehlerberichte aus normaler Nutzung werden bearbeitet. |
| Jeder Push auf `main` wird ein Release: viele Releases, halbfertige Stände landen auf dem Handy | Releases entstehen nur, wenn alle Tests grün sind. Ich pushe nur lauffähige Stände; Zwischenarbeit bleibt lokal oder auf Nebenzweigen, die kein Release erzeugen. |
| Mehrere oder falsch benannte APK-Dateien verwirren Obtainium | genau eine APK pro Release (AK-27) |
| Obsidian bearbeitet dieselben Dateien parallel | Grenzen dokumentiert (7.5). Hash-Prüfung und Konfliktdialog decken die erkennbaren Fälle ab. |
| Neuer Lesetag verändert offene Termine / wiederverwendete Schlüssel | Dateibasierter aktueller Zustand, Sperre statt stiller Reparatur, getrennte Revisionen und Ausschluss bereits aufgelöster Schlüssel; AK-15/16/29/30/32. |
| Abweichende Versionen auf Desktop und Handy | Formatversion prüfen; neuere Semantik schreibgeschützt anzeigen, keine automatische Rückmigration. |
| Cache oder Speicherzugriff täuscht fehlende Aufgaben vor | Vollständiger Rescan, unbekannte Metadaten lesen, Fehler nicht als Löschung behandeln; AK-34/36. |
| Expo-MCP oder seine lokalen Werkzeuge (`EXPO_UNSTABLE_MCP_SERVER`) sind instabil, ändern sich oder sind nicht erreichbar | Nur Entwicklungshilfe, keine Abhängigkeit von CI, Release oder APK (2.3). Abnahme über Maestro; Doku notfalls direkt auf docs.expo.dev. |
| Release-Rerun oder geänderte Workflowzählung bietet alte APK als Update an | Stabile Commit-/Versionszuordnung, fortgesetzter versionCode, Latest-Prüfung und Obtainium-Nachweis; AK-27. |

## 12. Nach 1.0 zurückgestellt

Diese Punkte sind bewusst nicht Teil von v1. Es werden dafür keine Gerüste, Felder oder Dialoge vorab angelegt.

- Reparaturdialog „Fortschreibung übernehmen/klären“ für inkonsistent fremdbearbeitete Serien (5.2, 5.4). In v1: Sperre, Eintrag unter Probleme, „Regel bearbeiten“ oder „Wiederholung entfernen“.
- Späte Historienkorrektur über die Oberfläche (5.4, AK-41).
- Feldweises und manuelles Zusammenführen von Konfliktvarianten sowie Vereinigung von Historieneinträgen (7.4, AK-33). In v1: ganze Variante wählen oder beide behalten.
- Automatisches Leeren des Papierkorbs nach Frist (F004).
- „Teilen an Markdoist“ auf Android (F009).
- Gespeicherte eigene Listen (4.3).
- Mehrere Vorkommen pro Tag, stündliche Regeln, Erledigungszeit je Vorkommen (F005, F006).
- Optimierte arm64-APK statt universeller APK (10.2).
- Automatisches Aufräumen alter Releases (10.2).
- Müllabfuhr-Import am Handy, Kalender-Abo per URL, Termine von Hand zu einer festen Terminliste hinzufügen (4.7, 5.7).

---

# TEIL B – Rückfragen

Die bisherigen Rückfragen stehen in `FRAGEN.md` (F001–F018, alle beantwortet und oben eingearbeitet). Neue Rückfragen werden über das Fragen-Tool gestellt: gesammelt in einer Datei unter `.fragen/`, geöffnet mit `fragen-tool`, Ablauf siehe `CLAUDE.md` und Skill `fragen`.

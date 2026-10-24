# Abnahmenotizen

Je Meilenstein: was geprüft wurde, wie, und Abweichungen von [V]-Vorschlägen aus `PLAN1.md`. Android-Prüfungen sind als **Emulator** gekennzeichnet (API 36, AVD `Markdoist_API_36`, x86_64, 4 vCPU/4 GiB). Auf einem echten Gerät wurde nichts geprüft.

## M0 – Werkzeugkette und Auslieferung

**Umgebung (17.10.2026):** Fedora 43, Node 22.22.2, pnpm 10.34.7 (per `npm i -g` nach `~/.local`, corepack fehlt), JDK 21 (lokal; Gradle läuft damit, kein JDK 17 nötig), Android SDK mit Build-Tools 37, `rpmbuild`, `podman`.

**Gepinnte Versionen:** TypeScript 6.0.3 (7.x wird von typescript-eslint noch nicht unterstützt), Vitest 5.0.5, fast-check 4.10.2, `yaml` 2.9.1, `rrule` 2.8.1 (gepatcht, s. u.), `temporal-polyfill` 1.0.6, `markdown-it` 15.0.3, Electron 44.9.0, electron-vite 6.0.0, Vite 8.3.4, electron-builder 26.15.3, React 19.3.0 (gleich in Desktop und Expo), Expo SDK 58 (`expo` ~58.0.14, React Native 0.88.0), CodeMirror 6, chokidar 5, Playwright 1.64.1.

**Geprüft:**
- Monorepo mit pnpm-Workspaces (`node-linker=hoisted`), TS strict, ESLint, Prettier, Vitest mit Zeitzonen-Matrix (`Europe/Berlin`, `UTC`, `America/Los_Angeles`, `Pacific/Kiritimati`).
- Electron-App startet; RPM gebaut und im Container `fedora:43` per `dnf install` installiert (Desktop-Eintrag, Icon, `/usr/bin/markdoist`).
- Expo-Development-Build (`expo-dev-client`) im Emulator gestartet. **Hermes-Spike (Emulator):** YAML 1.2 (Datum bleibt String), rrule (`BYMONTHDAY=-1`), Zeitzonenauflösung (Lücke 02:30 → 03:00, doppelte Stunde → früherer Instant), Gerätezone, begrenzte Berechnung einer unmöglichen Regel (192 ms im Debug-Build, Abbruch statt Serienende), SHA-256, markdown-it-Checklisten – alle grün.
- Signierte Release-APK lokal gebaut: applicationId `de.markdoist.aufgaben`, versionCode/versionName aus der Umgebung, targetSdk 36, universelle APK (4 ABIs), Zertifikat = Release-Keystore.
- `concurrency` mit `queue: max` laut GitHub-Doku vorhanden (FIFO, max. 100 wartende Läufe, nicht mit `cancel-in-progress: true` kombinierbar).

**Abweichungen [V]:**
- `rrule` 2.8.1 wird per `pnpm patch` ergänzt (`patches/rrule@2.8.1.patch`): rrule.js prüft `UNTIL` nur bei erzeugten Terminen; Regeln ohne Treffer liefen bis zum Jahr 9999 (6,5 s). Der Patch bricht ab, sobald der Zählzeitraum sicher hinter `UNTIL` liegt. Zusätzlich begrenzt die `RecurrenceEngine` den Suchhorizont je Frequenz (täglich 12, wöchentlich 30, monatlich 100, jährlich 400 Jahre) und meldet „abgebrochen“, nie „erschöpft“.
- Lokaler RPM-Build braucht `libcrypt.so.1`. Ohne Root-Rechte ist das Paket aus `libxcrypt-compat` nach `~/.local/lib/markdoist-build/` entpackt; lokal: `LD_LIBRARY_PATH=~/.local/lib/markdoist-build pnpm --filter desktop dist`. In GitHub Actions (Ubuntu) nicht nötig.
- Release-Signatur über ein eigenes Config-Plugin (`apps/mobile/plugins/withReleaseSigning.js`); ohne Keystore wird ein Release-Build nie mit dem Debug-Schlüssel signiert.
- Eigene AVD `Markdoist_API_36` statt der vorhandenen AVD eines anderen Projekts.

**Auslieferung (GitHub):**
- Repository `blaxcky/markdoist` (öffentlich, keine Lizenz), Secrets für den Keystore, Variable `MARKDOIST_CERT_SHA256`. Der lokale Remote heißt `markdoist`; der ältere private Remote `origin` (`blaxcky/local-first-todo`) bleibt unverändert.
- Erstes Release **v0.1.1** (Commit `ea44b3f`): genau eine APK und ein RPM, Tag auf dem auslösenden Commit, Latest. **Rerun** des fertigen Laufs: Release-Job meldet „bereits veröffentlicht – nichts zu tun“, kein zweites Release.
- **Expo-MCP (Emulator):** Screenshot und Tap (`choose-folder`, `tab-inbox`, Zeile, `priority-high`) gegen den Development-Build funktionieren, nachdem Metro mit `platform-tools` im `PATH` gestartet wurde.

- **Drei schnelle Pushes** (3635449, 324cbb0, 119483a, je einzeln innerhalb weniger Sekunden): alle drei Läufe wurden in die Warteschlange aufgenommen, keiner ersetzt (`queue: max`); Lauf 2 → **v0.1.2** veröffentlicht.
- **APK-Update (Emulator):** v0.1.1 aus GitHub installiert, dann v0.1.2 aus GitHub mit `adb install -r` darüber: Erfolg, versionCode 1 → 2, gleiche Signatur.
- **Obtainium 1.7.0 (Emulator, offizielles x86_64-Release, SHA-256 geprüft):** Markdoist per Deep-Link `obtainium://app/<config>` mit `verifyLatestTag: true` eingetragen; zeigt v0.1.2 als installiert und aktuell.
- **Laufzeit:** Der Android-Release-Build dauert mit Reanimated/Worklets, Screens und WebView für vier ABIs rund 25–30 Minuten.

- **Verspätetes niedrigeres Release:** Lauf 4 (v0.1.4) wurde bewusst abgebrochen und nach v0.1.5 und v0.1.7 nachgeholt (Rerun, gleiche Laufnummer). Er veröffentlichte v0.1.4 um 17:22 mit `--latest=false` („Höhere Version 0.1.7 bereits veröffentlicht – v0.1.4 wird nicht Latest“); GitHub-Latest blieb v0.1.7, Obtainium zeigt v0.1.7 und bietet v0.1.4 nicht an. Damit ist „drei schnelle Pushes → drei Releases“ so belegt: alle drei Läufe wurden angenommen und keiner ersetzt; v0.1.2 und v0.1.3 direkt, v0.1.4 als nachgeholtes Release. Lauf 6 wurde abgebrochen, weil Lauf 7 denselben Stand plus Kennzahlen enthielt; Versionsnummern bleiben dadurch lückenhaft, aber steigend.
- **CI-RPM** v0.1.3 im Container `fedora:43`: `dnf install` und `dnf remove` erfolgreich, Version 0.1.3, Lizenzfeld `UNLICENSED`.

M0 ist damit vollständig abgenommen.

## M1 – Dateizugriff und frühe Abbruchtests

- **Desktop** (`apps/desktop/src/main/fsAdapter.ts`): Temp-Datei + `fsync` + `rename` + Ordner-`fsync`; exklusive Neuanlage per `link()`; Verschieben per `link()` + Quellprüfung + `unlink`; Journal unter `~/.config/markdoist/journal/<ordner-hash>/`. 20 Vitest-Tests, darunter Abbruch an jeder Phase für Schreiben, Neuanlage, Papierkorb und Umbenennen (AK-22), dritter Inhalt wird nicht überschrieben, Unterordner/Symlinks/versteckte Dateien werden nicht gelesen (AK-28).
- **Android** (`apps/mobile/modules/saf-storage`, Kotlin; `apps/mobile/src/storage/safAdapter.ts`): Ordnerwahl mit dauerhafter Freigabe nur für `com.android.externalstorage.documents`, Schreiben mit `"wt"` + `flush` + `sync` + Zurücklesen, Neuanlage mit `application/octet-stream` und Namensprüfung (`.md.txt` wird zurückbenannt), Journal und Schlüssel-Wert-Speicher im app-privaten Speicher. 21 Vitest-Tests mit simulierter SAF-Schicht (Abbruch an jeder Phase, voller Speicher, Journal nicht schreibbar, fehlende Freigabe).
- **Emulator:** Ordnerwahl über den SAF-Dialog, Lesen, chirurgisches Schreiben (nur `priority` und `dateModified` geändert), keine Temp-Reste.
- **[V]-Abweichungen:** Android verschiebt in den Papierkorb ausschließlich über den geprüften Weg Kopieren → Zurücklesen → Quelle erneut prüfen → Löschen; providerseitiges `moveDocument` wird nicht genutzt (einfacher, gleiche Garantien). Umbenennen nutzt `renameDocument` mit Namensprüfung.
- **Noch nicht im Emulator geprüft:** Berechtigung nach Geräteneustart (AK-23), entzogene Freigabe während der Nutzung, gleichzeitige externe Änderung per adb während des Schreibens.

## M2 – Dateiformat und Wiederherstellung

- Chirurgisches Schreiben mit Selbstprüfung (Golden-Test AK-07), Lese-Standards und Diagnosen nach 3.2, Formatversion (höher = schreibgeschützt, AK-37), Dateinamen (AK-43), Papierkorb (AK-24), Undo-Journal (50 Einträge, überdauert Neustart), lokale Entwürfe (AK-36), vollständiger Abgleich (AK-34), Einlesen schreibt nie (AK-08/09), Konfliktvarianten (AK-11, AK-33). `packages/core` und `packages/app`: zusammen über 140 Vitest-Tests.

## M3 – Datums- und Wiederholungskern

- `RecurrenceEngine` über rrule.js, eigener Tokenizer mit Positivliste (AK-19), Serienzustand und alle Aktionen aus 5.4, Abschnittsarchiv (AK-29, AK-41), Completion-Kollision (AK-30), COUNT/UNTIL (AK-32), stabiles Einlesen (AK-16), Idempotenz (AK-15), Eigenschaftstest Historienreihenfolge (AK-14), Monatsenden gegen python-dateutil-Fixtures (23 Regeln, AK-17), Sommerzeit (AK-18), Heute-Matrix (AK-04/05), Suche/Filter (AK-25). Alle Kern-Tests laufen in vier Zeitzonen.
- **[V]-Abweichung:** Die Regelvorschau läuft synchron statt in einem abbrechbaren Worker. Sie ist durch den rrule-Patch und den Suchhorizont begrenzt; gemessen: unmögliche Tagesregel ≤ 200 ms unter Hermes (Debug-Build), auf dem Desktop deutlich darunter. Ein Abbruch meldet „Berechnung zu aufwendig“, beendet nie eine Serie und schreibt nichts (AK-38).
- **Noch offen:** Offset-Importe (`due` mit `Z`) im Zusammenspiel mit Serien (AK-18, Teil „Completion-Basen behalten ihren Aktionstag“ ist im Kern getestet).

## M4 – Desktop-Oberfläche v1

- Seitenleiste mit Zählern, Listen, Detail mit Feldern, CodeMirror-Editor und Vorschau (Checkboxen zeilengenau), Filter, Suche, Tastaturbedienung nach 4.5, hell/dunkel, Snackbar mit Undo, Probleme-Ansicht mit Übernahme und Konfliktdialog (Feldvergleich und Body-Diff), Papierkorb. **13 Playwright-E2E-Tests grün** (`pnpm e2e:desktop`, Testuhr 12.10.2026).

## M5 – Android-Oberfläche v1 (Emulator)

- Untere Navigation, Suche, Plus-Button, Ziehen zum Neueinlesen, Wischgesten (rechts erledigt, links Aktionen), native Datums-/Zeitwahl mit „Uhrzeit hinzufügen“, WebView-Vorschau mit Checkboxen, App-Verknüpfung „Neue Aufgabe“ (`shortcuts.xml`, registriert laut `dumpsys shortcut`; Deep-Link `markdoist://capture`).
- **7 Maestro-Flows grün (Emulator, Development-Build)**: Ordnerwahl über den SAF-Dialog, Erfassung (AK-01), Verknüpfung/Deep-Link (AK-26), Wischen + Undo, Serie fortschreiben, Detail mit Autosave und Vorschau, Probleme (AK-09). Anschließende Dateiprüfung per adb (`apps/mobile/e2e/run.sh`). Testdaten werden relativ zum heutigen Datum erzeugt.
- **Gefundene und behobene Fehler:** Wischrichtung (Gesture Handler 3 meldet die Bewegungsrichtung), Notiz unter der Tastatur.
- **[V]-Abweichungen:** Farben als eigene Material-3-Palette statt `Color` aus `expo-router` (Expo Router ist laut Plan ausgeschlossen). Text innerhalb der WebView ist für Maestro nicht sichtbar; das Umschalten einer Checkbox in der Vorschau wurde per adb-Tap geprüft.
- **Release-APK v0.1.2 (Emulator):** alle 8 Maestro-Flows (inkl. Wiederholungseditor) und alle anschließenden Dateiprüfungen grün.
- **Tastatur (Release-APK, Emulator):** Beim Tippen in die Notiz rückt der Inhalt über die Tastatur, kein doppelter Versatz durch `KeyboardAvoidingView`.
- **AK-23 (Emulator):** nach `adb reboot` startet die App direkt mit der Aufgabenliste; die SAF-Freigabe blieb erhalten. Dateiname exakt `X.md`, keine Restbytes (Fake-Tests), externe Änderung beim Zurückwechseln: über den vollständigen Abgleich bei `AppState=active`.

## M6 – Wiederholungs-UI

- Gemeinsames Formularmodell (`packages/app/src/ruleForm.ts`, Tests): einfache Optionen, Monatsende-Abfrage (29./30./31., 29.02.), Ende nie/Datum/Anzahl, Art Kalender/ab Erledigung, Bezugsfeld, Abstand, erweiterte RRULE-Eingabe mit Validierung, Vorschau der nächsten 10 Termine, deutsche Beschreibung, „ab jetzt neu zählen“. Editor auf Desktop (E2E: wöchentlich 5-mal) und Android. Historienansicht mit Archivabschnitten auf beiden Plattformen; „Serie beenden“, „wiederöffnen“, „Wiederholung entfernen“.

## M7 – Gesamtrobustheit und Leistung

**Robustheit (Desktop, echte Oberfläche, Playwright):** harter Prozessabbruch (`SIGKILL`) mitten im Schreiben → Datei unverändert, beim Neustart Wiederherstellungsfall unter Probleme, keine Temp-Reste; externe Änderung bei laufender App per Watcher erkannt; externer Body + lokale Priorität bleiben beide erhalten; gleiche Frist extern und lokal → Konflikt ohne Überschreiben; Textkonflikt während der Eingabe mit „Meine Version / Datei-Version / Beide behalten“; Konfliktkopie mit Feldvergleich und Body-Diff. Insgesamt **19 Playwright-Tests grün**.

**Konfliktansicht:** beide Plattformen zeigen Feldvergleich und Body-Diff; Entscheidungen „Variante behalten“ (die andere wandert in den Papierkorb) und „Beide behalten“ (Kopie erhält neue ID).

**Abgleich:** Fortschritt („Prüfe Dateien n/N“) und Abbrechen sichtbar; ein abgebrochener Abgleich entfernt nichts und markiert die Anzeige als nicht vollständig geprüft. Fortschrittsmeldungen bauen den Index nicht neu auf.

**Leistung Desktop** (2 000 Aufgaben à ~3,3 KiB, echter `FsAdapter`, Messung `apps/desktop/bench/perf.test.ts`; Host: AMD Ryzen 7 8845HS, 16 Threads, 30 GiB, Fedora 43, Node 22):

| Messgröße | Ergebnis | Ziel |
|---|---|---|
| Cache-Anzeige beim zweiten Start | 0,31 s | < 2 s |
| Vollständiger Abgleich (Lesen + Hashen + Parsen) | 0,82 s | – |
| Suche „bettwasche schritt“ (1 400 Treffer) | 75 ms | < 100 ms |
| Heute-Ansicht berechnen | 8 ms | – |

**Leistung Android (Emulator)** – AVD `Markdoist_API_36` (API 36, x86_64, 4 vCPU, 4 GiB) auf dem obigen Host; Release-Build (Hermes), 2 000 Aufgaben à ~3,3 KiB im Ordner `Documents/MarkdoistPerf`; Messung `apps/mobile/e2e/perf.sh`, Werte aus der App selbst (Einstellungen → Kennzahlen, Suche → Dauer):

| Messgröße | Erste Messung (v0.1.7) | Nach Optimierung | Ziel |
|---|---|---|---|
| Anzeige aus Cache beim Kaltstart | 1,34 s | 1,70 s | < 3 s |
| Vollständiger SAF-Abgleich (Erststart, ohne Cache) | 38,4 s | 5,6 s | < 15 s |
| Vollständiger SAF-Abgleich (Kaltstart mit Cache) | – | 6,7 s | < 15 s |
| Suche „bettwasche schritt“ (1 400 Treffer) | 18 ms | 18 ms | < 100 ms |

Optimierungen: schneller Lesepfad für einfache Frontmatter (Auswerten 2 000 Dateien: 0,19 s), Stapel-Lesen mit sechs parallelen Zugriffen im SAF-Modul ohne zusätzliche Metadaten-Abfrage je Datei, Cache mit vorgeparsten Daten, Fortschrittsmeldungen höchstens alle 300 ms, Zähler nur bei geändertem Index. Die Werte gelten für den Emulator, nicht als Zusage für ein echtes Gerät. Die Oberfläche blieb während des Abgleichs bedienbar (Maestro-Flows liefen parallel zum Abgleich).

**[V]-Abweichungen M7:**
- Schneller Frontmatter-Lesepfad (`packages/core/src/fastyaml.ts`) neben der `yaml`-Bibliothek: nur zum Lesen einfacher Frontmatter, alles Ungewöhnliche fällt auf die Bibliothek zurück; ein Eigenschaftstest (4 000 Zufallsfälle) vergleicht beide. Geschrieben wird weiterhin nur über die Bibliothek.
- Die Testabbrüche auf dem Desktop nutzen einen nur per Umgebungsvariable aktivierbaren Haken (`MARKDOIST_TEST_CRASH=<art>:<phase>`), der den Prozess mit `SIGKILL` beendet; `process.exit` liefe in Electron noch weiter und wäre kein echter Absturz.

## M8 – Version 1.0

- Version 1.0 über den Release-Workflow: **v1.0.8** und **v1.0.9** (Commit `24a25fa`) mit genau einer APK und einem RPM, v1.0.9 ist Latest.
- **v1.0.10** (Commit `2aa6cc1`, 18.10.2026) mit den Nachträgen unten: genau eine APK und ein RPM, Latest. **Release-APK im Emulator:** v1.0.9 aus GitHub installiert, v1.0.10 per `adb install -r` als Update (versionCode 9 → 10), beide mit dem Zertifikat aus `MARKDOIST_CERT_SHA256`; danach **alle 11 Maestro-Flows und 13 Dateiprüfungen grün** gegen die Release-APK (`MAESTRO_DEV=false`). RPM v1.0.10 im Container `fedora:43`: `dnf install`/`dnf remove` erfolgreich, `UNLICENSED`, Desktop-Eintrag vorhanden.
- **RPM v1.0.9 im Container `fedora:43` (18.10.2026, zweiter Rechner):** `dnf install` aus der Release-Datei erfolgreich, Version 1.0.9, Lizenz `UNLICENSED`, Desktop-Eintrag `markdoist.desktop`, `/usr/bin/markdoist`; `dnf remove` erfolgreich.

## Nachträge nach Abgleich mit der Spezifikation (18.10.2026)

Ein vollständiger Abgleich von PLAN1.md (Abschnitte 1, 3–7, 9) mit dem Code hat Lücken gezeigt, die jetzt geschlossen sind:

- **Wiederholungen:** Vorschau vor dem Erledigen bzw. Wiederöffnen (Folgetermin, übergangene erledigte oder übersprungene Termine nach 5.2) und im Regeleditor (neuer Abschnitt oder nicht, neue Frist/Planung, abgelöster überfälliger Termin, aufgelöste Einzelverschiebung, „keine Änderung“). „Serie mit neuer Regel fortsetzen“ für erschöpfte Serien, künftige Ausnahmen bei Regeländerung nur nach ausdrücklicher Auswahl, weitere Ausnahmen per Datum. Android hat jetzt beide Varianten von „Serie beenden“ und beschriftet die Historie mit Regel und Abschlussgrund.
- **Kern:** geleerter Abstand entfernt `recurrence_offset_days`; Einzelverschieben einer Fremddatei ohne `recurrence_instance` hält K fest; Hinweis auf einen nicht zur Regel passenden Start; Offset-Werte im anderen Datumsfeld behalten beim Fortschreiben ihre lokale Uhrzeit und ihren Kalendertag (AK-18); deutsche Beschreibung für „am 29. oder letzten Tag“; Erledigt → In Arbeit bleibt „In Arbeit“; C1-Steuerzeichen in Dateinamen.
- **Bedienung:** „Rückgängig“ erscheint nur nach rücknehmbaren Aktionen (nicht nach „Papierkorb leeren“, „Variante behalten“, Wiederherstellung). Fristen mit Offset werden im Detail in Ortszeit angezeigt; die Termin-Aktionen im Android-Wischmenü behalten eine gesetzte Uhrzeit. Mehrfachauswahl für Status und Priorität (ODER), Eingangssortierung auf Android umschaltbar, Filter gelten auch in der Android-Suche. Hinweise (z. B. fehlender Titel) erscheinen im Detail.
- **Entscheidung 18.10.2026:** Das Statusfeld einer Serie bietet kein „Erledigt“ an; Erledigen und Beenden nur über die Serienknöpfe.
- **Robustheit (7.1, 7.3, 7.6):** Schlägt die Verzeichnisabfrage fehl, bleibt der letzte Stand sichtbar und schreibgeschützt. Ein angeforderter Vollabgleich folgt einem laufenden Teilabgleich. Entwürfe, Undo-Einträge und die geöffnete Aufgabe folgen einer externen Umbenennung über die ID. Offene Journalfälle sperren Schreiben auf dieselbe Datei und erscheinen sofort unter Probleme (nicht erst beim Neustart). Wiederherstellungsfälle zeigen aktuellen Stand, Ausgangs- und gewünschte Fassung; beide Fassungen lassen sich unter Hash-Vorbedingung übernehmen (AK-22). „Meine Version“ im Textkonflikt prüft erneut den Hash der verglichenen Fassung (AK-10). Nach einem Speicherfehler: „Erneut speichern“ und „Als neue Datei speichern“; ungespeicherte Entwürfe stehen nach dem Neustart unter Probleme. Neuanlage und Übernahme prüfen den erzeugten Text vor dem Schreiben. Der Aktionszeitpunkt wird beim Einreihen festgehalten. Die Konfliktansicht vergleicht beliebig viele Varianten.
- **Tests:** 284 Vitest-Tests in vier Zeitzonen (neu u. a. `packages/core/test/acceptance.test.ts`, `packages/app/test/acceptance.test.ts`, `robustness.test.ts`, `selfcheck.test.ts`; AK-37 ist jetzt vollständig belegt), **26 Playwright-Tests** (neu: Vorschau vor dem Erledigen, Ausnahmen übernehmen, Serie fortsetzen, Mehrfachfilter und Offset-Frist, Papierkorb leeren ohne Rückgängig).

**Android (Emulator, 18.10.2026, zweiter Rechner):** neue AVD `Markdoist_API_36` (API 36, x86_64, 4 vCPU, 4 GiB), Development-Build (x86_64) mit Metro, Expo-MCP für Screenshots und Taps.
- **11 Maestro-Flows grün, zweimal hintereinander**, mit allen 12 Dateiprüfungen per adb. Neu: `43-series-preview` (Vorschau vor dem Erledigen, übergangene Ausnahme, beide Varianten von „Serie beenden“), Mehrfachauswahl im Filter-Flow.
- Per MCP-Screenshot geprüft: Serien-Detail (Statusfeld ohne „Erledigt“, Frist mit Wochentag, „Beim Erledigen:“-Vorschau, Ausnahme-Chips mit „Weiteren Termin …“, Historie mit Regel), Filterblatt mit fester Fußzeile.
- **Ordner verschwindet während der Nutzung** (per adb umbenannt): letzter Stand bleibt sichtbar mit „Ordner konnte nicht gelesen werden: Ordner nicht lesbar – letzter bekannter Stand, schreibgeschützt“; Erledigen wird mit „Ordner nicht erreichbar – … schreibgeschützt“ abgewiesen; nach dem Zurücklegen und Neueinlesen arbeitet die App normal. Damit ist auch der Fall „fehlende Freigabe“ aus M1 im Emulator abgedeckt (gleicher Fehlerpfad).
- **Externe Änderung während der Bearbeitung** (Body per adb ergänzt, danach in der App getippt): kein Überschreiben; nach Neustart steht der Entwurf unter Probleme mit „Meine Version / Datei-Version behalten / Als neue Datei speichern / Verwerfen“; „Datei-Version behalten“ entfernt den Entwurf, die Datei bleibt unverändert.
- Gefunden und behoben: Filterblatt-Knöpfe rutschten aus dem Bild (jetzt feste Fußzeile); Filtersymbol `⏷` fehlte in der Android-Schrift (jetzt `▾`); technische Expo-Fehlerkette in Meldungen (jetzt nur die Ursache); Entwurf mit Konflikt bot nach Neustart keine Entscheidung an. Maestro: `hideKeyboard` drückt unter Android 16 „Zurück“ und verließ das Detail; die Snackbar verdeckte den Editor – Flows entsprechend angepasst.
- Lokaler Build auf diesem Rechner: Temurin JDK 21 in `~/.local/opt/jdk-21` (nur JDK 25 vorhanden), Maestro 2.11.0 in `~/.maestro`; der erste Gradle-Build dauert rund 20 Minuten. Mit 15 GB RAM laufen Emulator, Metro und ein Gradle-Daemon nicht zuverlässig gleichzeitig – den Gradle-Daemon nach dem Build beenden.

**Android (Emulator, 21.10.2026, Stand `df583f4`):** Development-Build mit Metro, AVD `Markdoist_API_36`, nach den Korrekturen R1–R9 aus `docs/REVIEW-2026-10-19.md`.
- **11 Maestro-Flows und 13 Dateiprüfungen grün** (`MAESTRO_DEV=true apps/mobile/e2e/run.sh`). Betroffen von den Korrekturen: Listen und Suche senden `completeOccurrence` mit angezeigtem Vorkommen (R6), SAF-Recovery behält dritte Fassungen (R7), Regelformular (R8), Entwurfsrevision beim Autosave (R1).
- Erster Durchlauf scheiterte in Flow 00 am kalten Metro-Bundle (27 s); der Wiederholungslauf mit warmem Bundle war vollständig grün. Für einen frischen Metro-Start die App einmal vorab laden.
- Nicht im Emulator geprüft: die neuen Recovery-Fälle aus R7 (nur über die simulierte SAF-Schicht) und R2/R4/R5 (nur Unit-Tests).

**Abhak-Animation und Snackbar-Lage (23.10.2026):** gemeinsamer Ablauf `completionFlow` (PLAN1 4.4), Vorlage war eine Bildschirmaufnahme einer anderen App.
- Desktop: 28 Playwright-Tests grün, neu „Abhaken per Klick“. Bildfolge per Playwright-Screenshots geprüft: Haken sofort, etwa 250 ms halten, Ausblenden, Lücke klappt ein.
- Android: Release-Build x86_64 (mit dem Debug-Keystore signiert, AVD `Markdoist_API_36`), alle Maestro-Flows und 13 Dateiprüfungen grün; 30 und 31 prüfen jetzt, dass die Zeile vor „Rückgängig“ verschwunden ist. Per `screenrecord` Bild für Bild geprüft: Haken springt auf, Zeile blendet aus, die Zeilen darunter gleiten nach oben; die Snackbar steht über dem Plus-Button.
- Gefunden und behoben: RN-`LayoutAnimation` greift unter Fabric mit Reanimated 4 nicht (Lücke sprang) – jetzt Reanimated-Layout-Übergang am FlashList-Zellbehälter, nur während des Einklappens. Beim Ausblenden schienen die Wischaktionen durch die Zeile – während des Ablaufs ohne Wischaktionen. Die Snackbar-Lage ging beim Tabwechsel verloren (Abmeldung des alten Tabs nach Anmeldung des neuen) – jetzt Anmeldeliste, die zuletzt angemeldete Lage gilt.
- Nicht geprüft: reduzierte Bewegung (System-Einstellung) auf beiden Plattformen und ein echtes Gerät.
- Die App auf dem AVD ist jetzt mit dem Debug-Keystore signiert: vor dem nächsten Release-Install dort deinstallieren (sonst `INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
- Aufgefallen, nicht behoben (älter als diese Änderung): Beim Wischen nach rechts erscheint das graue Feld „Aktionen“ statt des roten „Erledigen“; die Aktion selbst erledigt korrekt.

**Testrunde Wiederholungen (23.10.2026):** systematische Prüfung aller Wiederholungsvarianten, Bericht in `docs/TEST-WIEDERHOLUNGEN.md`.
- Neu: Invarianten-Orakel (`packages/core/test/seriesOracle.ts`), Variantenmatrix mit 1159 Fällen, fast-check-Simulation, 51 dateutil-Golden-Regeln, Repository-Tests für Serienaktionen. 2119 Vitest-Tests grün in vier Zeitzonen.
- Behoben: Fremddateien ohne `recurrence_start` zählten COUNT nach jedem Fortschreiben neu (Serie endete nie) – Start wird jetzt beim ersten Schreiben festgehalten; clarify-Vorschlag rechnete den Abstand in UTC; Tipp auf eine gesperrte Serie sprang stumm zurück, jetzt mit Grund.
- Entschieden (Fragen-Tool, 23.10.2026): „ab Erledigung“ ohne BY-Teile rechnet als fester Abstand mit Klemmen ans Monatsende (31.10. + 1 Monat = 30.11., vorher 31.12.); Kalender-COUNT bei versäumten Terminen bleibt wie in PLAN1 5.2.

**Korrekturen nach dem Review Wiederholungen (24.10.2026):** Befunde R1–R7 aus `docs/REVIEW-WIEDERHOLUNGEN-2026-10-23.md` behoben, Einzelheiten in `docs/TEST-WIEDERHOLUNGEN.md`.
- `pnpm test:tz` mit 4.699 Tests grün in vier Zonen, `pnpm typecheck` und `pnpm lint` grün, `pnpm e2e:desktop` 28 Playwright-Tests grün. Die Original-Suite des Reviews (2.572 Tests, vorher 68 rot) läuft vollständig grün.
- Neu im Repository: 1.357 dateutil-Vergleichsfälle und 1.200 Completion-Referenzfälle als eingefrorene Fixtures, Regressionssperren R1–R7, Android-Flows 46–48 mit Dateiprüfungen.
- Gradle: Config-Plugin `withWorkspaceBundleInputs` registriert `packages/core/src`, `packages/app/src`, `patches/` und die Lockdatei als Inputs von `createBundle…JsAndAssets`. Lokal nachgewiesen: ohne Änderung UP-TO-DATE, nach Änderung in `packages/core` neu gebündelt.
- Android (Emulator `Markdoist_API_36`, API 36): Release-Build x86_64, mit dem Debug-Keystore des Projekts signiert. **15 Maestro-Flows und 20 Dateiprüfungen grün** (`apps/mobile/e2e/run.sh`), darunter neu 46 Monatsende bei „ab Erledigung“ (31.10. → 30.11., Checkliste zurückgesetzt), 47 BYSETPOS mit COUNT (Serie bleibt offen, Folgetermin 02.11.) und 48 gesperrte Serie (Meldung, Datei byte-identisch). Die Seeds liegen im Jahr 2099, damit die Flows nicht vom Testtag abhängen.
- Hinweis Emulator: Die fensterlose Variante (`-no-window`, `qemu-system-x86_64-headless`, Emulator 37.1.11) stürzt auf diesem Rechner beim Start mit SIGSEGV ab; mit Fenster läuft sie.
- Nicht geprüft: echtes Gerät, Synchronisation zwischen mehreren Geräten.

**[V]-Abweichungen:**
- Ausnahmen werden nur bei Kalenderserien angeboten. Eine Serie „ab Erledigung“ hat kein festes künftiges Raster; ihr aktuelles Vorkommen wird mit „Überspringen“ bearbeitet.
- Texte: Die gemeinsamen Begriffe (Ansichten, Felder, Aktionen, Speicherzustände, Vorschau) stehen in `packages/app/src/texts.ts`; einzelne bildschirmspezifische Beschriftungen stehen weiter im jeweiligen Oberflächencode.

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

**Offen in M0:** verspätetes niedrigeres Release (Lauf 4 bewusst abgebrochen und nach v0.1.5 nachgeholt, muss `--latest=false` erhalten; Obtainium darf es nicht anbieten).

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

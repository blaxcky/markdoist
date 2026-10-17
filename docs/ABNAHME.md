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

**Offen in M0:**
- Drei schnelle Pushes → drei Releases, Rerun-No-op, Latest-Prüfung: nach dem ersten Push auf GitHub.
- APK-Update im Emulator (gleiche Signatur, höherer versionCode) mit der Release-APK aus GitHub.
- Obtainium-Auswahl im Emulator.
- **Expo-MCP (Screenshot/Tap):** braucht die einmalige Anmeldung `pnpm --filter mobile exec expo login` durch dich (Plan 10.2). Bis dahin prüfe ich per `adb`-Screenshot und Logcat.

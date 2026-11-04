# Markdoist – Hinweise für Codex

Spezifikation und Entwicklungsplan stehen in `PLAN1.md`. Bisherige Entscheidungen des Nutzers stehen in `FRAGEN.md` (F001–F018, abgeschlossen).

## Rückfragen an den Nutzer

- Stelle Rückfragen **nie im Chat und nie über das AskUserQuestion-Tool**.
- Nutze dafür immer das **Fragen-Tool** über den Skill `fragen` (`/fragen`). Der Skill beschreibt Dateiformat und Ablauf.
- Kurzfassung des Ablaufs:
  1. Alle Fragen, die du jetzt brauchst, gesammelt in eine neue Datei `.fragen/<YYYY-MM-DD-HHMM>-<thema>.md` schreiben, im Format des Skills.
  2. Die GUI öffnen: `setsid -f fragen-tool "<absoluter pfad>" >/dev/null 2>&1`
  3. Zug beenden und auf „fertig“ des Nutzers warten. Keine Antworten raten, Optionen nie selbst anhaken.
  4. Nach „fertig“ die Datei neu lesen, Entscheidungen kurz zusammenfassen und in `PLAN1.md` einarbeiten.
- Folgefragen zum selben Thema an dieselbe Datei anhängen, Nummerierung fortsetzen, `status: offen` setzen.
- Frage nichts, was du selbst aus Code, Doku oder Kontext klären kannst.
- `FRAGEN.md` bleibt als Archiv der Runden 1 und 2 unverändert. Neue Fragen kommen nicht mehr dorthin.

## Commit und Push

- Jede abgeschlossene Änderung sofort committen und pushen, ohne Nachfrage. Nicht erst am Ende einer Sitzung.
- Vor dem Push mit dem Remote abgleichen: `git pull --rebase markdoist main`.
- Gepusht wird **nur an `markdoist`**: `git push markdoist HEAD:refs/heads/main`. Nie an `origin` (privater, alter Planungsstand).
- Jeder Push auf `main` startet den Release-Workflow (APK, RPM, Obtainium-Update). Darum vorher Typecheck, Tests und die passenden E2E-Läufe grün haben. Ungetestete Zwischenstände gehen auf den Nebenzweig `ci-check` (löst nur `ci.yml` aus).

## Android-E2E

- **Gerät: Genymotion**, nicht der Android-Emulator. Der Android-Emulator (`Markdoist_API_36`) stürzt auf diesem Rechner unter Mesa/Intel UHD ab: gfxstream bekommt keinen GL-Kontext („null ctx“). Nur `-gpu host` bootet, und auch das stürzt in etwa einem von drei Läufen ab. `swiftshader_indirect`, `guest` und `-no-window` stürzen schon beim Start ab (Stand 04.11.2026, Mesa 26.2.6, Emulator 37.2.12).
- Genymotion 3.11.0 liegt in `~/genymotion`, Gerät „Google Pixel 7“ (Android 15, API 35, adb `127.0.0.1:6555`). Starten: `~/genymotion/gmtool admin start "Google Pixel 7"` (`stop` entsprechend). Geräte anlegen geht mit der kostenlosen Lizenz nur in der Genymotion-Oberfläche.
- Genymotion nutzt die Navigationsleiste mit drei Knöpfen. Damit fallen Blätter und Knöpfe auf, die unter der Leiste liegen; die Gestensteuerung des Emulators verdeckt das. Unten immer `useSafeAreaInsets().bottom` als Abstand halten, Modals mit `statusBarTranslucent navigationBarTranslucent` (Vorbild `src/components/menu.tsx`).
- Release-Build für den Test (x86_64, mit dem Debug-Schlüssel signiert):
  ```bash
  cd apps/mobile/android && ANDROID_HOME=$HOME/Android/Sdk JAVA_HOME=$HOME/.local/opt/jdk-21 MARKDOIST_KEYSTORE=$PWD/app/debug.keystore MARKDOIST_KEYSTORE_PASSWORD=android MARKDOIST_KEY_ALIAS=androiddebugkey MARKDOIST_KEY_PASSWORD=android ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
  ```
  Dann `adb install -r app/build/outputs/apk/release/app-release.apk` und `bash apps/mobile/e2e/run.sh`. Der Lauf dauert etwa 10–15 Minuten, darum im Hintergrund starten.
- „FAILED“ innerhalb eines `retry`-Blocks ist kein Fehler, solange der Block mit „COMPLETED“ endet. Maßgeblich ist der Exit-Code von `run.sh` und dass keine `FEHL`-Zeile erscheint.
- Bei Fehlschlägen die Screenshots in `~/.maestro/tests/<zeitpunkt>/` ansehen; sie zeigen oft sofort, ob die App oder der Test schuld ist.
- Während Emulator oder Genymotion laufen, überschreiten einige rechenlastige Vitest-Dateien (`dateList`, `dateutil`, `engine`, `review-2026-10-24`) die Zeitgrenze von 5 s. Einzeln nachlaufen lassen; einzeln sind sie grün.
- Nie `pkill -f qemu-system` aus einer Bash-Shell, deren Befehlszeile das Muster enthält: Das beendet die eigene Shell. Den Emulator mit `adb emu kill` beenden.

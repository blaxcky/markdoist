# Markdoist

Persönliche, lokal arbeitende Todo-App: **eine Markdown-Datei pro Aufgabe** mit YAML-Frontmatter in einem frei wählbaren Ordner (z. B. in einem Obsidian-Vault). Desktop: Electron auf Fedora (RPM). Android: React Native mit Expo (APK über Obtainium). Ein externes Sync-Programm gleicht den Ordner ab; die App selbst synchronisiert nichts.

Spezifikation und Entwicklungsplan: [`PLAN1.md`](PLAN1.md). Abnahmenotizen der Meilensteine: [`docs/ABNAHME.md`](docs/ABNAHME.md).

## Installation

Jeder Push auf `main` erzeugt ein [GitHub-Release](https://github.com/blaxcky/markdoist/releases) mit genau einer APK und einem RPM.

- **Fedora:** RPM von der Release-Seite laden, dann `sudo dnf install ./markdoist-<version>.x86_64.rpm`. Updates mit demselben Befehl.
- **Android (Obtainium):** App hinzufügen mit der Quelle `https://github.com/blaxcky/markdoist`. In den Obtainium-Einstellungen der App die Option zur Beachtung von GitHubs „Latest“-Markierung aktivieren, damit nachgeholte ältere Releases nie als Update angeboten werden.

## Entwicklung

```bash
corepack enable || npm i -g pnpm
pnpm install
pnpm test:tz          # Vitest in vier Zeitzonen
pnpm lint && pnpm typecheck
pnpm e2e:desktop      # Playwright gegen die Electron-App
pnpm --filter desktop dev
```

Android (Development-Build, kein Expo Go): `pnpm --filter mobile exec expo prebuild --platform android --clean`, dann `./gradlew assembleDebug -PreactNativeArchitectures=x86_64` in `apps/mobile/android` und `pnpm --filter mobile start` (ohne `CI=1`, sonst keine Dateiüberwachung). Android-E2E: `MAESTRO_DEV=true apps/mobile/e2e/run.sh` mit laufendem Emulator.

Struktur: `packages/core` (plattformfreier Kern), `packages/app` (Speichervertrag, Repository, Texte), `apps/desktop` (Electron), `apps/mobile` (Expo).

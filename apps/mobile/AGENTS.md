# apps/mobile – Hinweise

Verbindlich ist `PLAN1.md` im Repository-Wurzelverzeichnis. Es hat Vorrang vor allgemeinen Expo-Empfehlungen:

- **Keine Expo Router**, Navigation mit React Navigation (Plan 2.2).
- **Kein EAS, kein Expo Go.** Development-Build mit `expo-dev-client`; Release-APK baut GitHub Actions per `expo prebuild` + Gradle (Plan 10.2).
- Pakete mit `pnpm exec expo install <paket>` installieren.
- Expo-Doku immer versioniert lesen: https://docs.expo.dev/versions/v58.0.0/
- Der gemeinsame Kern liegt in `packages/core`, Zustand/Texte in `packages/app`.

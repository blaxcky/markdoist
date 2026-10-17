---
fragen-tool: 1
titel: Markdoist – GitHub-Repository, Lizenz, Expo-Anmeldung
status: beantwortet
---

M0 ist lokal fertig: Kern mit 165 Tests (4 Zeitzonen), Desktop-App mit 13 grünen Playwright-Tests, RPM installierbar in Fedora 43, signierte Release-APK gebaut, Expo-Development-Build läuft im API-36-Emulator. Für das erste Release fehlt nur noch GitHub. Ich arbeite währenddessen an der Android-Oberfläche und dem SAF-Modul weiter.

## 1. Wie soll das öffentliche Repository `blaxcky/markdoist` angelegt werden?
<!-- typ: einfach -->

Der Plan gibt das Anlegen frei (F015), aber der Auto-Modus von Claude Code hat `gh repo create … --public` als „öffentliche Oberfläche“ blockiert. Ich umgehe das nicht. Danach folgen: vier Secrets setzen (`MARKDOIST_KEYSTORE_BASE64`, `MARKDOIST_KEYSTORE_PASSWORD`, `MARKDOIST_KEY_ALIAS`, `MARKDOIST_KEY_PASSWORD`), eine Variable `MARKDOIST_CERT_SHA256`, Push eines Prüfzweigs, dann Push auf `main` (= erstes Release).

- [x] Ich erlaube es dir (empfohlen) — du legst an, setzt Secrets und pushst; ich bestätige die Freigabe im Claude-Code-Dialog bzw. per Berechtigungsregel für `gh repo create` und `git push`
- [ ] Ich lege das Repository selbst an — z. B. `gh repo create blaxcky/markdoist --public --source /home/markus/GitHub/local-first-todo --remote origin`; danach machst du Secrets und Push
- [ ] Vorerst privat anlegen — Abweichung von F015; Obtainium braucht dann ein Token
- [ ] Noch nicht — erst später veröffentlichen

<!-- antwort -->
<!-- /antwort -->

## 2. Unter welcher Lizenz soll der Quellcode im öffentlichen Repository stehen?
<!-- typ: einfach -->

Bisher ist keine Lizenz festgelegt. Ohne Lizenzdatei gilt „alle Rechte vorbehalten“: einsehbar, aber nicht frei weiterverwendbar. Das RPM braucht ein Lizenzfeld (derzeit `UNLICENSED`).

- [x] Keine Lizenz (empfohlen) — alle Rechte vorbehalten, später jederzeit änderbar
- [ ] MIT — sehr freizügig
- [ ] GPL-3.0 — Weitergaben müssen ebenfalls offen bleiben
- [ ] Apache-2.0 — freizügig mit Patentklausel

<!-- antwort -->
<!-- /antwort -->

## 3. Kannst du die Expo-CLI einmal anmelden, damit ich den Expo-MCP für Screenshots und Taps im Emulator nutzen kann?
<!-- typ: einfach -->

Plan 2.3/10.2: Ich gebe keine Zugangsdaten ein. Befehl im Projektordner: `pnpm --filter mobile exec expo login`, Prüfung mit `pnpm --filter mobile exec expo whoami`. Ohne Anmeldung prüfe ich weiter über `adb`-Screenshots und Maestro; die Abnahme hängt ohnehin an Maestro.

- [x] Erledigt, ich habe mich angemeldet
- [ ] Mache ich später
- [ ] Expo-MCP nicht nutzen — nur adb und Maestro

<!-- antwort -->
<!-- /antwort -->

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

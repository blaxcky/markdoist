# Testrunde Wiederholungen (23.10.2026)

Ziel: Nachweis, dass eingestellte Wiederholungen bei jeder unterstützten Variante zuverlässig fortgeschrieben werden und nie stillschweigend liegen bleiben. Stand: `main` ab `c88be17` plus die hier beschriebenen Änderungen.

## Wie die Fortschreibung funktioniert

Es gibt keinen Hintergrundjob. Eine Serie wird beim Erledigen oder Überspringen des aktuellen Vorkommens K fortgeschrieben (`packages/core/src/actions.ts`, `planSeries`). Der nächste Termin wird aus der Regel berechnet (`packages/core/src/recurrence/engine.ts`, rrule.js im floating-Modus), ins Bezugsfeld geschrieben und mit dem Abstand ins andere Datumsfeld übertragen (PLAN1 5.2, 5.3). Fehler können also nur an drei Stellen entstehen: falscher Folgetermin, stilles Nicht-Schreiben (Plan `blocked`/`noop`), Verlust über Repository oder Oberfläche.

## Vorgehen

| Ebene | Datei | Inhalt |
|---|---|---|
| Orakel | `packages/core/test/seriesOracle.ts` | Nachbedingungen jeder Serienaktion: Plan ist `edit`, K′ > max(K, Aktionstag) bzw. K′ > Erledigungstag, K′ nicht in C∪S, K′ Regeltermin (Kalender), Bezugsfeld = K′ + Serienuhrzeit, anderes Feld = K′ + Abstand mit eigener Uhrzeit, C/S um genau K ergänzt, `last_completed_at` nur beim Erledigen, Checklisten zurückgesetzt, Phase wieder `active`, Regeltext und unbekannte Felder byte-identisch, Vorschau = Ergebnis, erneute Aktion = `noop`. Bei Serienende: Orakel bestätigt die Erschöpfung unabhängig, `status: done`, K bleibt, kein Checklisten-Reset. Der Folgetermin wird zusätzlich über einen zweiten Rechenweg (`from` statt `after`, ohne `exclude`) und bei einfachen Completion-Regeln über festen Abstand ab B gegengerechnet. |
| Variantenmatrix | `packages/core/test/recurrence-matrix.test.ts` | (36 Kalenderregeln + 11 Completion-Regeln) × 4 Enden (nie, COUNT=1, COUNT=3, UNTIL) × 5 Szenarien = 940 Einzelschritte (Herkunft, Uhrzeit, Bezugsfeld, Abstand, Aktionstag, Historie, Status) als Einzelschritt, dazu je Regel und Ende ein Durchlauf bis zum Serienende bzw. acht Schritte mit Erledigen/Überspringen im Wechsel. Gesperrte Zustände (clarify, K in S, Widerspruch, Ende nicht übernommen, ungültig, nicht unterstützt, Strukturfehler, kein Vorkommen) an drei Lesetagen: nichts wird geschrieben, Aufgabe bleibt sichtbar mit Diagnose. Heute-Ansicht nach dem Fortschreiben. Zeitumstellungen 29.03. und 25.10.2026 in vier Zonen. Completion-Basis in Kiritimati und Los Angeles. |
| Simulation | `packages/core/test/recurrence-sim.test.ts` | fast-check: 150 zufällige Folgen aus 10–40 Schritten (erledigen, überspringen, Tage, Einzelverschieben, Abstand ändern) auf 24 Regeln × Uhrzeit × Bezugsfeld × Abstand; jeder Schritt durch das Orakel; Schlüssel streng steigend; am Ende Regeländerung mit Neustart und Archivprüfung. |
| Golden-Fixtures | `packages/core/test/fixtures/dateutil.json` | 23 → 51 Regeln gegen python-dateutil 2.9.0 (Monatsenden, BYSETPOS, INTERVAL mit Monatsende, WKST, UNTIL mit Uhrzeit, Schalttage). |
| Repository | `packages/app/test/repository-series.test.ts` | Doppeltipp, externe Änderung an fremdem Feld (übernommen) und an Frist/Historie/Regel (Konflikt, 0 Schreibvorgänge), Undo byte-identisch und erneutes Erledigen, „in Arbeit“ → „offen“, Statusauswahl „erledigt“, Tipp auf clarify-Serie, Aktionszeitpunkt = Tipp. |
| Abhak-Ablauf | `packages/app/test/completionFlow.test.ts` | gesperrte Serie meldet den Grund statt stummem Zurückspringen. |
| Formularkette | `packages/app/test/formChain.test.ts` | alle 288 Formularvarianten (`forms.ts`): Vorschau → Serie anlegen → erstes Vorkommen erledigen; erster Termin = Vorschau, Folgetermin = zweiter Vorschautermin. |
| Oberfläche | Playwright (Desktop), Maestro (Android, nicht erneut gelaufen) | bestehende Flows „Vorkommen erledigen schreibt nächsten Termin“, „Wiederholung anlegen“, Vorschau, Ausnahmen, Serie fortsetzen. |

Läufe: `pnpm test` 2119 Tests grün; `pnpm test:tz` grün in Europe/Berlin, UTC, America/Los_Angeles, Pacific/Kiritimati; `pnpm typecheck` und `pnpm lint` grün; `pnpm e2e:desktop` 28 Playwright-Tests grün.

## Geprüfte Varianten

| Dimension | Werte |
|---|---|
| Frequenz (Kalender) | täglich, alle 3 Tage; werktags; wöchentlich Mo / Di+Do / Sa+So alle 2 Wochen (WKST MO und SU) / Mo–Fr alle 2 Wochen / ohne BYDAY; monatlich am 1., 15., 28., 29., 30., 31., am letzten Tag, „29. oder letzter“, „30. oder letzter“, alle 2 Monate letzter Tag, alle 3 Monate am 15., 1. Mo, 2. Di, 4. So, letzter Fr, letzter Werktag; jährlich (mit und ohne BYMONTH/BYMONTHDAY), alle 2 Jahre, 29.02. (nur Schaltjahre), letzter Februartag, alle 2 Jahre am 31.01., 30.04., BYYEARDAY, BYWEEKNO, 1. Mo im September; `RRULE:`-Präfix |
| Frequenz (ab Erledigung) | täglich, alle 3 Tage, wöchentlich, alle 2 Wochen, monatlich, alle 2 Monate, jährlich, alle 2 Jahre; Fremdregeln mit BY-Teilen (Mo/Mi/Fr, letzter Tag, 1. Mo) |
| Ende | nie, COUNT=1, COUNT=3 (Kalender zählt Regeltermine, Completion zählt Erledigungen, Skips zählen nicht), UNTIL als Datum, UNTIL mit 23:59:59 bei Serienuhrzeit |
| Uhrzeit | ohne; 09:30; 02:30 und 23:45 über die Umstellungen |
| Bezugsfeld / Abstand | due oder scheduled; anderes Feld leer / abgeleitet (−1 Tag, mit eigener Uhrzeit) / explizit +3 / explizit 0 mit Offset-Zeitstempel |
| Aktionstag | am Tag von K, 2 Tage davor, 1 Tag danach, 40 Tage danach, 23:59 und 00:30 lokal |
| Historie | leer; frühere Erledigungen; Ausnahme auf dem nächsten Termin; K in C; K in S; K in C und S |
| Herkunft | App-erzeugt (alle Felder); Fremddatei nur mit `recurrence` und Datum; ohne `format_version`; mit Revision ohne Start; TaskNotes-`DTSTART:`-Form inkl. `Z` |
| Status | offen; in Arbeit |

## Befunde

### Behoben

1. **Fremddatei ohne `recurrence_start`: COUNT endete nie, das Raster wanderte mit.** Der Start wurde beim Lesen aus `recurrence_instance` bzw. dem Datumsfeld abgeleitet und nicht gespeichert; nach jedem Fortschreiben begann COUNT wieder bei K′ (`FREQ=WEEKLY;BYDAY=MO;COUNT=3` lief endlos). Außerdem erkannte eine wartende zweite Aktion (Doppeltipp) die Datei nicht mehr wieder und meldete „Serie wurde geändert“. Fix: Beim ersten Schreiben einer Serienaktion wird neben der Revision auch der beim Lesen abgeleitete `recurrence_start` festgehalten (`packages/core/src/actions.ts`, `planSeries`; dokumentiert in `docs/DATEIFORMAT.md`). Ein Fremdtermin neben dem Raster bleibt als Info-Hinweis sichtbar, COUNT zählt wie zuvor erst ab dem ersten Regeltermin. Tests: „Befunde dieser Testrunde“ in der Matrix.
2. **Anzeige des clarify-Vorschlags rechnete den Abstand in UTC**, das Fortschreiben in der Gerätezone (`views.ts` vs. `actions.ts`). Bei Datumswerten mit Offset wich das angezeigte andere Datum um einen Tag ab. Fix: Zeitzone wird durchgereicht, Cache je Zone (`packages/core/src/views.ts`).
3. **Stummer No-op beim Tipp auf eine gesperrte Serie** (Fortschreibung klären, Widerspruch, ungültige Regel): Der Kern schreibt nach 5.4 bewusst nichts; bei bereits aufgelöstem K ist das Ergebnis `noop`, das beide Oberflächen nicht melden. Der Haken sprang kommentarlos zurück. Fix: `completionFlow.start` meldet den Diagnosetext als `blocked` und führt nichts aus (`packages/app/src/completionFlow.ts`).

### Bestätigt korrekt (Auswahl)

- Kalender: K′ ist stets der erste Regeltermin nach max(K, Aktionstag) außerhalb C∪S; verstrichene Termine werden nicht erfunden; Ausnahmen werden übergangen; COUNT zählt Regeltermine ab Start einschließlich Historie; UNTIL ist inklusiv, mit Serienuhrzeit bis 23:59:59.
- Ab Erledigung: B ist der Aktionstag in der Gerätezone (auch 00:30 in Kiritimati bzw. Los Angeles); Kollision mit bereits aufgelösten Schlüsseln wird übersprungen; COUNT zählt Erledigungen, Skips nicht; frühere Fremdhistorie mit mehr Erledigungen als COUNT endet mit der ersten neuen Erledigung.
- Uhrzeit: 02:30-Serie behält die Wanduhrzeit über beide Umstellungen in allen vier Zonen; anderes Feld behält seine Uhrzeit und seinen Kalendertag (auch Offset-Werte).
- Idempotenz: dieselbe Aktion erneut ist immer `noop`, Text byte-identisch; Doppeltipp schreibt einmal und legt einen Undo-Eintrag an; Undo stellt byte-identisch her, danach greift dieselbe Aktion wieder als neue Erledigung.
- Statusauswahl „erledigt“ und „in Arbeit“ schreiben das Vorkommen fort statt die Serie zu beenden.
- Laufzeit der aufwendigsten gültigen Regeln (BYYEARDAY in falschem Monat, 5. Montag im Februar, Schalttag am Montag): ≤ 18 ms; der Suchhorizont begrenzt zuverlässig, Abbruch ist nie ein Serienende.

### Entschieden (Fragen-Tool, `.fragen/2026-10-23-2320-wiederholungen.md`)

- **Ab Erledigung, monatlich/jährlich, erledigt am 29.–31. bzw. 29.02.:** Vorher nahm rrule den Erledigungstag als Rastertag und ließ Monate ohne diesen Tag aus (31.10. → 31.12.; „alle 2 Monate“ am 31.12. → 31.08.; jährlich am 29.02.2028 → 2032). **Entscheidung:** fester Abstand ab dem Erledigungstag mit Klemmen ans Monatsende, jeder Kandidat vom Erledigungstag aus gerechnet (31.10. → 30.11., bei Kollision → 31.12.). Gilt für Completion-Regeln ohne BY-Teile; Regeln mit BY-Teilen bleiben bei rrule. Umgesetzt in `completionOccurrences` (`packages/core/src/recurrence/engine.ts`), genutzt von Fortschreiben, Aktionsvorschau und Formularvorschau; Tests im Block „Entscheidungen vom 23.10.2026“ der Matrix und in `ruleForm.test.ts`.
- **Kalender mit COUNT und versäumten Terminen:** bleibt wie in PLAN1 5.2 (versäumte Termine verlängern die Serie nicht); die Vorschau zeigt „Serie beendet“ vorher an. Test „Kalender mit COUNT: versäumte Termine verkürzen die Serie“.

### Spezifikationslücken ohne Handlungsbedarf

- `EngineQuery.deadline` (1-s-Abbruch im Worker, PLAN1 6) wird produktiv nicht gesetzt; die Begrenzung über Suchhorizont und rrule-Patch reicht gemessen aus (siehe oben, bereits in `docs/ABNAHME.md` M3 vermerkt).
- `describeRule` wertet `wkst !== "MO" && interval > 1 && freq === "WEEKLY"` ohne Klammern aus; betrifft nur die deutsche Beschreibung, nicht die Berechnung.

## Nicht geprüft

- Android im Emulator oder auf einem Gerät (die bestehenden Maestro-Flows 40–45 decken den Pfad ab, sind in dieser Runde nicht gelaufen).
- Mehrere Geräte mit Synchronisation (Konfliktkopien) – nur über die Repository-Tests mit simulierten externen Änderungen.

# Nachprüfung der Wiederholungen vom 24.10.2026

Geprüft: `0e9a04952dac2aa515e8ef3886556c9065efb57a` gegen `ae4e9df`.
Grundlage: `REVIEW-WIEDERHOLUNGEN-2026-10-23.md` und zusätzliche unabhängige Gegenproben.

Der Commit behebt sämtliche konkreten Reproduktionen des ersten Reviews: Die ursprüngliche Suite mit 2.572 Tests, darunter zuvor 68 fehlgeschlagene Tests, besteht vollständig. Auch die erweiterten Repository- und Plattformtests bestehen. Die kritischen BYSETPOS-/COUNT-Fehler und die veraltete Beenden-Aktion sind in den geprüften Abläufen korrigiert.

Die Aussage, damit alle unterstützten Regeln zuverlässig fortschreiben zu können, ist weiterhin zu weitgehend. Fünf neue Gegenproben zeigen drei verbleibende Randthemen. Diese sind Erweiterungen der bisherigen Fälle; die alten Reproduktionen schlagen nicht erneut fehl. Produktionscode wurde bei dieser Nachprüfung nicht geändert.

## N1 – P2: Suchgrenzen decken nicht alle akzeptierten Regeln ab

Ort: `packages/core/src/recurrence/engine.ts:24–32,88`; Formularfreigabe in `packages/app/src/ruleForm.ts:403–405`.

Der neue Kommentar nennt 28 Jahre als größte Lücke zwischen Schalttagen auf einem festen Wochentag. Das gilt nicht über ausgefallene Jahrhundert-Schaltjahre. Für

```text
FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO
```

sind die aufeinanderfolgenden Termine **29.02.2044 → 29.02.2072 → 29.02.2112**. Die letzte Lücke beträgt 40 Jahre, weil 2100 kein Schaltjahr ist. Die Datumsfolge wurde unabhängig mit Python `datetime` und `dateutil` geprüft.

Reproduktion für beide Arten, Kalender und ab Erledigung:

1. Formular mit Start 29.02.2044 und obiger Regel: `preview.ok === true`; Vorschau enthält 2044 und 2072.
2. Serie anlegen und den ersten Termin an seinem Tag erledigen: korrekt auf 2072 fortgeschrieben.
3. Den Termin 2072 an seinem Tag erledigen: `blocked`, „Berechnung zu aufwendig – nichts geändert“, statt Folgetermin 2112.

Die Vorschau prüft nur, ob mindestens zwei Termine gefunden wurden. Damit lässt sie Serien zu, die später an derselben Suchgrenze stehen bleiben. Die Aufgabe wird dabei nicht still als erledigt gespeichert; die Fortschreibung wird sichtbar verweigert.

Zusätzlicher Grenztest: `FREQ=YEARLY;INTERVAL=500` wird vom Parser akzeptiert (`MAX_INTERVAL=1000`), aber die Folgesuche ab 24.10.2026 liefert `aborted` statt 24.10.2526. Das Formular lehnt diesen Fall bereits ab; vorhandene/importierte Serien können trotzdem betroffen sein.

Korrekturrichtung: Suchgrenze und akzeptierten Regelraum gemeinsam absichern, einschließlich INTERVAL und Gregorianischem Kalenderzyklus. Eine bloße Erhöhung von 30 auf 40 Jahre löst die allgemeine Inkonsistenz nicht. Falls Regeln bewusst nicht unterstützt werden, muss dies vor dem Anlegen zuverlässig feststehen. Die Berechnung muss dabei begrenzt bleiben.

## N2 – P3: Datumsgrenze wird nur für den Vorkommensschlüssel geprüft

Ort: `packages/core/src/actions.ts:207–208,216–218,234–235`.

`datesForInstance` prüft `k.year > 9999`, aber nicht das aus dem Offset berechnete zweite Datumsfeld.

Reproduktion: tägliche Serie ab Erledigung mit `due: 9999-12-30`, `scheduled: 9999-12-31` und `recurrence_offset_days: 1`; Erledigung am 30.12.9999. Der Plan und `applyPlan` schreiben erfolgreich:

```yaml
due: 9999-12-31
scheduled: +010000-01-01
recurrence_instance: 9999-12-31
```

`parseDateValue` kann den geschriebenen `scheduled`-Wert anschließend nicht lesen. Das ist ein entfernter Datumsrandfall, aber die dokumentierte Garantie „Termine nach 9999 werden nie geschrieben“ gilt damit noch nicht durchgängig.

Korrekturrichtung: Alle abgeleiteten Datumsfelder vor dem Schreiben gegen den unterstützten Bereich prüfen, auch bei explizitem Offset und bislang leerem zweitem Feld. Bei Überschreitung den gesamten Plan ohne Schreiben sperren.

## N3 – P3: Wiederöffnen einer Fremdserie hält Start und Revision noch nicht fest

Ort: `packages/core/src/actions.ts:487–492`.

Der korrigierte `changeReference`-Pfad übernimmt `revisionSet`. Der frühe Rückgabepfad von `reopenSeries` für ein noch nicht erledigtes/übersprungenes K übernimmt es weiterhin nicht.

Reproduktion:

```yaml
title: Fremdserie
status: done
due: 2026-10-24
recurrence: FREQ=DAILY;COUNT=3
```

Nach `reopenSeries` wird die Aufgabe geöffnet; `recurrence_start` und `recurrence_revision` fehlen weiterhin. Das widerspricht dem vorgesehenen Festhalten der Serienidentität bei der ersten Serienaktion. Ein daraus unmittelbar entstehender Aufgabenverlust wurde in diesem Test nicht nachgewiesen.

Korrekturrichtung: Auch dieser erfolgreiche Schreibpfad übernimmt `revisionSet`. Tests sollten fehlenden Start und fehlende Revision getrennt sowie gemeinsam abdecken.

## Ausgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `pnpm test` | 4.699 bestanden |
| `pnpm test:tz` | jeweils 4.699 bestanden in Europe/Berlin, UTC, America/Los_Angeles und Pacific/Kiritimati |
| Unveränderte ursprüngliche Review-Suite | 2.572 bestanden; vorher 68 fehlgeschlagen |
| Neue unabhängige Completion-Fälle mit BY-Teilen | 770 bestanden; Erwartungswerte aus Python-dateutil, Seed 20261024 |
| Neue gezielte Gegenproben N1–N3 | 5 fehlgeschlagen: N1 zweimal Jahrhundertwechsel plus großer INTERVAL, N2 und N3 je einmal |
| `pnpm typecheck`, `pnpm lint` | bestanden |
| Desktop-Build und Playwright | 28 bestanden |
| Android-Release-Build im Emulator | erfolgreich; 15 Maestro-Flows und 20 Dateiprüfungen bestanden |

Die ursprünglichen Review-Tests wurden größtenteils in die Repository-Suite übernommen; die Zahlen dürfen nicht als unterschiedliche Testfälle addiert werden. Von 800 neu erzeugten Completion-Kandidaten überschritten 30 den Referenz-Zeitrahmen von 300 ms; sie sind separat dokumentiert und werden nicht als geprüft gezählt.

Android: API-36-Emulator, x86_64-Release, mit dem Debug-Keystore signiert, ausschließlich Testordner `MarkdoistTest`. Alle 28 eingebundenen Quelltexte aus `packages/core/src` und `packages/app/src` stimmen mit dem aktuellen Checkout überein; das Bundle im APK stimmt bytegenau mit dem generierten Bundle überein. Der neue Gradle-Input-Block ist vorhanden und seine Anwendung idempotent. In diesem Lauf wurde keine erneute absichtliche Quelltextänderung zur Cache-Invalidierung vorgenommen. Beide installierten rrule-Builds enthalten den BYSETPOS-Patch.

Ungeprüft bleiben ein echtes Android-Gerät und die Synchronisation zwischen mehreren Geräten. Die Tests belegen die genannten Abläufe, keine allgemeine 100-%-Garantie.

## Reproduzierbare Nachweise

Die Nachweise liegen lokal unter `/tmp/markdoist-review-0e9a049/`:

- `followup.test.ts`, `observations.json`, `followup.log`: fünf neue Gegenproben mit tatsächlichen Plänen und geschriebenem Dateitext.
- `generate-completion-by.py`, `completion-by.json`, `completion-by-timeouts.json`, `completion-by.test.ts`, `completion-by.log`: unabhängige Completion-Vergleiche.
- `test.log`, `timezones.log`, `original-counterexamples.log`, `typecheck.log`, `lint.log`, `desktop-e2e.log`, `android-build.log`, `android-e2e.log`: Ausführungsnachweise.

Aufruf der neuen Gegenproben vom Repository-Wurzelverzeichnis:

```sh
pnpm exec vitest run --config /tmp/markdoist-review-0e9a049/vitest.config.mts
```

Erwarteter Stand dieses Commits: 770 grüne unabhängige Fälle, 5 rote Randfalltests. Die Tests liegen außerhalb der regulären Suite und verändern deren Ergebnis nicht.

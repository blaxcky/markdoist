# Review der Wiederholungen – 23.10.2026

Geprüft: `ae4e9dfa62f9ea4144e3de37be980b7da642fc71` gegen Vorgänger `c88be17`. Prüfauftrag einschließlich eigener Gegenproben; die Anwendung im Repository wurde nicht geändert. Die folgenden Fehler sind noch offen. Eine Fehlerquote oder eine Zuverlässigkeitsgarantie lässt sich aus der Anzahl bestandener Tests nicht ableiten.

## Ergebnis

Der Commit verbessert die Abdeckung deutlich und behebt reale Fehler. Die Aussage, damit sämtliche unterstützten Wiederholungen zuverlässig abgedeckt zu haben, ist noch nicht belegt. Es gibt reproduzierbare Fälle eines zu frühen Serienendes, falscher Termine und widersprüchlicher Vorschauen. Der wichtigste Fehler besteht bereits im Vorgänger und bleibt von den neuen Tests unentdeckt.

## Durchgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `pnpm test` | 2.119 Tests bestanden |
| `pnpm test:tz` | jeweils 2.119 bestanden unter Europe/Berlin, UTC, America/Los_Angeles, Pacific/Kiritimati |
| `pnpm typecheck`, `pnpm lint` | bestanden |
| Desktop, frisch gebauter Stand, Playwright | 28/28 bestanden; außerhalb der Sandbox, da Electron darin nicht starten kann |
| Android-Quellstand | Erste APK enthielt trotz erfolgreichem Gradle-Build ein altes Bundle. Nicht als Prüfung dieses Commits gewertet; Bundle ausdrücklich neu erzeugt. Anschließend stimmen alle 28 im Bundle enthaltenen Quellmodule aus Core/App mit dem Workspace überein (`android-source-proof.json`). |
| Android API 36, aktuelle APK, Maestro | 12/12 Standardflows und 13/13 anschließende Dateiprüfungen bestanden |
| Eigener Android-Monatsende-Test | bestanden: Skip am 31.10. → offenes Vorkommen 30.11.2026 um 09:00, zweites Datum 29.11. um 08:00, Checklistenhaken zurückgesetzt |
| Eigene Android-Gegenprobe COUNT/BYSETPOS | fehlgeschlagen wie im Kern/Repository: Nach einer Erledigung steht tatsächlich `status: done` in der Datei, obwohl noch der Termin 02.11.2026 folgen müsste |
| Eigener Android-Test gesperrter Serie | bestanden: Meldung „Fortschreibung klären“, Aufgabe bleibt sichtbar, Datei byte-identisch |
| Eigene Kalendervergleiche mit python-dateutil 2.9.0.post0 | 1.357 Fälle, davon 53 Abweichungen, alle mit BYSETPOS |
| Eigene Completion-Vergleiche mit separat implementierter Python-Kalenderarithmetik | 1.200/1.200 bestanden |
| Gezielte eigene Kern-/Formular-/Repository-Gegenproben | 15 rote Tests; Einzelheiten unten |
| Gesamter eigener Testlauf am unveränderten Commit | 2.504 bestanden, 68 fehlgeschlagen, insgesamt 2.572 |
| Vergleich mit Vorgänger | 13 gezielte Kern-/Formulartests: 10 ebenfalls rot; 3 im Vorgänger grün und durch den Commit rot geworden |
| Isolierte Korrekturprobe ausschließlich in `/tmp` | Zwei Korrekturen in einer Kopie von rrule beseitigen sämtliche 53 Abweichungen; 2.557/2.557 Vergleichstests grün |

Die 68 Fehlschläge sind mehrere Beispiele für wenige gemeinsame Ursachen, nicht 68 unabhängige Fehler. Die Vergleichsdaten wurden mit Seed 20261023 erzeugt. Von 1.600 angefragten dateutil-Fällen wurden 243 nach 50 ms Rechenzeit abgebrochen und **nicht** als geprüft gezählt. Die tatsächlich geprüften 1.357 Fälle sind in `golden.json` eingefroren. Die 1.200 Completion-Fälle prüfen Tage/Wochen/Monate/Jahre, verschiedene Intervalle, Monatsenden und Schaltjahre, frühes und verspätetes Erledigen, Überspringen, C/S-Kollisionen, COUNT/UNTIL und lokale Aktionstage in vier Zonen. Erwartungswerte verwenden keine App-Berechnung.

## Befunde nach Priorität

### R1 – P1: BYSETPOS kann COUNT vorzeitig verbrauchen und die Aufgabe beenden

Bereits im Vorgänger vorhanden. Minimale Regel:

```text
FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=1,-1;COUNT=2
Start: 2026-10-05
```

Der erste und letzte Kandidat der Monatsauswahl sind hier derselbe erste Montag. Erwartet werden die zwei eindeutigen Termine 05.10. und 02.11.2026. rrule liefert den 05.10. doppelt. `queryOccurrences` erhöht den COUNT-Index für jeden gelieferten Wert (`packages/core/src/recurrence/engine.ts:115`), dadurch ergibt das Erledigen am 05.10. `status: done` statt des nächsten offenen Vorkommens am 02.11. Das bleibt nach Schreiben und erneutem Vollscan bestehen; durch einen eigenen Repository-Test nachgewiesen.

Zusätzlich auf Android API 36 mit verifiziertem aktuellem Bundle nachgewiesen: Erledigen des noch offenen Oktober-Vorkommens am 23.10. beendet die Serie ebenfalls vor dem noch ausstehenden November-Termin. In `android-bysetpos-result.md` stehen `COUNT=2`, nur ein Eintrag in `complete_instances` und zugleich `status: done`. Es handelt sich um einen tatsächlich gespeicherten falschen Zustand, nicht nur um einen fehlgeschlagenen Text-Selektor des Oberflächentests.

Ursache in `rrule/dist/esm/iter/poslist.js`: Date-Objekte werden über Objektidentität statt Datumsgleichheit dedupliziert. In der isolierten Probe wurden die Zeitwerte verglichen. Abhilfe muss vor der COUNT-Zählung greifen.

### R2 – P2: Negative BYSETPOS-Werte außerhalb der Kandidatenliste erzeugen erfundene Termine

Bereits im Vorgänger vorhanden. `FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=-2;UNTIL=20261231` ab 01.10.2026 sollte keine Termine erzeugen: Es gibt pro Monat genau einen Kandidaten, keinen vorletzten. Die App liefert trotzdem 05.10., 02.11. und 07.12. Ursache ist `tmp.slice(daypos)[0]`: Bei einer Liste mit einem Eintrag liefert `slice(-2)` diesen Eintrag. Die Python-Referenz verwirft die unzulässige Position. Die isolierte Probe verwendet einen geprüften Index und verwirft nicht vorhandene Kandidaten.

R1 und R2 zusammen erklären alle 53 Abweichungen im unabhängigen Vergleich. Die Korrekturprobe lief ausschließlich gegen eine Kopie der Bibliothek, nicht gegen geänderte produktive Abhängigkeiten.

### R3 – P2: Die neue Completion-Vorschau widerspricht dem Speichern

Zwei bestätigte Regressionen dieses Commits (`packages/app/src/ruleForm.ts:414`):

- Ab Erledigung, Start Dienstag 13.10.2026, `FREQ=WEEKLY;BYDAY=MO`: Vorschau nennt 13.10., gespeichert wird Montag 19.10. Der neue Code setzt ungeprüft `[start]`; `planNewSection` sucht weiterhin den ersten passenden Regeltermin. Das betrifft erweiterte Completion-Regeln mit BY-Teilen.
- Ab Erledigung, Start 13.10., UNTIL 12.10.: Vorschau meldet gültig und zeigt einen Termin nach Serienende; der tatsächliche Speicherplan blockiert zu Recht.

Zusätzlich schon vorher vorhanden: Die Formularvorschau übergibt die Serienuhrzeit nicht. Bei täglicher 09:00-Serie und `UNTIL=20261013T080000` zeigt sie den 13.10. noch an, die echte Fortschreibung endet am 12.10. Beides muss dieselbe validierte Berechnungsgrundlage verwenden.

### R4 – P2: Eine veraltete Beenden-Aktion beendet das nächste Vorkommen

Bereits im Vorgänger vorhanden (`packages/core/src/actions.ts:462`). Nach Erledigung von K=12.10. ist K'=19.10. offen. Eine zuvor eingereihte Aktion `endSeries` mit K=12.10. und `completeCurrent:false` wird trotzdem ausgeführt: Die K-Prüfung liegt nur im Zweig `completeCurrent:true`. Ein eigener Test mit zwei direkt eingereihten Repository-Aktionen bestätigt die Speicherung von `status: done`. PLAN1 5.4 verlangt für alte Aktionen eine Konfliktmeldung statt Übertragung auf einen neuen Stand.

### R5 – P2: Gültige seltene Regeln bleiben am Suchhorizont stehen

Bereits im Vorgänger vorhanden. `FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO` ab 29.02.2016 hat den nächsten Termin am 29.02.2044. Die tägliche Engine sucht nur zwölf Jahre und blockiert das Erledigen mit „Berechnung zu aufwendig“. Die Aufgabe wird dabei nicht gelöscht oder beendet, kann aber auch nicht regulär fortgeschrieben werden. Die aktuelle Oberfläche akzeptiert solche Regeln. Unterstützter Umfang, sichere Suchgrenzen und tatsächlich ausführbare Regeln müssen zusammenpassen.

### R6 – P3: Numerische Grenzen und Dateiformat nicht durchgängig abgesichert

- Neue Regression: Eine jährliche Completion-Serie am 31.12.9999 schreibt `+010000-12-31` als nächstes Vorkommen. Der Serializer akzeptiert das, der eigene Leser blockiert danach die Serie, da Vorkommensschlüssel vierstellige Jahre verlangen. Das ist ein extremer Randfall, zeigt aber eine fehlende Prüfung vor dem Schreiben.
- Bereits vorhanden: INTERVAL und COUNT mit hunderten Ziffern werden zu `Infinity`, der Parser akzeptiert sie als gültig. Endliche sichere Ganzzahlen und konsistente Grenzen fehlen.

### R7 – P3: Ergänzung fehlender Serienfelder ist nicht vollständig

Der Commit verspricht, bei der ersten Serienaktion Revision und Start zu speichern. `changeReference` übernimmt jedoch `revisionSet` nicht (`packages/core/src/actions.ts:545`). Eine Fremdserie, bei der zuerst das Bezugsfeld geändert wird, hat anschließend weiterhin weder gespeicherten Start noch Revision. Der konkrete Test belegt die Spezifikationsabweichung; ein dadurch ausgelöster Aufgabenverlust wurde nicht nachgewiesen.

### Zusätzlicher Befund im Testaufbau: Android-Bundle blieb veraltet

Beim ersten lokalen `assembleRelease` war `createBundleReleaseJsAndAssets` trotz Änderungen in `packages/core` und `packages/app` als `UP-TO-DATE` markiert. Das Bundle stammte von 22:23 Uhr und enthielt weder `completionOccurrences` noch die neue Meldung gesperrter Serien. Die bisherigen zwölf Standardflows und 13 Dateiprüfungen bestanden trotzdem; die zusätzliche Monatsende-Probe scheiterte am alten Verhalten. Dieser erste Lauf wird ausdrücklich nicht für den geprüften Commit gezählt.

Das JavaScript-Bundle wurde danach mit `:app:createBundleReleaseJsAndAssets --rerun-tasks` neu erzeugt, die APK neu paketiert und der enthaltene Quellstand kontrolliert: Alle 28 Core-/App-Module stimmen mit den Workspace-Dateien überein. Auch die Bundle-Bytes innerhalb der installierten APK stimmen mit dem geprüften Build-Output überein (SHA-256 `cfe6f0bcf67f2d93ba43331eb0ad2fa214a63118c8c1b87255015e12033863e1`). Für künftige lokale Builds sollten Änderungen an den gemeinsamen Paketen als Gradle-Inputs registriert oder die Bundle-Erzeugung im Testablauf ausdrücklich erzwungen werden. Das belegt einen Fehler im lokalen Testaufbau; eine veraltete GitHub-Release-APK wurde damit nicht nachgewiesen.

## Warum die vorhandenen Tests grün bleiben

- `seriesOracle.ts:79` verwendet für Kalender dieselbe Funktion `queryOccurrences` wie die App; `seriesOracle.ts:98` verwendet für Completion dieselbe `completionOccurrences`. Ein gemeinsamer Bibliotheksfehler bestätigt sich damit selbst. Die übrigen Invarianten sind weiterhin nützlich.
- Die 51 bisherigen dateutil-Fixtures enthalten die überlappenden bzw. zu weit negativen BYSETPOS-Kombinationen nicht.
- Die geänderte Golden-Prüfung akzeptiert bei Suchabbruch bereits einen passenden Anfang der Folge. Das beweist nicht, dass ein späteres Vorkommen fortgeschrieben werden kann.
- Die Formularkette prüft erzeugbare einfache Formulare; die neuen Vorschaufehler betreffen erweiterte BY-Regeln bzw. ungültige Grenzen. Für Completion wird der Vergleich des Folgetermins mit dem zweiten Vorschautermin ausdrücklich ausgelassen (`formChain.test.ts:33`).
- Die Zufallssimulation vermeidet frühe Completion-Erledigungen, bei denen der neue Schlüssel zeitlich zurückspringen darf. Die unabhängigen zusätzlichen Completion-Fälle schließen diese Lücke teilweise.

## Umsetzungsplan

1. **Serienende absichern.** R1/R2 durch eine kleine, versionierte Ergänzung des vorhandenen rrule-Patches in beiden ausgelieferten Builds (CJS und ESM) korrigieren. Eindeutige Datumsschlüssel vor COUNT zählen; ungültige Positionen ignorieren. R4 durch Prüfung von Revision und aktuellem K bei beiden Beenden-Varianten schließen. Minimale Regressionen zuerst in reguläre Kern- und Repository-Tests übernehmen.
2. **Formular und Fortschreibung vereinheitlichen.** Den ersten passenden Termin einschließlich Uhrzeit und UNTIL einmal im Kern bestimmen und in Vorschau und Anlegen verwenden. Danach Completion-Vorschau anhand desselben Abschnitts simulieren. BY-Teile bleiben nach den bestehenden Nutzerentscheidungen bei rrule; einfache Monats-/Jahresabstände klemmen ans Monatsende. COUNT-Entscheidungen nicht ändern.
3. **Zulässige Zustände absichern.** Endliche sichere Ganzzahlen validieren, unterstützten Datumsbereich vor jeder Serialisierung prüfen, fehlende Start-/Revisionsfelder bei sämtlichen einschlägigen Serienaktionen materialisieren. Für seltene Regeln eine nachvollziehbare begrenzte Suche mit echter Abbruchmöglichkeit verwenden; Suchabbruch bleibt ein Fehler und niemals ein Serienende. Akzeptierte Regeln dürfen nicht erst beim späteren Erledigen unerwartet unberechenbar werden.
4. **Unabhängige Prüfungen dauerhaft einbauen.** Die bestätigten dateutil-Gegenbeispiele als feste Golden-Fixtures übernehmen. Ein separates Python-Modell für Completion und passende generierte Kalenderfälle verwenden; CI konsumiert fest erzeugte Daten mit dokumentiertem Seed/Referenzstand. Längere Folgen einschließlich frühzeitiger Erledigungen, Skips, Regelwechsel, Undo, Neustart und konkurrierender Änderungen abdecken. Fehlgeschlagenes Speichern darf keine erledigte/verschwundene Aufgabe suggerieren.
5. **Abnahme am endgültigen Stand.** Gesamte Zeitzonenmatrix, Lint/Typprüfung, Desktop- und Android-Tests ausführen. Den enthaltenen Quellstand der Test-APK prüfen; der lokale Gradle-Cache hat Änderungen in den gemeinsamen Paketen in dieser Runde nicht erkannt. Zusätzliche Oberflächenfälle für COUNT/BYSETPOS, Monatsende/Schalttag, UNTIL-Uhrzeit, Fehlermeldungen und Neustart nach Schreiben aufnehmen. Erst dann den vorhandenen Testbericht aktualisieren. Keine Aussage „100 % zuverlässig“ allein aus grünen Testzahlen ableiten.

## Reproduktion und Dateien

Alle zusätzlichen Testartefakte liegen in `/tmp/markdoist-recurring-review/`.

```bash
cd /home/markus/GitHub/local-first-todo
pnpm exec vitest run --config /tmp/markdoist-recurring-review/vitest.config.ts
```

Dieser Lauf ist absichtlich rot, solange die beschriebenen Fehler im geprüften Commit bestehen. Er verändert keine Aufgaben des Nutzers.

- `audit.test.ts`: 13 gezielte Grenz- und Regressionstests.
- `repository.test.ts`: zwei Nachweise bis zur Speicherung/Warteschlange.
- `differential.test.ts`, `golden.json`, `completion-golden.json`: unabhängige Vergleichstests.
- `generate.py`, `reference-timeouts.json`: Generator und ausdrücklich ausgelassene Referenzfälle.
- `combined.log`, `parent.log`, `mismatches.json`: Ergebnisse am Commit bzw. Vorgänger.
- `probe.config.mts`, `rrule-probe/`, `probe.log`: isolierte Ursachenprüfung; kein produktiver Fix.
- `desktop-host.log`, `android-bundle-force.log`, `android-current-build.log`, `android-source-proof.json`, `android-current-e2e.log`: Nachweise des tatsächlich geprüften Stands. `android-build.log` und `android-e2e.log` gehören zum anfänglichen Lauf mit veraltetem Bundle und zählen nicht zur aktuellen Abnahme.

Die Android-Zusatzfälle stehen in `android-monthend.yaml`, `android-bysetpos.yaml` und `android-blocked.yaml`; ihre Ergebnisdateien und Logs liegen daneben. Die drei zusätzlich angelegten Aufgaben wurden nach Sicherung der Ergebnisse wieder aus dem Emulator-Testordner entfernt. Auf dem Emulator bleibt der verifizierte aktuelle Test-Build installiert (Release-Konfiguration, x86_64, Debug-Signatur).

Nicht geprüft: das reale Handy, Synchronisation zwischen mehreren echten Geräten oder jede denkbare Kombination unterstützter RRULE-Werte. Die konkret gefundenen Fehler sind noch offen; die einzige Korrekturprobe erfolgte in einer separaten Bibliothekskopie unter `/tmp`. Der Programmcode des Repositorys blieb unverändert.

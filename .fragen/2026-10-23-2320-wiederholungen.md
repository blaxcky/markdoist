---
fragen-tool: 1
titel: Testrunde Wiederholungen – zwei fachliche Entscheidungen
status: beantwortet
---

Ich habe alle Wiederholungsvarianten systematisch geprüft (Bericht: `docs/TEST-WIEDERHOLUNGEN.md`). Drei Fehler sind behoben. Zwei Verhaltensweisen sind technisch korrekt umgesetzt, aber fachlich fraglich. Beides lässt sich im Kern mit sperrendem Test ändern.

## 1. Wie soll „monatlich/jährlich ab Erledigung“ rechnen, wenn am 29., 30., 31. oder am 29.02. erledigt wird?
<!-- typ: einfach -->

Heute nimmt rrule den Erledigungstag als Rastertag und lässt Monate ohne diesen Tag aus: erledigt am 31.10. → nächster Termin 31.12. (November fehlt); „alle 2 Monate“ erledigt am 31.12. → 31.08. des Folgejahres; „jährlich“ erledigt am 29.02.2028 → 29.02.2032. Bei Kalenderserien fragt das Formular nach „Monate ohne diesen Tag auslassen / stattdessen letzter Tag“; bei „ab Erledigung“ fragt es nicht, weil die Regel keinen festen Tag enthält.

- [x] Fester Abstand mit Klemmen ans Monatsende (empfohlen) — „1 Monat nach Erledigung“ am 31.10. ergibt den 30.11., „1 Jahr“ nach dem 29.02. den 28.02.; gilt nur für Completion-Regeln ohne BY-Teile, sonst bleibt rrule maßgeblich
- [ ] So lassen (RFC-Verhalten) — Monate ohne den Tag werden übersprungen; Hinweis im Formular ergänzen
- [ ] Monatsende-Frage auch bei „ab Erledigung“ stellen — Nutzer wählt je Serie; erzeugt eigene Regelform (z. B. `BYMONTHDAY=-1`) und verschiebt den Rastertag

<!-- antwort -->
<!-- /antwort -->

## 2. Soll bei Kalenderserien mit „noch N-mal“ ein versäumter Termin als verbraucht zählen?
<!-- typ: einfach -->

PLAN1 5.2 legt fest: COUNT zählt Regeltermine ab Start, „übersprungene oder versäumte Slots verlängern diesen Kalender nicht“. Folge: „jeden Montag, noch 3-mal“ ab 12.10.; wer das erste Vorkommen erst am 30.10. erledigt, hat die Termine 19.10. und 26.10. versäumt, und die Serie endet mit einer einzigen Erledigung. Die Vorschau vor dem Erledigen zeigt „Serie beendet“ an. Bei „ab Erledigung“ zählt COUNT dagegen Erledigungen.

- [x] So lassen (empfohlen) — entspricht der Spezifikation und dem Kalendergedanken; die Vorschau warnt vorher
- [ ] COUNT zählt aufgelöste Vorkommen (Erledigungen und Skips) — versäumte Termine verlängern die Serie; „noch 3-mal“ heißt dann drei Auflösungen, wie bei „ab Erledigung“

<!-- antwort -->
<!-- /antwort -->

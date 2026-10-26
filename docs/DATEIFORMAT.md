# Markdoist – Dateiformat (Formatversion 1)

Eine Aufgabe ist genau eine Markdown-Datei mit YAML-Frontmatter in der obersten Ebene des gewählten Aufgabenordners. Die Dateien sind die maßgebliche Quelle; Markdoist liest sie, ohne beim bloßen Einlesen etwas zu schreiben. Alles, was Markdoist nicht kennt, bleibt byte-genau erhalten.

## Ordner

| Eintrag | Bedeutung |
|---|---|
| `*.md` (oberste Ebene) | Aufgaben. Unterordner werden nicht gelesen. |
| `.todo-trash/` | Papierkorb. Wird mitsynchronisiert; geleert wird nur ausdrücklich. |
| Namen mit führendem Punkt | werden ignoriert (auch kurzlebige `.markdoist-*.todo-tmp`-Dateien des Desktops). |
| `*.sync-conflict-…md` u. ä. | Konfliktkopien eines Sync-Programms; erscheinen als Variante, nicht als eigene Aufgabe. |

Dateien ohne Frontmatter erscheinen unter „Probleme → Nicht erkannte Dateien“ und können ausdrücklich übernommen werden.

**Dateiname:** bei der Erstellung aus dem Titel gebildet (verbotene Zeichen `/ \ : * ? " < > |`, `# ^ [ ]` und Steuerzeichen entfernt, NFC, höchstens 100 Zeichen und 240 UTF-8-Bytes inkl. Suffix und `.md`; Kollision → `… 2.md`). Maßgeblich ist immer `title`. Eine spätere Titeländerung benennt die Datei nicht um („Dateinamen an Titel angleichen“ tut es ausdrücklich).

## Kodierung und Rahmen

- UTF-8 (ungültiges UTF-8 → schreibgeschützt unter Probleme). BOM, Zeilenenden (LF/CRLF) und ein fehlender Abschlusszeilenumbruch bleiben erhalten.
- Frontmatter beginnt mit `---` in der ersten Zeile und endet an der nächsten Zeile `---`. YAML 1.2 (Core-Schema): `2026-10-14` ist ein String, `yes` ist kein Boolean.
- Doppelte Schlüssel, Syntaxfehler oder ein Frontmatter ohne Mapping machen die Datei ungültig (Probleme, keine automatische Reparatur).

## Felder

Reihenfolge beim Neuanlegen: `id`, `format_version`, `title`, `status`, `priority`, `inbox`, `due`, `scheduled`, Serienfelder, `complete_instances`, `skipped_instances`, `last_completed_at`, `dateCreated`, `dateModified`, `completedDate`. Neue Felder in bestehenden Dateien werden am Ende angehängt; bestehende Felder werden nie umsortiert.

| Feld | Typ | Bedeutung | Lese-Standard bei Fehlen |
|---|---|---|---|
| `id` | ULID | stabile Identität | temporär aus der Dateireferenz; echte ULID beim ersten aktiven Schreiben |
| `format_version` | Ganzzahl, `1` | interpretierte Semantik | versionslose Datei, wird nicht ungefragt migriert; höher als 1 → schreibgeschützt |
| `title` | String | maßgeblicher Titel | Dateiname ohne `.md` |
| `status` | `open` \| `in-progress` \| `done` | Zustand; bei Serien `done` = Serie beendet | `open`; unbekannter Wert wird als offen gelistet und bleibt erhalten |
| `priority` | `none` \| `low` \| `normal` \| `high` | Priorität | `none` |
| `inbox` | Boolean | im Eingang | `true` bei offenen Aufgaben; Nicht-Boolean → `true` mit Hinweis |
| `due` | Datum oder lokale Datumszeit | Frist | keine |
| `scheduled` | wie `due` | geplanter Bearbeitungstag | keiner |
| `dateCreated` | Zeitstempel | Erstellung | unbekannt (Sortierung nach mtime) |
| `dateModified` | Zeitstempel | letzte Änderung durch die App | unbekannt |
| `completedDate` | Zeitstempel | Abschluss bzw. Serienende | `dateModified`, sonst mtime |
| `kind` | `list` | einfache Abhakliste statt Aufgabe (siehe „Listen“) | Aufgabe; ein anderer Wert bleibt erhalten und wird ignoriert |

**Datums- und Zeitwerte:**
- Datum `2026-10-14`: Kalendertag ohne Zeitzone. Fällig bis Tagesende, überfällig ab dem Folgetag.
- Lokale Datumszeit `2026-10-14T17:00`: Wanduhrzeit des Geräts („floating“). Nicht existierende Uhrzeiten (Frühjahrs-Zeitumstellung) gelten ab dem ersten gültigen Zeitpunkt nach der Lücke; in der doppelten Herbststunde gilt der frühere Zeitpunkt.
- Werte mit Offset oder `Z` (von anderen Werkzeugen) werden gelesen, für die Anzeige umgerechnet und unverändert gelassen.
- Zeitstempel `2026-10-12T08:14:03+02:00`: Instant mit lokalem Offset zum Schreibzeitpunkt.

## Listen

Eine Datei mit `kind: list` ist eine einfache Abhakliste ohne Termine. Sie erscheint nur in der Ansicht „Listen“ und in der Suche, nie in Eingang, Heute, Alle offenen oder Erledigt. Die Einträge sind die Markdown-Checklistenelemente im Body; anderer Text bleibt unverändert. Beim Anlegen schreibt Markdoist zusätzlich `status: open` und `inbox: false`, damit ältere Versionen die Liste nicht im Eingang zeigen.

```markdown
---
id: 01K8F3QZ7M2D9W4X6B1N5R8T0V
format_version: 1
title: Einkauf Samstag
kind: list
status: open
inbox: false
dateCreated: 2026-10-26T23:10:00+01:00
dateModified: 2026-10-26T23:12:41+01:00
---
- [ ] Milch
- [x] Brot
```

## Wiederholungen

Eine Serie bleibt eine Datei. Felder des **aktiven Abschnitts**:

| Feld | Typ | Bedeutung |
|---|---|---|
| `recurrence` | RRULE ohne DTSTART, z. B. `FREQ=WEEKLY;BYDAY=MO` | Regel; vorhanden = Serie. `RRULE:`-Präfix und TaskNotes-Form `DTSTART:…;FREQ=…` werden gelesen und nicht umgeschrieben. |
| `recurrence_revision` | ULID | Identität des aktiven Abschnitts |
| `recurrence_start` | Datum oder lokale Datumszeit | Beginn des Regelrasters; eine Uhrzeit hier ist die feste Uhrzeit jedes Vorkommens |
| `recurrence_anchor` | `calendar` \| `completion` | fester Kalenderrhythmus oder ab tatsächlicher Erledigung |
| `recurrence_field` | `due` \| `scheduled` | Feld, das die Serie fortschreibt |
| `recurrence_offset_days` | Ganzzahl | Abstand des anderen Datumsfelds in Kalendertagen (negativ = davor) |
| `recurrence_instance` | Datum | Vorkommensschlüssel K des aktuell offenen Vorkommens; Einzelverschieben ändert ihn nicht |
| `complete_instances` | Liste von Daten | erledigte Vorkommen (C); Reihenfolge und Duplikate bedeutungslos |
| `skipped_instances` | Liste von Daten | übersprungene Vorkommen (S); zukünftige Einträge sind Ausnahmen |
| `last_completed_at` | Zeitstempel | Zeitpunkt der letzten Erledigung im aktiven Abschnitt |
| `recurrence_archive` | Liste von Abschnitts-Snapshots | frühere Abschnitte (siehe unten) |

**Unterstützte Regelteile:** `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`, `INTERVAL`, `COUNT`, `UNTIL` (Datum oder lokale Datumszeit, inklusiv), `BYDAY` (mit Ordinalen bei MONTHLY/YEARLY), `BYMONTHDAY`, `BYMONTH`, `BYYEARDAY`, `BYWEEKNO`, `BYSETPOS`, `WKST`. `COUNT` und `UNTIL` gemeinsam sind ungültig. Nicht unterstützt (angezeigt, byte-genau erhalten, Serienaktionen gesperrt): `FREQ=HOURLY|MINUTELY|SECONDLY`, `BYHOUR`, `BYMINUTE`, `BYSECOND`, `RSCALE`, `SKIP`, `BYEASTER`, `TZID`, `RDATE`, `EXRULE`, `EXDATE`.

**Fortschreiben:**
- `calendar`: erstes Regelvorkommen nach max(K, Aktionstag), das weder in C noch in S steht. `COUNT` zählt Regeltermine ab `recurrence_start`.
- `completion`: Regel ab dem Kalendertag der Erledigung ausgewertet; erstes Vorkommen danach, das weder in C noch in S steht. Regeln ohne BY-Teile gelten als fester Abstand ab diesem Tag mit Klemmen ans Monatsende (31.10. + 1 Monat = 30.11., jeder Kandidat vom Erledigungstag aus gerechnet); Regeln mit BY-Teilen folgen rrule. `COUNT` zählt Erledigungen im aktiven Abschnitt; Skips zählen nicht.
- Das Bezugsfeld erhält das neue Vorkommen (mit Serienuhrzeit), das andere Feld den Abstand. `inbox` bleibt unverändert. Angehakte Markdown-Checklisten werden beim Wechsel zu einem neuen offenen Vorkommen zurückgesetzt (nicht in Code-Blöcken).
- Ist kein weiteres Vorkommen möglich, wird die Serie beendet (`status: done`, `completedDate`); `recurrence_instance` bleibt stehen.
- Fehlen in einer Fremddatei `recurrence_revision` oder `recurrence_start`, ergänzt die erste Serienaktion beide Felder mit den beim Lesen abgeleiteten Werten, damit Raster und `COUNT` danach fest verankert sind.

**Regeländerung = neuer Abschnitt:** Eine Änderung von Regel, Start, Serienuhrzeit, Art, `COUNT` oder `UNTIL` (oder ausdrücklich „ab jetzt noch N-mal“) archiviert den aktiven Abschnitt und beginnt einen neuen mit neuer Revision und leerer Historie. Die alte Historie bleibt sichtbar und zählt nicht mit.

### Struktur von `recurrence_archive`

Jeder Eintrag ist ein Mapping (keine verschachtelten Archive):

```yaml
recurrence_archive:
  - recurrence_revision: 01K69X4D2M7Q0B5T8V3W6Y1Z4D   # eindeutig im Archiv
    recurrence: FREQ=WEEKLY;BYDAY=MO
    recurrence_start: 2026-09-28
    recurrence_anchor: calendar
    recurrence_field: due
    recurrence_offset_days: -1          # optional
    recurrence_instance: 2026-10-12
    complete_instances: [2026-09-28, 2026-10-05]
    skipped_instances: []
    status: open
    due: 2026-10-12                     # falls vorhanden
    scheduled: 2026-10-11               # falls vorhanden
    completedDate: …                    # falls vorhanden
    last_completed_at: 2026-10-05T18:00:00+02:00   # falls vorhanden
    closed_reason: rule-change          # rule-change | removed
```

Unbekannte Felder innerhalb eines Snapshots bleiben erhalten. Zwei abweichende Snapshots derselben Revision gelten als Konflikt. „Wiederholung entfernen“ archiviert den aktiven Abschnitt mit `closed_reason: removed`.

## Beispiel

```markdown
---
id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C
format_version: 1
title: Wochenrückblick
status: open
priority: normal
inbox: false
due: 2026-10-16
scheduled: 2026-10-15
recurrence: FREQ=WEEKLY;BYDAY=FR
recurrence_revision: 01K69X4D2M7Q0B5T8V3W6Y1Z4D
recurrence_start: 2026-09-04
recurrence_anchor: calendar
recurrence_field: due
recurrence_offset_days: -1
recurrence_instance: 2026-10-16
complete_instances:
  - 2026-09-04
  - 2026-10-02
skipped_instances:
  - 2026-09-18
last_completed_at: 2026-10-10T10:32:00+02:00
tags: [routine]   # unbekanntes Feld, bleibt erhalten
dateCreated: 2026-09-01T19:02:11+02:00
dateModified: 2026-10-10T10:32:00+02:00
---
## Ablauf
- [ ] Erledigtes der Woche durchsehen
```

## Schreiben

Markdoist ändert Metadaten chirurgisch: nur die Zeilen der geänderten Schlüssel werden ersetzt, neue Felder angehängt, alle anderen Bytes (Kommentare, Anführungszeichen, unbekannte Felder, Body) bleiben gleich. Vor jedem Schreiben wird das Ergebnis erneut geparst und geprüft. Frontmatter mit YAML-Ankern/Aliasen wird nicht automatisch bearbeitet. Unmittelbar vor dem Schreiben wird die Datei erneut gelesen; hat sie sich geändert, wird eine unabhängige Änderung auf den neuen Stand angewendet, ein Konflikt am selben Feld wird gemeldet.

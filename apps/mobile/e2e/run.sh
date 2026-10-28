#!/usr/bin/env bash
# Android-E2E im Emulator (API 36): Testdaten anlegen, Maestro-Flows ausführen, Dateien prüfen.
# Voraussetzung: laufender Emulator (englische Systemsprache für den SAF-Dialog in Flow 00),
# installierte App (Release-Build, oder Debug-Build mit Metro und MAESTRO_DEV=true).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/Android/Sdk/platform-tools:$HOME/.local/opt/maestro/bin:$HOME/.maestro/bin"
if [ -z "${JAVA_HOME:-}" ]; then
  for j in /usr/lib/jvm/java-21-openjdk "$HOME/.local/opt/jdk-21" /usr/lib/jvm/java-25-openjdk; do [ -x "$j/bin/java" ] && export JAVA_HOME="$j" && break; done
fi
DIR=/sdcard/Documents/MarkdoistTest
# Bildschirm wecken und entsperren: Nach längerer Ruhe ist der Emulator-Bildschirm aus, dann findet
# Maestro keine Elemente. Während des Laufs wach halten (stayon gilt bis zum Neustart des Geräts).
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
adb shell svc power stayon true
adb shell rm -rf "$DIR"
adb shell mkdir -p "$DIR"
for f in seed/*.md; do adb push "$f" "$DIR/" >/dev/null; done
# Serie relativ zu heute: K = letzter Montag (heute, falls Montag), Start eine Woche davor.
# K von 12 Uhr aus, die Folgedaten in UTC: Am Tag der Zeitumstellung verschiebt die fehlende oder doppelte Stunde
# sonst abends das Datum (25.10.2026, 23 Uhr: „6 days ago“ ergab Dienstag statt Montag).
K=$(date -d "12:00 $(( ($(date +%u) - 1) )) days ago" +%F)
START=$(date -u -d "$K -7 days" +%F)
NEXT=$(date -u -d "$K +7 days" +%F)
NEXT_LABEL="Mo $(date -d "$NEXT" +%d.%m.%Y)"
SKIP_KEY=$(date -u -d "$K +14 days" +%F)   # nach Flow 40 ist NEXT aktuell; der Termin danach wird übersprungen
TMP=$(mktemp -d)
cat > "$TMP/Wochenrueckblick.md" <<SEED
---
id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C
format_version: 1
title: Wochenrückblick
status: open
priority: normal
inbox: false
due: $K
recurrence: FREQ=WEEKLY;BYDAY=MO
recurrence_revision: 01K69X4D2M7Q0B5T8V3W6Y1Z4D
recurrence_start: $START
recurrence_anchor: calendar
recurrence_field: due
recurrence_instance: $K
---
SEED
adb push "$TMP/Wochenrueckblick.md" "$DIR/" >/dev/null
rm -rf "$TMP"
fail=0
for flow in flows/*.yaml; do
  echo "== $flow"
  maestro test -e NEXT_LABEL="$NEXT_LABEL" -e SKIP_KEY="$SKIP_KEY" -e MAESTRO_DEV="${MAESTRO_DEV:-false}" "$flow" || { fail=1; break; }
done
check() { # Datei, erwarteter Text
  if adb shell "cat '$DIR/$1'" | grep -qF -- "$2"; then echo "OK   $1 enthält: $2"; else echo "FEHL $1 enthält nicht: $2"; fail=1; fi
}
if [ $fail = 0 ]; then
  check "Maestro Aufgabe.md" "inbox: true"
  if adb shell "cat '$DIR/Maestro Aufgabe.md'" | grep -qE '^(due|scheduled):'; then echo "FEHL Erfassung hat Termin"; fail=1; else echo "OK   Erfassung ohne Termin"; fi
  check "Per Verknuepfung.md" "inbox: true"
  check "Wochenrueckblick.md" "due: $NEXT"
  check "Wochenrueckblick.md" "inbox: false"
  check "Wochenrueckblick.md" "  - $SKIP_KEY"
  check "Zahnarzt.md" "priority: high"
  check "Zahnarzt.md" "Neu"
  check "Zahnarzt.md" "status: open"
  check "Kaputt.md" "title: ["
  check "Zahnarzt.md" "COUNT=5"
  check "Zahnarzt.md" "recurrence_anchor: calendar"
  # Review Wiederholungen 23.10.2026: Monatsende, BYSETPOS mit COUNT, gesperrte Serie.
  check "Audit-Monatsende.md" "due: 2099-11-30T09:00"
  check "Audit-Monatsende.md" "scheduled: 2099-11-29T08:00"
  check "Audit-Monatsende.md" "recurrence_instance: 2099-11-30"
  check "Audit-Monatsende.md" "- [ ] Test"
  check "Audit-Positionsregel.md" "recurrence_instance: 2099-11-02"
  check "Audit-Positionsregel.md" "status: open"
  if [ "$(adb shell "cat '$DIR/Audit-Sperre.md'" | tr -d '\r' | md5sum)" = "$(md5sum < seed/Audit-Sperre.md)" ]; then
    echo "OK   Audit-Sperre.md byte-identisch"
  else echo "FEHL Audit-Sperre.md wurde verändert"; fail=1; fi
  # Listen (4.6): Datei mit kind: list, Reihenfolge nach dem Ziehen, Haken zurückgesetzt.
  check "Einkauf.md" "kind: list"
  check "Einkauf.md" "inbox: false"
  if adb shell "cat '$DIR/Einkauf.md'" | tr -d '\r' | grep -A1 -xF -- "- [ ] Brot" | grep -qxF -- "- [ ] Milch"; then
    echo "OK   Einkauf.md: Brot vor Milch, beide offen"
  else echo "FEHL Einkauf.md: Reihenfolge oder Haken falsch"; fail=1; fi
  # Löschen (4.4): „Wegwerfen“ aus Flow 12 liegt im Papierkorb, „Auch weg“ hat der Verlauf zurückgeholt.
  for f in "Wegwerfen.md"; do
    if adb shell ls "$DIR/.todo-trash" | tr -d '\r' | grep -qxF -- "$f"; then echo "OK   im Papierkorb: $f"; else echo "FEHL nicht im Papierkorb: $f"; fail=1; fi
  done
  # AK-12: Serienaktionen legen keine Dateien an – 6 Seed-Dateien + 2 Erfassungen + 1 Liste + „Auch weg“.
  n=$(adb shell ls "$DIR" | grep -c '\.md' || true)
  if [ "$n" = 10 ]; then echo "OK   Dateien im Ordner: $n"; else echo "FEHL Dateien im Ordner: $n (erwartet 10)"; fail=1; fi
  adb shell ls -a "$DIR" | grep -q 'todo-tmp' && { echo "FEHL Temp-Datei übrig"; fail=1; } || true
fi
exit $fail

#!/usr/bin/env bash
# Android-E2E im Emulator (API 36): Testdaten anlegen, Maestro-Flows ausführen, Dateien prüfen.
# Voraussetzung: laufender Emulator, installierte App (Release- oder Debug-Build mit Metro).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/Android/Sdk/platform-tools:$HOME/.local/opt/maestro/bin"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
DIR=/sdcard/Documents/MarkdoistTest
adb shell rm -rf "$DIR"
adb shell mkdir -p "$DIR"
for f in seed/*.md; do adb push "$f" "$DIR/" >/dev/null; done
# Serie relativ zu heute: K = letzter Montag (heute, falls Montag), Start eine Woche davor.
K=$(date -d "$(( ($(date +%u) - 1) )) days ago" +%F)
START=$(date -d "$K -7 days" +%F)
NEXT=$(date -d "$K +7 days" +%F)
NEXT_LABEL="Mo $(date -d "$NEXT" +%d.%m.%Y)"
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
  maestro test -e NEXT_LABEL="$NEXT_LABEL" -e MAESTRO_DEV="${MAESTRO_DEV:-false}" "$flow" || { fail=1; break; }
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
  check "Zahnarzt.md" "priority: high"
  check "Zahnarzt.md" "Neu"
  check "Zahnarzt.md" "status: open"
  check "Kaputt.md" "title: ["
  check "Zahnarzt.md" "COUNT=5"
  check "Zahnarzt.md" "recurrence_anchor: calendar"
  n=$(adb shell ls "$DIR" | grep -c '\.md' || true)
  echo "Dateien im Ordner: $n"
  adb shell ls -a "$DIR" | grep -q 'todo-tmp' && { echo "FEHL Temp-Datei übrig"; fail=1; } || true
fi
exit $fail

#!/usr/bin/env bash
# Android-Leistungsmessung im Emulator (M7, AK-40). Erwartet die installierte Release-APK.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/Android/Sdk/platform-tools:$HOME/.local/opt/maestro/bin"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
TMP=$(mktemp -d)
node perf-seed.mjs "$TMP/MarkdoistPerf" 2000 >/dev/null
adb shell rm -rf /sdcard/Documents/MarkdoistPerf
adb push "$TMP/MarkdoistPerf" /sdcard/Documents/ >/dev/null
rm -rf "$TMP"
echo "== Erststart (kein Cache): Ordner wählen, vollständiger Abgleich"
maestro test perf/choose-perf-folder.yaml >/dev/null
maestro test perf/read-stats.yaml 2>&1 | grep -o "MARKDOIST_PERF.*" || true
echo "== Kaltstart mit Cache: Zeit bis zur ersten Liste"
adb shell am force-stop de.markdoist.aufgaben
adb logcat -c
adb shell am start -W -n de.markdoist.aufgaben/.MainActivity | grep -E "TotalTime|WaitTime" || true

sleep 3
echo "(Dauer bis zur Cache-Anzeige steht in den Kennzahlen)"
maestro test perf/read-stats.yaml 2>&1 | grep -o "MARKDOIST_PERF.*" || true

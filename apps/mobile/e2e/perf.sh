#!/usr/bin/env bash
# Android-Leistungsmessung im Emulator (M7, AK-40). Erwartet die installierte Release-APK.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/Android/Sdk/platform-tools:$HOME/.local/opt/maestro/bin:$HOME/.maestro/bin"
if [ -z "${JAVA_HOME:-}" ]; then
  for j in /usr/lib/jvm/java-21-openjdk "$HOME/.local/opt/jdk-21" /usr/lib/jvm/java-25-openjdk; do [ -x "$j/bin/java" ] && export JAVA_HOME="$j" && break; done
fi
texts() { adb exec-out uiautomator dump /dev/tty 2>/dev/null | grep -oE 'text="[^"]*(Abgleich|Treffer)[^"]*"' | sed 's/^text=//' || true; }
TMP=$(mktemp -d)
node perf-seed.mjs "$TMP/MarkdoistPerf" 2000 >/dev/null
adb shell rm -rf /sdcard/Documents/MarkdoistPerf
adb push "$TMP/MarkdoistPerf" /sdcard/Documents/ >/dev/null
rm -rf "$TMP"
echo "== Erststart (kein Cache): Ordner wählen, vollständiger Abgleich"
maestro test perf/choose-perf-folder.yaml >/dev/null
maestro test perf/stats.yaml >/dev/null
texts
maestro test perf/search.yaml >/dev/null
texts
echo "== Kaltstart mit Cache"
adb shell am force-stop de.markdoist.aufgaben
adb shell am start -W -n de.markdoist.aufgaben/.MainActivity | grep -E "TotalTime" || true
maestro test perf/stats.yaml >/dev/null
texts

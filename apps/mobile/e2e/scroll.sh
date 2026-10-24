#!/usr/bin/env bash
# Scrollen gegen Wischgeste (Android-Emulator): Ein Daumenbogen – erst schräg zur Seite, dann nach oben –
# muss die Liste scrollen und darf keine Zeile wischen. Maestro kann nur gerade Wische, und die
# scrollten auch vor der Korrektur; darum hier rohe Touch-Ereignisse über adb.
# Voraussetzung: laufender Emulator (1080x2400) mit installierter Release-APK.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/Android/Sdk/platform-tools:$HOME/.local/opt/maestro/bin:$HOME/.maestro/bin"
if [ -z "${JAVA_HOME:-}" ]; then
  for j in /usr/lib/jvm/java-21-openjdk "$HOME/.local/opt/jdk-21"; do [ -d "$j" ] && export JAVA_HOME="$j" && break; done
fi
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
TMP=$(mktemp -d)
node perf-seed.mjs "$TMP/MarkdoistPerf" 120 >/dev/null
adb shell rm -rf /sdcard/Documents/MarkdoistPerf
adb push "$TMP/MarkdoistPerf" /sdcard/Documents/ >/dev/null
rm -rf "$TMP"
maestro test perf/choose-perf-folder.yaml >/dev/null
maestro test scroll/prepare.yaml >/dev/null
ui() { adb exec-out uiautomator dump /dev/tty 2>/dev/null; }
first() { ui | grep -oE 'content-desc="[^"]*Aufgabe [0-9]+[^"]*"' | head -1; }
before=$(first)
# Erst 40 px seitlich bei 20 px Höhe (alte Schwelle: Wischen ab 10 dp), dann 1080 px nach oben.
x=432; y=1840; cmd="input motionevent DOWN $x $y"
for _ in 1 2 3 4 5; do x=$((x + 8)); y=$((y - 4)); cmd="$cmd; input motionevent MOVE $x $y"; done
for _ in $(seq 1 12); do x=$((x + 3)); y=$((y - 90)); cmd="$cmd; input motionevent MOVE $x $y"; done
adb shell "$cmd; input motionevent UP $x $y"
sleep 2
after=$(first)
fail=0
if [ -n "$before" ] && [ "$before" != "$after" ]; then echo "OK   Liste gescrollt"; else echo "FEHL Liste steht ($before)"; fail=1; fi
if ui | grep -qE 'resource-id="(snackbar|act-due-today)"'; then echo "FEHL Zeile wurde gewischt"; fail=1; else echo "OK   keine Wischaktion"; fi
exit $fail

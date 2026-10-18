#!/usr/bin/env bash
# Baut die Desktop-App als AppImage und legt sie für den aktuellen Nutzer ab,
# inklusive Eintrag im Programmmenü. Erneut ausführen ersetzt die alte Version.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app_dir="$HOME/Applications"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
target="$app_dir/Markdoist.AppImage"

pnpm --dir "$root" --filter desktop dist:appimage

mkdir -p "$app_dir" "$data_dir/applications" "$data_dir/icons/hicolor/512x512/apps"
install -m 755 "$root/apps/desktop/release/Markdoist.AppImage" "$target"
install -m 644 "$root/apps/desktop/build/icon.png" "$data_dir/icons/hicolor/512x512/apps/markdoist.png"

cat > "$data_dir/applications/markdoist.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Markdoist
Comment=Aufgaben als Markdown-Dateien
Exec="$target" %U
Icon=markdoist
Terminal=false
Categories=Office;
StartupWMClass=Markdoist
DESKTOP

update-desktop-database "$data_dir/applications" 2>/dev/null || true
gtk-update-icon-cache -q "$data_dir/icons/hicolor" 2>/dev/null || true

echo "Installiert: $target"

#!/usr/bin/env python3
"""Erzeugt alle App-Icons aus tools/icon-source.webp (nur Entwicklung, braucht Pillow).
Aufruf: python3 tools/gen-icons.py

Desktop: apps/desktop/build/icons/NxN.png für electron-builder, Fenster und install-desktop-local.sh.
Android: apps/mobile/assets/icon.png, android-icon-foreground.png, android-icon-monochrome.png,
splash-icon.png, favicon.png. Hintergrund des adaptiven Icons ist die Farbe in app.config.ts."""
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tools/icon-source.webp"
DESKTOP = ROOT / "apps/desktop/build"
MOBILE = ROOT / "apps/mobile/assets"

DESKTOP_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
# Adaptives Icon: 108 dp Fläche, sicher sichtbar ist nur der Kreis mit 66 dp Durchmesser.
SAFE_RADIUS = 33 / 108


def load_note() -> Image.Image:
    """Zettel ohne transparenten Rand."""
    img = Image.open(SOURCE).convert("RGBA")
    return img.crop(img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())


def place(note: Image.Image, size: int, scale: float) -> Image.Image:
    """Zettel auf transparente quadratische Fläche setzen, mittig, längste Seite = scale * size."""
    w, h = note.size
    f = scale * size / max(w, h)
    scaled = note.resize((round(w * f), round(h * f)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas


def circle_scale(note: Image.Image, radius: float) -> float:
    """Größter Maßstab (relativ zur Fläche), bei dem jeder sichtbare Pixel im mittigen Kreis mit
    radius (relativ zur Fläche) liegt."""
    w, h = note.size
    alpha = note.getchannel("A").load()
    cx, cy = w / 2, h / 2
    rmax = max(
        math.hypot(x + 0.5 - cx, y + 0.5 - cy) for y in range(h) for x in range(w) if alpha[x, y] > 8
    )
    # rmax in Quellpixeln; längste Seite max(w, h) soll scale * size werden.
    return radius * max(w, h) / rmax * 0.97


def monochrome(note: Image.Image) -> Image.Image:
    """Einfarbige Silhouette für themenabhängige Icons (Android 13+): Zettelumriss gefüllt,
    Schrift und Kästchen auf dem hellen Blatt ausgespart, Haken bleiben stehen."""
    px = note.load()
    light = Image.new("L", note.size)
    m = light.load()
    for y in range(note.height):
        for x in range(note.width):
            r, g, b, a = px[x, y]
            hi, lo = max(r, g, b), min(r, g, b)
            if a > 128 and hi > 170 and (hi - lo) / hi < 0.22:
                m[x, y] = 255
    # Alles, was nicht vom Rand aus erreichbar ist, liegt auf dem hellen Blatt.
    outside = light.copy()
    ImageDraw.floodfill(outside, (0, 0), 128)
    sheet = outside.point(lambda v: 0 if v == 128 else 255)
    holes = ImageChops.subtract(sheet, light)
    solid = note.getchannel("A").point(lambda a: 255 if a > 128 else 0)
    mask = ImageChops.subtract(solid, holes)
    mask = mask.filter(ImageFilter.GaussianBlur(2)).point(lambda v: 255 if v > 128 else 0)
    out = Image.new("RGBA", note.size, (255, 255, 255, 0))
    out.putalpha(mask)
    return out


def main() -> None:
    note = load_note()
    (DESKTOP / "icons").mkdir(parents=True, exist_ok=True)
    desktop = place(note, 1024, 0.94)
    for s in DESKTOP_SIZES:
        desktop.resize((s, s), Image.LANCZOS).save(DESKTOP / f"icons/{s}x{s}.png", optimize=True)

    MOBILE.mkdir(parents=True, exist_ok=True)
    # Aus icon.png schneidet Expo auch das runde Fallback-Icon (Android 7), darum ganz im Kreis.
    place(note, 1024, circle_scale(note, 0.5)).save(MOBILE / "icon.png", optimize=True)
    desktop.resize((48, 48), Image.LANCZOS).save(MOBILE / "favicon.png", optimize=True)
    place(note, 1024, 0.6).save(MOBILE / "splash-icon.png", optimize=True)
    fg_scale = circle_scale(note, SAFE_RADIUS)
    place(note, 1024, fg_scale).save(MOBILE / "android-icon-foreground.png", optimize=True)
    place(monochrome(note), 1024, fg_scale).save(MOBILE / "android-icon-monochrome.png", optimize=True)
    print(f"Vordergrund-Maßstab {fg_scale:.3f}")


if __name__ == "__main__":
    main()

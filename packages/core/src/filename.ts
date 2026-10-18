// Dateinamen aus dem Titel bilden (3.1, F002).
// eslint-disable-next-line no-control-regex -- Steuerzeichen werden absichtlich entfernt
const FORBIDDEN = /[/\\:*?"<>|#^[\]\u0000-\u001f\u007f-\u009f]/g;
const MAX_CHARS = 100;
const MAX_BYTES = 240;

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

function trimEdges(s: string): string {
  return s.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
}

/** Kürzt auf höchstens `maxChars` Zeichen und `maxBytes` UTF-8-Bytes, ohne Zeichen zu zerschneiden. */
function truncate(s: string, maxChars: number, maxBytes: number): string {
  let out = "";
  let chars = 0;
  for (const ch of s) {
    if (chars + 1 > maxChars || utf8Length(out + ch) > maxBytes) break;
    out += ch;
    chars++;
  }
  return out;
}

/** Bereinigter Basisname ohne `.md`. Leer, wenn nichts übrig bleibt. */
export function sanitizeTitle(title: string): string {
  let s = title.normalize("NFC").replace(FORBIDDEN, "").replace(/\s+/g, " ");
  s = trimEdges(s);
  s = truncate(s, MAX_CHARS, MAX_BYTES);
  return trimEdges(s);
}

/**
 * Freier Dateiname für einen Titel. `exists` prüft (case-insensitiv) belegte Namen.
 * Kollisionssuffix ` 2`, ` 3`, … ; Gesamtname inkl. `.md` höchstens 240 UTF-8-Bytes.
 */
export function fileNameForTitle(
  title: string,
  exists: (name: string) => boolean,
  shortId: string,
): string {
  let base = sanitizeTitle(title);
  if (!base) base = `Aufgabe ${shortId}`;
  for (let n = 1; n < 10000; n++) {
    const suffix = n === 1 ? "" : ` ${n}`;
    const room = MAX_BYTES - utf8Length(suffix + ".md");
    const b = trimEdges(truncate(base, MAX_CHARS, room)) || `Aufgabe ${shortId}`;
    const name = `${b}${suffix}.md`;
    if (!exists(name)) return name;
  }
  throw new Error("Kein freier Dateiname gefunden");
}

/** Freier Name beim Wiederherstellen/Verschieben: hängt bei Kollision eine Zahl an. */
export function freeName(name: string, exists: (name: string) => boolean): string {
  if (!exists(name)) return name;
  const m = /^(.*?)(\.[^.]*)?$/.exec(name)!;
  const stem = m[1]!;
  const ext = m[2] ?? "";
  for (let n = 2; n < 10000; n++) {
    const candidate = `${stem} ${n}${ext}`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error("Kein freier Dateiname gefunden");
}

export { utf8Length };

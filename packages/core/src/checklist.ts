// Markdown-Checklisten (5.6): Stellen über markdown-it-Tokens und Quellzeilen bestimmen,
// damit Code-Blöcke und verschachtelte Strukturen unberührt bleiben.
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false });

export interface Checkbox {
  /** Zeile im Body (0-basiert) */
  line: number;
  /** Zeichenposition des Zustandszeichens innerhalb der Zeile */
  col: number;
  checked: boolean;
  /** Text des Eintrags in der ersten Zeile, ohne Marker */
  text: string;
  /** Ende des Eintrags einschließlich Unterpunkten (exklusiv), ohne folgende Leerzeilen */
  end: number;
  /** Verschachtelungstiefe (0 = oberste Listenebene) */
  depth: number;
}

const MARKER = /^([ \t>]*(?:[-+*]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)/;

function splitLines(body: string): string[] {
  return body.split("\n");
}

const isBlank = (l: string | undefined) => l === undefined || l.trim() === "";

export function findCheckboxes(body: string): Checkbox[] {
  const tokens = md.parse(body, {});
  const lines = splitLines(body);
  const out: Checkbox[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === "list_item_close") depth--;
    if (t.type !== "list_item_open" || !t.map) continue;
    depth++;
    const p = tokens[i + 1];
    const inline = tokens[i + 2];
    if (!p || p.type !== "paragraph_open" || !inline || inline.type !== "inline" || !inline.map) continue;
    if (inline.map[0] !== t.map[0]) continue;
    if (!/^\[[ xX]\](\s|$)/.test(inline.content)) continue;
    const lineNo = t.map[0];
    const text = (lines[lineNo] ?? "").replace(/\r$/, "");
    const m = MARKER.exec(text);
    if (!m) continue;
    let end = t.map[1];
    while (end > lineNo + 1 && isBlank(lines[end - 1])) end--;
    out.push({
      line: lineNo,
      col: m[1]!.length + 1,
      checked: m[2] !== " ",
      text: text.slice(m[0].length).trim(),
      end,
      depth: depth - 1,
    });
  }
  return out;
}

function setChar(body: string, cb: Checkbox, ch: string): string {
  const lines = splitLines(body);
  const l = lines[cb.line]!;
  lines[cb.line] = l.slice(0, cb.col) + ch + l.slice(cb.col + 1);
  return lines.join("\n");
}

/** Schaltet genau eine Checkbox um; ändert genau ein Zeichen. `null`, wenn keine Checkbox. */
export function toggleCheckbox(body: string, line: number): string | null {
  const cb = findCheckboxes(body).find((c) => c.line === line);
  if (!cb) return null;
  return setChar(body, cb, cb.checked ? " " : "x");
}

/** Setzt alle angehakten Checklistenelemente zurück (nur beim Wechsel zu neuem Vorkommen). */
export function resetCheckboxes(body: string): string {
  let out = body;
  for (const cb of findCheckboxes(body)) if (cb.checked) out = setChar(out, cb, " ");
  return out;
}

// ---------------------------------------------------------------------------
// Listen (4.6): Einträge sind Checklistenelemente. Alle Funktionen ändern nur die
// betroffenen Zeilen; Zeilenenden (LF/CRLF) und der übrige Body bleiben erhalten.

/** Eintragstext: eine Zeile, ohne führende/folgende Leerzeichen. */
export function cleanItemText(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function eolOf(body: string): string {
  return body.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Bearbeitet die Zeilen eines Bodys, als ende er mit einem Zeilenumbruch.
 * Ein fehlender Abschlusszeilenumbruch bleibt danach fehlend.
 */
function editLines(body: string, fn: (lines: string[], eol: string) => void): string {
  const eol = eolOf(body);
  const open = body !== "" && !body.endsWith("\n");
  const lines = splitLines(open ? body + eol : body);
  fn(lines, eol);
  const out = lines.join("\n");
  return open && out.endsWith(eol) ? out.slice(0, -eol.length) : out;
}

const lineWith = (text: string, eol: string) => (eol === "\r\n" ? `${text}\r` : text);

/** Hängt einen offenen Eintrag hinter den letzten Eintrag der obersten Ebene an. `null` bei leerem Text. */
export function appendItem(body: string, text: string): string | null {
  const t = cleanItemText(text);
  if (!t) return null;
  const top = findCheckboxes(body).filter((c) => c.depth === 0);
  const last = top[top.length - 1];
  if (!last) {
    if (body === "") return `- [ ] ${t}\n`;
    const eol = eolOf(body);
    const base = body.endsWith("\n") ? body : body + eol;
    const lines = splitLines(base);
    const blankBefore = isBlank(lines[lines.length - 2]);
    return base + (blankBefore ? "" : eol) + `- [ ] ${t}` + eol;
  }
  return editLines(body, (lines, eol) => {
    const m = MARKER.exec(lines[last.line]!.replace(/\r$/, ""))!;
    const prefix = /[-+*][ \t]+$/.test(m[1]!) ? m[1]! : m[1]!.replace(/\d{1,9}[.)]([ \t]+)$/, "-$1");
    lines.splice(last.end, 0, lineWith(`${prefix}[ ] ${t}`, eol));
  });
}

/** Ersetzt den Text eines Eintrags. `null`, wenn dort kein Eintrag steht oder der Text leer ist. */
export function setItemText(body: string, line: number, text: string): string | null {
  const t = cleanItemText(text);
  const cb = findCheckboxes(body).find((c) => c.line === line);
  if (!cb || !t) return null;
  return editLines(body, (lines) => {
    const l = lines[line]!;
    const cr = l.endsWith("\r") ? "\r" : "";
    const m = MARKER.exec(l.replace(/\r$/, ""))!;
    lines[line] = `${m[0]} ${t}${cr}`;
  });
}

/** Entfernt einen Eintrag samt Unterpunkten. `null`, wenn dort kein Eintrag steht. */
export function removeItem(body: string, line: number): string | null {
  const cb = findCheckboxes(body).find((c) => c.line === line);
  if (!cb) return null;
  return editLines(body, (lines) => {
    lines.splice(cb.line, cb.end - cb.line);
  });
}

/** Entfernt alle abgehakten Einträge samt Unterpunkten. */
export function removeCheckedItems(body: string): string {
  const ranges: Checkbox[] = [];
  for (const cb of findCheckboxes(body)) {
    if (!cb.checked) continue;
    const prev = ranges[ranges.length - 1];
    if (prev && cb.line < prev.end) continue; // liegt in einem bereits entfernten Eintrag
    ranges.push(cb);
  }
  if (!ranges.length) return body;
  return editLines(body, (lines) => {
    for (const cb of ranges.reverse()) lines.splice(cb.line, cb.end - cb.line);
  });
}

/**
 * Verschiebt einen Eintrag der obersten Ebene samt Unterpunkten vor den Eintrag in Zeile
 * `before` (ebenfalls oberste Ebene) bzw. bei `null` hinter den letzten. `null`, wenn eine
 * der Zeilen kein solcher Eintrag ist.
 */
export function moveItem(body: string, line: number, before: number | null): string | null {
  const top = findCheckboxes(body).filter((c) => c.depth === 0);
  const item = top.find((c) => c.line === line);
  if (!item) return null;
  let target: number;
  if (before === null) target = top[top.length - 1]!.end;
  else {
    const b = top.find((c) => c.line === before);
    if (!b) return null;
    target = b.line;
  }
  if (target >= item.line && target <= item.end) return body;
  return editLines(body, (lines) => {
    const block = lines.splice(item.line, item.end - item.line);
    const at = target > item.line ? target - block.length : target;
    lines.splice(at, 0, ...block);
  });
}

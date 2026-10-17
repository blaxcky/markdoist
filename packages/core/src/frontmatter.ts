// Trennen, Parsen und formaterhaltendes Ändern der YAML-Frontmatter (Abschnitt 7.2).
import { isMap, isScalar, parseDocument, stringify, visit, type Document } from "yaml";

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

export interface SplitFile {
  bom: string;
  eol: "\n" | "\r\n";
  /** `---` + Zeilenende, ohne BOM */
  open: string;
  /** YAML-Text zwischen den Trennzeilen, endet mit Zeilenende oder ist leer */
  yaml: string;
  /** schließende Trennzeile inklusive Zeilenende (falls vorhanden) */
  close: string;
  body: string;
}

/** Trennt Frontmatter und Body an der schließenden `---`-Zeile. `null` = keine Frontmatter. */
export function splitFile(text: string): SplitFile | null {
  let bom = "";
  let rest = text;
  if (rest.startsWith("﻿")) {
    bom = "﻿";
    rest = rest.slice(1);
  }
  const first = /^---[ \t]*(\r?\n)/.exec(rest);
  if (!first) return null;
  const eol = first[1] === "\r\n" ? "\r\n" : "\n";
  const open = first[0];
  let pos = open.length;
  while (pos <= rest.length) {
    const nl = rest.indexOf("\n", pos);
    const lineEnd = nl === -1 ? rest.length : nl + 1;
    const line = rest.slice(pos, lineEnd).replace(/\r?\n$/, "");
    if (/^---[ \t]*$/.test(line)) {
      return {
        bom,
        eol,
        open,
        yaml: rest.slice(open.length, pos),
        close: rest.slice(pos, lineEnd),
        body: rest.slice(lineEnd),
      };
    }
    if (nl === -1) break;
    pos = lineEnd;
  }
  return null;
}

export function joinFile(s: SplitFile): string {
  return s.bom + s.open + s.yaml + s.close + s.body;
}

export interface PairSpan {
  key: string;
  /** Zeichenbereich im YAML-Text: [start, end) einschließlich Zeilenende */
  start: number;
  end: number;
}

export type ParsedFrontmatter =
  | {
      ok: true;
      doc: Document;
      data: Record<string, YamlValue>;
      spans: PairSpan[] | null; // null = nicht chirurgisch bearbeitbar (z. B. Flow-Mapping)
      hasAnchors: boolean;
    }
  | { ok: false; error: "syntax" | "not-mapping" | "duplicate-key"; message: string };

export function parseFrontmatter(yamlText: string): ParsedFrontmatter {
  const doc = parseDocument(yamlText, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
    keepSourceTokens: false,
  });
  if (doc.errors.length > 0) {
    const dup = doc.errors.find((e) => e.code === "DUPLICATE_KEY");
    if (dup) return { ok: false, error: "duplicate-key", message: dup.message };
    return { ok: false, error: "syntax", message: doc.errors[0]!.message };
  }
  if (!isMap(doc.contents)) {
    return { ok: false, error: "not-mapping", message: "Frontmatter ist kein Mapping" };
  }
  let hasAnchors = false;
  visit(doc, {
    Alias() {
      hasAnchors = true;
      return visit.BREAK;
    },
    Node(_k, n) {
      if ((n as { anchor?: string }).anchor) {
        hasAnchors = true;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  let data: Record<string, YamlValue>;
  try {
    data = doc.toJS({ maxAliasCount: 100 }) as Record<string, YamlValue>;
  } catch (e) {
    return { ok: false, error: "syntax", message: String(e) };
  }
  return { ok: true, doc, data, spans: computeSpans(doc, yamlText), hasAnchors };
}

function computeSpans(doc: Document, text: string): PairSpan[] | null {
  const map = doc.contents;
  if (!isMap(map) || map.flow) return null;
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const starts: { key: string; line: number }[] = [];
  for (const item of map.items) {
    const k = item.key;
    if (!isScalar(k) || !k.range) return null;
    const key = String(k.value);
    const line = lineOf(k.range[0]);
    if (lineStarts[line] !== k.range[0]) return null; // Schlüssel nicht in Spalte 0
    starts.push({ key, line });
  }
  const totalLines = text.endsWith("\n") ? lineStarts.length - 1 : lineStarts.length;
  const lineText = (l: number) => {
    const s = lineStarts[l]!;
    const e = l + 1 < lineStarts.length ? lineStarts[l + 1]! : text.length;
    return text.slice(s, e);
  };
  const spans: PairSpan[] = [];
  for (let i = 0; i < starts.length; i++) {
    const startLine = starts[i]!.line;
    let endLine = (i + 1 < starts.length ? starts[i + 1]!.line : totalLines) - 1;
    // Leerzeilen und Kommentare in Spalte 0 am Ende gehören nicht zum Paar.
    while (endLine > startLine && /^(#.*)?\r?\n?$/.test(lineText(endLine))) endLine--;
    const start = lineStarts[startLine]!;
    const end = endLine + 1 < lineStarts.length ? lineStarts[endLine + 1]! : text.length;
    spans.push({ key: starts[i]!.key, start, end });
  }
  return spans;
}

/** Serialisiert ein einzelnes Schlüssel-Wert-Paar im Stil der App. */
export function serializePair(key: string, value: YamlValue, eol: "\n" | "\r\n"): string {
  const out = stringify(
    { [key]: value },
    { version: "1.2", lineWidth: 0, minContentWidth: 0, indentSeq: true, flowCollectionPadding: false },
  );
  return eol === "\n" ? out : out.replace(/\n/g, "\r\n");
}

export interface FieldEdit {
  set?: Record<string, YamlValue>;
  remove?: string[];
}

export type EditResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-frontmatter" | "invalid" | "anchors" | "not-surgical" | "self-check"; message: string };

/** Chirurgische Metadatenänderung: nur die betroffenen Paare werden ersetzt (7.2). */
export function editFrontmatter(text: string, edit: FieldEdit, newBody?: string): EditResult {
  const split = splitFile(text);
  if (!split) return { ok: false, reason: "no-frontmatter", message: "Keine Frontmatter" };
  const parsed = parseFrontmatter(split.yaml);
  if (!parsed.ok) return { ok: false, reason: "invalid", message: parsed.message };
  if (!parsed.spans) {
    return { ok: false, reason: "not-surgical", message: "Frontmatter-Form nicht bearbeitbar" };
  }
  const set = edit.set ?? {};
  const remove = (edit.remove ?? []).filter((k) => !(k in set));
  const touched = new Set([...Object.keys(set), ...remove]);
  if (parsed.hasAnchors) {
    // Anker/Aliase: nicht automatisch bearbeiten, sobald betroffene Felder sie berühren könnten.
    return {
      ok: false,
      reason: "anchors",
      message: "Frontmatter mit YAML-Ankern bitte extern bearbeiten",
    };
  }
  let yaml = split.yaml;
  const spans = [...parsed.spans].sort((a, b) => b.start - a.start);
  const existing = new Set(parsed.spans.map((s) => s.key));
  for (const span of spans) {
    if (!touched.has(span.key)) continue;
    const replacement = span.key in set ? serializePair(span.key, set[span.key]!, split.eol) : "";
    yaml = yaml.slice(0, span.start) + replacement + yaml.slice(span.end);
  }
  let appended = "";
  for (const [k, v] of Object.entries(set)) {
    if (!existing.has(k)) appended += serializePair(k, v, split.eol);
  }
  if (appended) {
    if (yaml.length > 0 && !yaml.endsWith("\n")) yaml += split.eol;
    yaml += appended;
  }
  const result = joinFile({ ...split, yaml, body: newBody ?? split.body });
  const check = selfCheck(split, parsed.data, result, set, remove, newBody ?? split.body);
  if (check) return { ok: false, reason: "self-check", message: check };
  return { ok: true, text: result };
}

function selfCheck(
  before: SplitFile,
  beforeData: Record<string, YamlValue>,
  text: string,
  set: Record<string, YamlValue>,
  remove: string[],
  expectedBody: string,
): string | null {
  const after = splitFile(text);
  if (!after) return "Frontmatter nach Änderung nicht erkennbar";
  if (after.body !== expectedBody) return "Body wurde unerwartet verändert";
  if (after.bom !== before.bom || after.open !== before.open || after.close !== before.close) {
    return "Rahmen der Frontmatter wurde verändert";
  }
  const parsed = parseFrontmatter(after.yaml);
  if (!parsed.ok) return `Ergebnis nicht lesbar: ${parsed.message}`;
  const keys = new Set([...Object.keys(beforeData), ...Object.keys(set)]);
  for (const k of keys) {
    const actual = parsed.data[k];
    if (k in set) {
      if (!deepEqual(actual, set[k])) return `Feld ${k} hat nicht den gewünschten Wert`;
    } else if (remove.includes(k)) {
      if (k in parsed.data) return `Feld ${k} wurde nicht entfernt`;
    } else if (!deepEqual(actual, beforeData[k])) {
      return `Feld ${k} wurde unerwartet verändert`;
    }
  }
  return null;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
  }
  return false;
}

/** Neue Datei aus Feldern in vorgegebener Reihenfolge erzeugen. */
export function createFileText(
  fields: [string, YamlValue | undefined][],
  body: string,
  eol: "\n" | "\r\n" = "\n",
): string {
  let yaml = "";
  for (const [k, v] of fields) if (v !== undefined) yaml += serializePair(k, v, eol);
  return `---${eol}${yaml}---${eol}${body}`;
}

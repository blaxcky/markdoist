// Aufgabenmodell: Einlesen einer Datei mit Lese-Standards und Diagnosen (3.2, 7.1).
import { parseDateValue, type DateValue } from "./dates";
import { parseSimpleFrontmatter } from "./fastyaml";
import { parseFrontmatter, splitFile, type SplitFile, type YamlValue } from "./frontmatter";
import { isUlid } from "./ulid";

export const SUPPORTED_FORMAT_VERSION = 1;

export type Status = "open" | "in-progress" | "done";
export type Priority = "none" | "low" | "normal" | "high";

export const PRIORITY_RANK: Record<Priority, number> = { high: 3, normal: 2, low: 1, none: 0 };

export type DiagnosticCode =
  | "invalid-syntax"
  | "duplicate-key"
  | "not-mapping"
  | "invalid-utf8"
  | "unsupported-format-version"
  | "invalid-format-version"
  | "missing-title"
  | "unknown-status"
  | "unknown-priority"
  | "invalid-inbox"
  | "invalid-due"
  | "invalid-scheduled"
  | "invalid-recurrence"
  | "unsupported-recurrence"
  | "invalid-recurrence-structure"
  | "series-needs-clarification"
  | "series-end-pending"
  | "series-conflicting-history"
  | "duplicate-id"
  | "conflict-variant"
  | "anchors";

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  /** schwerwiegend = Datei schreibgeschützt bzw. nicht als Aufgabe nutzbar */
  severity: "error" | "warning" | "info";
  field?: string;
}

export interface FileRef {
  /** plattformspezifische Referenz (Pfad oder SAF-URI) */
  ref: string;
  name: string;
}

export interface TaskFields {
  id: string | null;
  formatVersion: number | null;
  title: string;
  status: Status;
  statusRaw: YamlValue | undefined;
  priority: Priority;
  inbox: boolean;
  due: DateValue | null;
  scheduled: DateValue | null;
  dateCreated: string | null;
  dateModified: string | null;
  completedDate: string | null;
  recurrence: string | null;
}

export interface Task extends FileRef {
  kind: "task";
  /** Identität im Index: echte ID oder temporäre, ordnerbezogene Identität aus der Referenz */
  key: string;
  text: string;
  hash: string;
  mtime: number | null;
  split: SplitFile;
  data: Record<string, YamlValue>;
  fields: TaskFields;
  body: string;
  diagnostics: Diagnostic[];
  /** schreibgeschützt (höhere Formatversion, unbekannte Serienstruktur, Anker o. ä.) */
  readOnly: boolean;
  hasAnchors: boolean;
}

export interface UnrecognizedFile extends FileRef {
  kind: "unrecognized" | "invalid";
  key: string;
  text: string;
  hash: string;
  mtime: number | null;
  diagnostics: Diagnostic[];
}

export type IndexedFile = Task | UnrecognizedFile;

const STATUSES: Status[] = ["open", "in-progress", "done"];
const PRIORITIES: Priority[] = ["none", "low", "normal", "high"];

export interface ReadInput extends FileRef {
  text: string;
  hash: string;
  mtime: number | null;
  /** true, wenn die Bytes kein gültiges UTF-8 waren */
  invalidUtf8?: boolean;
  /** bereits geparste Frontmatter desselben Textes (Cache), spart das erneute YAML-Parsen */
  preParsed?: { data: Record<string, YamlValue>; hasAnchors: boolean };
}

/** Liest eine Datei. Schreibt nie etwas (7.1). */
export function readTaskFile(input: ReadInput): IndexedFile {
  const base = {
    ref: input.ref,
    name: input.name,
    key: `ref:${input.ref}`,
    text: input.text,
    hash: input.hash,
    mtime: input.mtime,
  };
  if (input.invalidUtf8) {
    return {
      ...base,
      kind: "invalid",
      diagnostics: [{ code: "invalid-utf8", message: "Datei ist kein gültiges UTF-8", severity: "error" }],
    };
  }
  const split = splitFile(input.text);
  if (!split) {
    return {
      ...base,
      kind: "unrecognized",
      diagnostics: [
        { code: "not-mapping", message: "Keine YAML-Frontmatter – nicht als Aufgabe erkannt", severity: "info" },
      ],
    };
  }
  const simple = input.preParsed ? null : parseSimpleFrontmatter(split.yaml);
  const parsed = input.preParsed
    ? ({ ok: true, ...input.preParsed } as const)
    : simple
      ? ({ ok: true, data: simple, hasAnchors: false } as const)
      : parseFrontmatter(split.yaml);
  if (!parsed.ok) {
    const code: DiagnosticCode =
      parsed.error === "duplicate-key"
        ? "duplicate-key"
        : parsed.error === "not-mapping"
          ? "not-mapping"
          : "invalid-syntax";
    const msg =
      parsed.error === "duplicate-key"
        ? `Doppelter YAML-Schlüssel: ${parsed.message}`
        : parsed.error === "not-mapping"
          ? "Frontmatter ist kein Mapping"
          : `YAML-Syntaxfehler: ${parsed.message}`;
    return {
      ...base,
      kind: parsed.error === "not-mapping" ? "unrecognized" : "invalid",
      diagnostics: [{ code, message: msg, severity: "error" }],
    };
  }
  const data = parsed.data;
  const diagnostics: Diagnostic[] = [];
  let readOnly = false;
  if (parsed.hasAnchors) {
    diagnostics.push({
      code: "anchors",
      message: "Frontmatter enthält YAML-Anker/Aliase – Metadaten bitte extern bearbeiten",
      severity: "warning",
    });
  }

  // format_version
  let formatVersion: number | null = null;
  if ("format_version" in data) {
    const v = data.format_version;
    if (typeof v === "number" && Number.isInteger(v) && v > 0) {
      formatVersion = v;
      if (v > SUPPORTED_FORMAT_VERSION) {
        readOnly = true;
        diagnostics.push({
          code: "unsupported-format-version",
          message: `Formatversion ${v} ist neuer als unterstützt (${SUPPORTED_FORMAT_VERSION}) – schreibgeschützt`,
          severity: "error",
          field: "format_version",
        });
      }
    } else {
      readOnly = true;
      diagnostics.push({
        code: "invalid-format-version",
        message: "Ungültige Formatversion – schreibgeschützt",
        severity: "error",
        field: "format_version",
      });
    }
  }

  // id
  const rawId = data.id;
  const id = typeof rawId === "string" && rawId.trim() !== "" ? rawId.trim() : null;

  // title
  let title: string;
  if (typeof data.title === "string" && data.title.trim() !== "") {
    title = data.title;
  } else if (typeof data.title === "number" || typeof data.title === "boolean") {
    title = String(data.title);
  } else {
    title = input.name.replace(/\.md$/i, "");
    diagnostics.push({
      code: "missing-title",
      message: "Kein Titel im YAML – Dateiname wird verwendet",
      severity: "info",
      field: "title",
    });
  }

  // status
  let status: Status = "open";
  if ("status" in data) {
    if (STATUSES.includes(data.status as Status)) status = data.status as Status;
    else
      diagnostics.push({
        code: "unknown-status",
        message: `Unbekannter Status „${String(data.status)}“ – wird als offen gelistet`,
        severity: "warning",
        field: "status",
      });
  }

  // priority
  let priority: Priority = "none";
  if ("priority" in data) {
    if (PRIORITIES.includes(data.priority as Priority)) priority = data.priority as Priority;
    else
      diagnostics.push({
        code: "unknown-priority",
        message: `Unbekannte Priorität „${String(data.priority)}“ – als keine behandelt`,
        severity: "warning",
        field: "priority",
      });
  }

  // inbox
  let inbox = status !== "done";
  if ("inbox" in data) {
    if (typeof data.inbox === "boolean") inbox = data.inbox;
    else {
      inbox = true;
      diagnostics.push({
        code: "invalid-inbox",
        message: `Eingang „${String(data.inbox)}“ ist kein Boolean – als Eingang behandelt`,
        severity: "warning",
        field: "inbox",
      });
    }
  }

  const readDate = (field: "due" | "scheduled"): DateValue | null => {
    if (!(field in data) || data[field] === null || data[field] === "") return null;
    const v = parseDateValue(data[field]);
    if (!v) {
      diagnostics.push({
        code: field === "due" ? "invalid-due" : "invalid-scheduled",
        message: `Ungültiges Datum in ${field}: „${String(data[field])}“ – wird ignoriert`,
        severity: "warning",
        field,
      });
    }
    return v;
  };

  const str = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : null);
  const fields: TaskFields = {
    id,
    formatVersion,
    title,
    status,
    statusRaw: data.status,
    priority,
    inbox,
    due: readDate("due"),
    scheduled: readDate("scheduled"),
    dateCreated: str("dateCreated"),
    dateModified: str("dateModified"),
    completedDate: str("completedDate"),
    recurrence: "recurrence" in data && data.recurrence !== null ? String(data.recurrence) : null,
  };

  return {
    ...base,
    key: id ? `id:${id}` : base.key,
    kind: "task",
    split,
    data,
    fields,
    body: split.body,
    diagnostics,
    readOnly,
    hasAnchors: parsed.hasAnchors,
  };
}

export function hasValidId(t: Task): boolean {
  return isUlid(t.fields.id);
}

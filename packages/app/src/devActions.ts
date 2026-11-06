// Programmieren (4.8): Abläufe, die mehrere Dateien betreffen. Jeder Schritt ist ein eigener
// Schreibvorgang mit eigenem Verlaufseintrag.
import { devItemsOf, type Index, type TaskAction, type TaskView } from "@markdoist/core";
import type { Outcome, Repository } from "./repository";
import { T } from "./texts";

/**
 * Kreis eines Programmier-Eintrags: Ein offener Eintrag wird erst „In Arbeit“ (halb gefüllter Kreis),
 * erst der nächste Klick erledigt ihn. Gibt null zurück, wenn der Klick wie sonst erledigt bzw.
 * wiederöffnet (`toggleDoneAction`).
 */
export function startDevWorkAction(v: TaskView): { action: TaskAction; label: string } | null {
  const f = v.task.fields;
  if (!f.isDevItem || f.status === "in-progress" || f.status === "done") return null;
  return { action: { type: "setStatus", status: "in-progress" }, label: T.status["in-progress"] };
}

/**
 * Legt einen Eintrag in einer Programmier-Liste an. Eine Liste ohne ID (extern angelegt) erhält
 * vorher eine, damit der Eintrag auf sie verweisen kann.
 */
export async function createDevItem(
  repo: Repository,
  list: TaskView,
  title: string,
  shown?: (ref: string) => void,
): Promise<Outcome> {
  let id = list.task.fields.id;
  if (!id) {
    const o = await repo.perform(list.task.ref, { type: "assignNewId" }, "ID vergeben");
    if (o.status !== "ok") return o;
    id = repo.findTask(o.ref ?? list.task.ref)?.fields.id ?? null;
    if (!id) return { status: "error", message: "Liste hat keine ID" };
  }
  return repo.create({ title, kind: "dev-item", devList: id }, shown);
}

/** Erste nicht erfolgreiche Antwort, sonst die letzte. */
async function each(refs: string[], run: (ref: string) => Promise<Outcome>): Promise<Outcome> {
  let last: Outcome = { status: "noop" };
  for (const ref of refs) {
    last = await run(ref);
    if (last.status !== "ok" && last.status !== "noop") return last;
  }
  return last;
}

/** „Erledigte entfernen“: alle erledigten Einträge der Liste (`null` = ohne Liste) in den Papierkorb. */
export function trashDoneDevItems(repo: Repository, idx: Index, list: TaskView | null): Promise<Outcome> {
  const refs = devItemsOf(idx, list)
    .filter((v) => v.task.fields.status === "done")
    .map((v) => v.task.ref);
  return each(refs, (ref) => repo.moveToTrash(ref));
}

/** „Liste löschen“: erst alle Einträge, dann die Liste in den Papierkorb. */
export async function trashDevList(repo: Repository, idx: Index, list: TaskView): Promise<Outcome> {
  const o = await each(
    devItemsOf(idx, list).map((v) => v.task.ref),
    (ref) => repo.moveToTrash(ref),
  );
  if (o.status !== "ok" && o.status !== "noop") return o;
  return repo.moveToTrash(list.task.ref);
}

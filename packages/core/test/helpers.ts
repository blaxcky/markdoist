import { Temporal } from "temporal-polyfill";
import {
  applyPlan,
  hashText,
  planAction,
  readTaskFile,
  resolveLocal,
  type ActionContext,
  type Plan,
  type Task,
  type TaskAction,
} from "../src";

export const TZ = "Europe/Berlin";

let counter = 0;
export function ctxAt(local: string, timeZone = TZ): ActionContext {
  return {
    at: resolveLocal(Temporal.PlainDateTime.from(local), timeZone),
    timeZone,
    newId: () => {
      counter++;
      return `01TEST${String(counter).padStart(20, "0")}`;
    },
  };
}

export function task(text: string, name = "Test.md"): Task {
  const f = readTaskFile({ ref: `/x/${name}`, name, text, hash: hashText(text), mtime: null });
  if (f.kind !== "task") throw new Error(`keine Aufgabe: ${JSON.stringify(f.diagnostics)}`);
  return f;
}

export function run(text: string, action: TaskAction, ctx: ActionContext): { plan: Plan; text: string } {
  const plan = planAction(task(text), action, ctx);
  if (plan.kind !== "edit") return { plan, text };
  const r = applyPlan(text, plan);
  if (!r.ok) throw new Error(r.message);
  return { plan, text: r.text };
}

export function fm(lines: string[], body = ""): string {
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

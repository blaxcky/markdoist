// Erzeugt N Testaufgaben (à ~3 KiB) für die Leistungsmessung (M7, AK-40).
// Aufruf: node perf-seed.mjs <zielordner> [N]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, nArg] = process.argv.slice(2);
const N = Number(nArg ?? 2000);
const words = ["Zahnarzt", "Steuer", "Bettwäsche", "Einkauf", "Projekt", "Rückblick", "Garten", "Rechnung", "Auto", "Urlaub"];
mkdirSync(dir, { recursive: true });
for (let i = 0; i < N; i++) {
  const due = `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
  const fm = [
    "---",
    `id: 01K7C9V3QH2T8M4N6P${String(i).padStart(8, "0")}`,
    "format_version: 1",
    `title: ${words[i % words.length]} Aufgabe ${i}`,
    `status: ${i % 5 === 0 ? "done" : "open"}`,
    `priority: ${["none", "low", "normal", "high"][i % 4]}`,
    `inbox: ${i % 3 === 0}`,
    `due: ${due}`,
    ...(i % 7 === 0 ? ["recurrence: FREQ=WEEKLY;BYDAY=MO", "recurrence_start: 2026-01-05", `recurrence_instance: ${due}`] : []),
    "dateCreated: 2026-10-01T08:00:00+02:00",
    "---",
  ];
  let body = "";
  while (body.length < 3000) body += `- [ ] Schritt ${body.length} für ${words[(i + body.length) % words.length]}\n`;
  writeFileSync(join(dir, `Aufgabe ${i}.md`), `${fm.join("\n")}\n${body}`);
}
console.log(`${N} Dateien in ${dir}`);

// Führt die Vitest-Suite unter allen Zeitzonen aus Abschnitt 9 aus.
import { spawnSync } from "node:child_process";

const zones = ["Europe/Berlin", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"];
let failed = false;
for (const tz of zones) {
  console.log(`\n=== TZ=${tz} ===`);
  const r = spawnSync("pnpm", ["exec", "vitest", "run"], {
    stdio: "inherit",
    env: { ...process.env, TZ: tz },
  });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);

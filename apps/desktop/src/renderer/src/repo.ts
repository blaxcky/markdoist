// Repository je Ordner und React-Hooks.
import { useSyncExternalStore } from "react";
import { Repository, type RepoState } from "@markdoist/app";
import { Temporal, type Clock } from "@markdoist/core";
import { bridge, ipcAdapter } from "./bridge";

export function systemClock(): Clock {
  return { now: () => Temporal.Now.instant(), timeZone: Temporal.Now.timeZoneId() };
}

/** Testuhr über URL-Parameter `?now=2026-10-12T10:00&tz=Europe/Berlin` (nur für E2E). */
function makeClock(): () => Clock {
  const p = new URLSearchParams(location.search);
  const fixed = p.get("now");
  if (!fixed) return systemClock;
  const tz = p.get("tz") ?? "Europe/Berlin";
  const startReal = Date.now();
  const startFake = Temporal.PlainDateTime.from(fixed).toZonedDateTime(tz).epochMilliseconds;
  return () => ({ now: () => Temporal.Instant.fromEpochMilliseconds(startFake + (Date.now() - startReal)), timeZone: tz });
}

export const clock = makeClock();

export function createRepository(folder: string): Repository {
  return new Repository({ adapter: ipcAdapter(), kv: bridge().kv, folder, clock });
}

export function useRepoState(repo: Repository): RepoState {
  return useSyncExternalStore(
    (fn) => repo.subscribe(fn),
    () => repo.getState(),
  );
}

/** „Heute“ neu auswerten: Mitternacht, Fokus, Zeitzonenwechsel (Plan 3.3). */
export function startClockWatch(repo: Repository): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let lastZone = clock().timeZone;
  const schedule = () => {
    const c = clock();
    const now = c.now().toZonedDateTimeISO(c.timeZone);
    const next = now.toPlainDate().add({ days: 1 }).toZonedDateTime(c.timeZone);
    const ms = Math.min(next.epochMilliseconds - now.epochMilliseconds + 500, 60_000);
    timer = setTimeout(() => {
      const z = clock().timeZone;
      if (z !== lastZone) lastZone = z;
      repo.refreshClock();
      schedule();
    }, ms);
  };
  schedule();
  return () => clearTimeout(timer);
}

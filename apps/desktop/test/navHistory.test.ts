import { describe, expect, it } from "vitest";
import { emptyHistory, NAV_HISTORY_MAX, pushLocation, step, type NavHistory, type NavLocation } from "../src/renderer/src/navHistory";

const loc = (view: string, child: string | null = null): NavLocation => ({ view, child });
const build = (...locs: NavLocation[]) => locs.reduce<NavHistory>(pushLocation, emptyHistory());
const keep = (l: NavLocation) => l;

describe("navHistory", () => {
  it("geht zurück und vor", () => {
    let h = build(loc("today"), loc("dev"), loc("dev", "a"));
    let r = step(h, -1, loc("dev", "a"), keep);
    expect(r.target).toEqual(loc("dev"));
    h = r.history;
    r = step(h, -1, loc("dev"), keep);
    expect(r.target).toEqual(loc("today"));
    h = r.history;
    expect(step(h, -1, loc("today"), keep).target).toBeNull();
    r = step(h, 1, loc("today"), keep);
    expect(r.target).toEqual(loc("dev"));
  });

  it("doppelt den aktuellen Ort nicht, auch nicht nach einem Sprung", () => {
    let h = build(loc("today"), loc("today"), loc("lists"));
    expect(h.entries).toHaveLength(2);
    h = step(h, -1, loc("lists"), keep).history;
    // Die Ansicht meldet den angesprungenen Ort; der Vor-Eintrag bleibt erhalten.
    h = pushLocation(h, loc("today"));
    expect(h.index).toBe(0);
    expect(step(h, 1, loc("today"), keep).target).toEqual(loc("lists"));
  });

  it("ein neuer Ort nach Zurück verwirft die Vor-Einträge", () => {
    let h = build(loc("today"), loc("lists"), loc("lists", "x"));
    h = step(h, -1, loc("lists", "x"), keep).history;
    h = pushLocation(h, loc("dev"));
    expect(h.entries).toEqual([loc("today"), loc("lists"), loc("dev")]);
    expect(step(h, 1, loc("dev"), keep).target).toBeNull();
  });

  it("überspringt nicht mehr erreichbare Orte und solche gleich dem aktuellen", () => {
    const h = build(loc("dev"), loc("dev", "gone"), loc("dev"), loc("dev", "b"));
    const r = step(h, -1, loc("dev", "b"), (l) => (l.child === "gone" ? null : l));
    expect(r.target).toEqual(loc("dev"));
    expect(r.history.index).toBe(2);
    const r2 = step(r.history, -1, loc("dev"), (l) => (l.child === "gone" ? null : l));
    expect(r2.target).toBeNull();
    expect(r2.history).toBe(r.history);
  });

  it("übernimmt umbenannte Referenzen", () => {
    const h = build(loc("lists", "alt.md"), loc("today"));
    const r = step(h, -1, loc("today"), (l) => (l.child === "alt.md" ? { ...l, child: "neu.md" } : l));
    expect(r.target).toEqual(loc("lists", "neu.md"));
    expect(r.history.entries[0]).toEqual(loc("lists", "neu.md"));
  });

  it("begrenzt die Länge", () => {
    let h = emptyHistory();
    for (let i = 0; i < NAV_HISTORY_MAX + 10; i++) h = pushLocation(h, loc("lists", String(i)));
    expect(h.entries).toHaveLength(NAV_HISTORY_MAX);
    expect(h.entries[0]).toEqual(loc("lists", "10"));
    expect(h.index).toBe(NAV_HISTORY_MAX - 1);
  });
});

import { describe, expect, it } from "vitest";
import { clampZoom, stepZoom, zoomCommand } from "../src/main/zoom";

const key = (key: string, mods: Partial<{ control: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}, type = "keyDown") => ({
  type,
  key,
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...mods,
});

describe("Ansichtsgröße (4.5)", () => {
  it("stepZoom: 10-%-Schritte ohne Gleitkommareste", () => {
    let z = 1;
    for (const want of [1.1, 1.2, 1.3]) expect((z = stepZoom(z, "in"))).toBe(want);
    for (const want of [1.2, 1.1, 1, 0.9]) expect((z = stepZoom(z, "out"))).toBe(want);
    expect(stepZoom(1.5, "reset")).toBe(1);
  });

  it("stepZoom: Grenzen 70 % und 200 %", () => {
    expect(stepZoom(2, "in")).toBe(2);
    expect(stepZoom(0.7, "out")).toBe(0.7);
  });

  it("clampZoom: Unbrauchbares wird 1, Ausreißer werden begrenzt", () => {
    expect(clampZoom("x")).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(null)).toBe(1);
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(0.1)).toBe(0.7);
    expect(clampZoom(1.23)).toBe(1.2);
  });

  it("zoomCommand: Plus (deutsch, Ziffernblock, US mit =), Minus, 0", () => {
    expect(zoomCommand(key("+", { control: true }))).toBe("in");
    expect(zoomCommand(key("+", { control: true, shift: true }))).toBe("in");
    expect(zoomCommand(key("=", { control: true }))).toBe("in");
    expect(zoomCommand(key("+", { meta: true }))).toBe("in");
    expect(zoomCommand(key("-", { control: true }))).toBe("out");
    expect(zoomCommand(key("0", { control: true }))).toBe("reset");
  });

  it("zoomCommand: ohne Ctrl, mit Alt, beim Loslassen oder andere Tasten nichts", () => {
    expect(zoomCommand(key("+"))).toBeNull();
    expect(zoomCommand(key("+", { control: true, alt: true }))).toBeNull();
    expect(zoomCommand(key("+", { control: true }, "keyUp"))).toBeNull();
    expect(zoomCommand(key("1", { control: true }))).toBeNull();
    expect(zoomCommand(key("z", { control: true }))).toBeNull();
  });
});

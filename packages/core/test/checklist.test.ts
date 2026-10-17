import { describe, expect, it } from "vitest";
import { findCheckboxes, resetCheckboxes, toggleCheckbox } from "../src/checklist";

const body = [
  "## Ablauf",
  "- [x] a",
  "  - [X] b",
  "",
  "```",
  "- [x] code",
  "```",
  "",
  "    - [x] eingerückter Code",
  "",
  "1. [x] num",
  "> - [x] zitat",
  "- [ ] offen",
  "- [x]kein Abstand",
].join("\r\n");

describe("Checklisten (5.6, AK-21)", () => {
  it("findet nur echte Checklistenelemente", () => {
    expect(findCheckboxes(body).map((c) => c.line)).toEqual([1, 2, 10, 11, 12]);
  });
  it("Reset ändert nur echte Haken, Code bleibt", () => {
    const r = resetCheckboxes(body);
    expect(r).toBe(
      body
        .replace("- [x] a", "- [ ] a")
        .replace("- [X] b", "- [ ] b")
        .replace("1. [x] num", "1. [ ] num")
        .replace("> - [x] zitat", "> - [ ] zitat"),
    );
    expect(r).toContain("- [x] code");
    expect(r).toContain("    - [x] eingerückter Code");
  });
  it("Umschalten ändert genau ein Zeichen", () => {
    const r = toggleCheckbox(body, 12)!;
    expect(r.length).toBe(body.length);
    let diff = 0;
    for (let i = 0; i < r.length; i++) if (r[i] !== body[i]) diff++;
    expect(diff).toBe(1);
    expect(toggleCheckbox(body, 5)).toBeNull();
  });
});

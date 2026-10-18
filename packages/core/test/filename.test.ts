import { describe, expect, it } from "vitest";
import { fileNameForTitle } from "../src";

describe("Dateinamen (3.1)", () => {
  it("entfernt C0- und C1-Steuerzeichen", () => {
    expect(fileNameForTitle("A\u0007B\u0085C\u009fD", () => false, "ID")).toBe("ABCD.md");
  });
});

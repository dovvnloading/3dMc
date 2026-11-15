import { describe, expect, it } from "vitest";
import { addRecentColor, MAX_RECENT_COLORS } from "./recentColors";

describe("recent painted colours", () => {
  it("starts empty, tracks newest first, deduplicates case-insensitively", () => {
    const a = addRecentColor([], "#ABC");
    expect(a).toEqual(["#aabbcc"]);
    const b = addRecentColor(a, "#102030");
    expect(b).toEqual(["#102030", "#aabbcc"]);
    expect(addRecentColor(b, "#AABBCC")).toEqual(["#aabbcc", "#102030"]);
    expect(addRecentColor(b, "#102030")).toBe(b);
  });

  it("retains at most the last twelve distinct painted colours", () => {
    let recent: readonly string[] = [];
    for (let n = 0; n < MAX_RECENT_COLORS + 4; n++)
      recent = addRecentColor(recent, "#" + n.toString(16).padStart(6, "0"));
    expect(recent).toHaveLength(12);
    expect(recent[0]).toBe("#00000f");
    expect(recent.at(-1)).toBe("#000004");
    recent = addRecentColor(recent, "#000004");
    expect(recent[0]).toBe("#000004");
    expect(new Set(recent).size).toBe(12);
  });

  it("ignores invalid colour and never mutates the list", () => {
    const original = ["#aabbcc"];
    expect(addRecentColor(original, "not a colour")).toBe(original);
    expect(original).toEqual(["#aabbcc"]);
  });
});

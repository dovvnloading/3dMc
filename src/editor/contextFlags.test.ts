import { describe, expect, it } from "vitest";
import { createSampleDocument, setCuboidFlags, toggleFlag } from "./domain";

describe("selection visibility and locking flags", () => {
  it("applies mixed-state changes in one document edit and preserves unaffected nodes", () => {
    const start = createSampleDocument();
    const mixed = toggleFlag(start, "body", "locked");
    const next = setCuboidFlags(mixed, ["body", "base"], "locked", true);
    expect(next.cuboids[0]?.locked).toBe(true);
    expect(next.cuboids[1]?.locked).toBe(true);
    expect(next.cuboids[2]).toBe(start.cuboids[2]);
    expect(setCuboidFlags(next, ["body", "base"], "locked", true)).toBe(next);
    expect(setCuboidFlags(next, [], "visible", false)).toBe(next);
  });

  it("keeps single-row toggles and multi-selection updates consistent", () => {
    const start = createSampleDocument();
    const hide = setCuboidFlags(start, ["body"], "visible", false);
    expect(toggleFlag(start, "body", "visible")).toEqual(hide);
    expect(toggleFlag(start, "not-an-element", "visible")).toBe(start);
    const reveal = setCuboidFlags(hide, ["body", "base"], "visible", true);
    expect(reveal.cuboids[0]?.visible).toBe(true);
    expect(reveal.cuboids[1]).toBe(start.cuboids[1]);
  });
});

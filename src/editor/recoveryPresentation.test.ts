import { describe, expect, it } from "vitest";
import { currentAcknowledgement, isCurrentRevisionSaved, recoveryStatusText } from "./recoveryPresentation";
import type { RecoveryAcknowledgement } from "./recoveryPresentation";

const ack: RecoveryAcknowledgement = { session: 3, revision: 7, savedAt: 10_000, modelCount: 2 };

describe("truthful local recovery status", () => {
  it("does not report saving while writer ownership is absent", () => {
    expect(recoveryStatusText("blocked", "saved")).toMatch(/Other tab/);
    expect(recoveryStatusText("failed", "saved")).toMatch(/unavailable/);
    expect(recoveryStatusText("checking", "unsaved")).toMatch(/Checking/);
    expect(recoveryStatusText("owned", "failed")).toMatch(/download backup/);
  });

  it("only acknowledges an exact current-session committed revision", () => {
    expect(isCurrentRevisionSaved("owned", "saved", 3, 7, ack)).toBe(true);
    expect(isCurrentRevisionSaved("owned", "saved", 3, 8, ack)).toBe(false);
    expect(isCurrentRevisionSaved("owned", "saving", 3, 7, ack)).toBe(false);
    expect(isCurrentRevisionSaved("blocked", "saved", 3, 7, ack)).toBe(false);
    expect(isCurrentRevisionSaved("owned", "saved", 4, 7, ack)).toBe(false);
    expect(isCurrentRevisionSaved("owned", "saved", 3, 7, null)).toBe(false);
    expect(currentAcknowledgement(ack, 4)).toBeNull();
    expect(currentAcknowledgement(ack, 3)).toEqual(ack);
  });
});

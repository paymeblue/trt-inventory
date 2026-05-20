import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  canApplyTransition,
  canManageDisputes,
  isDisputeMessagingOpen,
} from "@/lib/dispute-resolution";

describe("dispute resolution workflow", () => {
  it("only coordinators manage disputes", () => {
    expect(canManageDisputes("super_admin")).toBe(true);
    expect(canManageDisputes("logistics")).toBe(true);
    expect(canManageDisputes("pm")).toBe(false);
    expect(canManageDisputes("installer")).toBe(false);
  });

  it("messaging open until resolved or closed", () => {
    expect(isDisputeMessagingOpen("open")).toBe(true);
    expect(isDisputeMessagingOpen("under_review")).toBe(true);
    expect(isDisputeMessagingOpen("resolved")).toBe(false);
    expect(isDisputeMessagingOpen("closed")).toBe(false);
  });

  it("resolve requires summary via transition guard in API", () => {
    expect(canApplyTransition("open", "resolve")).toBe(true);
    expect(canApplyTransition("closed", "resolve")).toBe(false);
    expect(allowedTransitions("resolved")).toContain("close");
    expect(allowedTransitions("resolved")).toContain("reopen");
  });
});

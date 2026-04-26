import { describe, it, expect, beforeEach, vi } from "vitest";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("session handoff token", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.resetModules();
  });

  it("round-trips actor fields before expiry", async () => {
    const { signSessionHandoff, verifySessionHandoff } = await import(
      "@/lib/auth-handoff"
    );
    const actor = {
      userId: "u1",
      email: "a@b.co",
      role: "installer" as const,
      name: "Pat",
    };
    const t = signSessionHandoff(actor, 60_000);
    const out = verifySessionHandoff(t);
    expect(out).toMatchObject({ ...actor, exp: expect.any(Number) });
  });

  it("rejects tampered tokens", async () => {
    const { signSessionHandoff, verifySessionHandoff } = await import(
      "@/lib/auth-handoff"
    );
    const t = signSessionHandoff(
      {
        userId: "u1",
        email: "a@b.co",
        role: "installer",
        name: "Pat",
      },
      60_000,
    );
    expect(verifySessionHandoff(t.slice(0, -1))).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const { signSessionHandoff, verifySessionHandoff } = await import(
      "@/lib/auth-handoff"
    );
    const t = signSessionHandoff(
      {
        userId: "u1",
        email: "a@b.co",
        role: "installer",
        name: "Pat",
      },
      -1,
    );
    expect(verifySessionHandoff(t)).toBeNull();
  });
});

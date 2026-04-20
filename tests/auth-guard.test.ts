import { describe, expect, it } from "vitest";
import { checkRole, toActor } from "@/lib/auth-guard";

const completeSession = {
  userId: "u-1",
  email: "pm@example.com",
  role: "pm" as const,
  name: "PM One",
};

describe("toActor", () => {
  it("builds an actor when every required field is present", () => {
    const actor = toActor(completeSession);
    expect(actor).toEqual(completeSession);
  });

  it("returns null when userId is missing", () => {
    expect(toActor({ ...completeSession, userId: undefined })).toBeNull();
  });

  it("returns null when email is missing", () => {
    expect(toActor({ ...completeSession, email: undefined })).toBeNull();
  });

  it("returns null when role is missing", () => {
    expect(toActor({ ...completeSession, role: undefined })).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(toActor({ ...completeSession, name: undefined })).toBeNull();
  });

  it("returns null for a completely empty session envelope", () => {
    expect(toActor({})).toBeNull();
  });

  it("strips unknown fields — returns only the documented shape", () => {
    // iron-session can persist anything you put in it; toActor must not
    // leak extras into server contexts.
    const withExtra = { ...completeSession, hacked: true };
    const actor = toActor(withExtra as never);
    expect(actor).not.toBeNull();
    expect(Object.keys(actor!).sort()).toEqual(
      ["email", "name", "role", "userId"].sort(),
    );
  });
});

describe("checkRole", () => {
  it("returns 401 when no actor is present", () => {
    expect(checkRole(null)).toEqual({ ok: false, status: 401 });
    expect(checkRole(null, "pm")).toEqual({ ok: false, status: 401 });
    expect(checkRole(null, "installer")).toEqual({ ok: false, status: 401 });
  });

  it("allows any authenticated actor when no role is required", () => {
    const r = checkRole(completeSession);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor).toEqual(completeSession);
  });

  it("allows a PM accessing a PM-only action", () => {
    const r = checkRole(completeSession, "pm");
    expect(r.ok).toBe(true);
  });

  it("denies a PM trying to perform an installer-only action with 403", () => {
    expect(checkRole(completeSession, "installer")).toEqual({
      ok: false,
      status: 403,
    });
  });

  it("denies an installer trying to perform a PM-only action with 403", () => {
    const installer = { ...completeSession, role: "installer" as const };
    expect(checkRole(installer, "pm")).toEqual({ ok: false, status: 403 });
  });

  it("distinguishes 401 (no auth) from 403 (wrong role)", () => {
    // This is the most important authz invariant: an unauthenticated user
    // must never be reported as "wrong role" and vice versa — they have
    // very different UX implications (re-login vs access denied).
    const notAuthed = checkRole(null, "pm");
    const wrongRole = checkRole(completeSession, "installer");
    expect(notAuthed.ok).toBe(false);
    expect(wrongRole.ok).toBe(false);
    if (!notAuthed.ok && !wrongRole.ok) {
      expect(notAuthed.status).toBe(401);
      expect(wrongRole.status).toBe(403);
    }
  });
});

describe("auth guard — end-to-end role matrix", () => {
  type Actor = Parameters<typeof checkRole>[0];
  const pm: Actor = { ...completeSession, role: "pm" };
  const installer: Actor = { ...completeSession, role: "installer" };

  const matrix: Array<{
    actor: Actor;
    required: "pm" | "installer" | undefined;
    expect: "ok" | 401 | 403;
  }> = [
    { actor: null, required: undefined, expect: 401 },
    { actor: null, required: "pm", expect: 401 },
    { actor: null, required: "installer", expect: 401 },
    { actor: pm, required: undefined, expect: "ok" },
    { actor: pm, required: "pm", expect: "ok" },
    { actor: pm, required: "installer", expect: 403 },
    { actor: installer, required: undefined, expect: "ok" },
    { actor: installer, required: "pm", expect: 403 },
    { actor: installer, required: "installer", expect: "ok" },
  ];

  for (const row of matrix) {
    const actorLabel = row.actor?.role ?? "none";
    it(`actor=${actorLabel}, requires=${row.required ?? "any"} -> ${row.expect}`, () => {
      const r = checkRole(row.actor, row.required);
      if (row.expect === "ok") {
        expect(r.ok).toBe(true);
      } else {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(row.expect);
      }
    });
  }
});

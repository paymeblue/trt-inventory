import { describe, expect, it } from "vitest";
import { resolveActor } from "@/lib/actor";

describe("resolveActor — role coercion", () => {
  it("maps 'installer' to installer", () => {
    expect(resolveActor("installer", "Bob").role).toBe("installer");
  });

  it("maps 'pm' to pm", () => {
    expect(resolveActor("pm", "Alice").role).toBe("pm");
  });

  it("falls back to 'pm' for any unknown role (fail-safe default)", () => {
    // Defaulting to the lower-privilege-but-non-scanning PM role is safe:
    // the scan endpoints separately require the 'installer' role via
    // auth-guard, so an attacker can't escalate by spoofing a header.
    expect(resolveActor("admin", null).role).toBe("pm");
    expect(resolveActor("", null).role).toBe("pm");
    expect(resolveActor(null, null).role).toBe("pm");
    expect(resolveActor(undefined, null).role).toBe("pm");
  });

  it("treats role header as case-sensitive (doesn't accept 'INSTALLER')", () => {
    expect(resolveActor("INSTALLER", null).role).toBe("pm");
    expect(resolveActor("Installer", null).role).toBe("pm");
  });
});

describe("resolveActor — name coercion", () => {
  it("uses the provided name when present", () => {
    expect(resolveActor("pm", "Ada Lovelace").name).toBe("Ada Lovelace");
  });

  it("trims whitespace from the name", () => {
    expect(resolveActor("installer", "  Grace  ").name).toBe("Grace");
  });

  it("falls back to a role-specific default when name is empty or missing", () => {
    expect(resolveActor("pm", null).name).toBe("Project Manager");
    expect(resolveActor("pm", "").name).toBe("Project Manager");
    expect(resolveActor("pm", "   ").name).toBe("Project Manager");
    expect(resolveActor("installer", null).name).toBe("Installer");
    expect(resolveActor("installer", "").name).toBe("Installer");
  });

  it("pairs the fallback with the role that was actually resolved", () => {
    // Even though 'admin' was passed, the role resolved to 'pm', so the
    // fallback name must be 'Project Manager' — not 'Admin'.
    expect(resolveActor("admin", null).name).toBe("Project Manager");
  });
});

describe("resolveActor — determinism", () => {
  it("is pure (no side effects, stable output for same input)", () => {
    const a = resolveActor("installer", "Grace");
    const b = resolveActor("installer", "Grace");
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // different refs OK, equal contents required
  });
});

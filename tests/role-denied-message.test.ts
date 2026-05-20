import { describe, expect, it } from "vitest";
import { friendlyRoleDeniedMessage } from "@/lib/role-denied-message";

describe("friendlyRoleDeniedMessage", () => {
  it("never exposes super_admin slug to logistics users", () => {
    const msg = friendlyRoleDeniedMessage("logistics", ["super_admin"]);
    expect(msg).not.toContain("super_admin");
    expect(msg).toMatch(/super-admin|Super admin/i);
  });

  it("guides PMs away from super-admin queue", () => {
    const msg = friendlyRoleDeniedMessage("pm", ["super_admin"]);
    expect(msg).toMatch(/super-admin/i);
    expect(msg).toMatch(/Projects/i);
  });

  it("guides receivers toward on-site verification", () => {
    const msg = friendlyRoleDeniedMessage("installer", ["super_admin"]);
    expect(msg).toMatch(/Receivers verify/i);
  });

  it("guides super-admin toward warehouse scan for logistics-only APIs", () => {
    const msg = friendlyRoleDeniedMessage("super_admin", ["logistics"]);
    expect(msg).toMatch(/Warehouse scan|Awaiting logistics/i);
  });
});

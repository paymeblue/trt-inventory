import { randomBytes } from "node:crypto";

/**
 * Generates a human-friendly temporary password used when a PM resets a
 * teammate's credentials. base64url is alphanumeric + `-_`, but we strip
 * those two so the password is safe to dictate over the phone or paste
 * into a kiosk keyboard without escaping anxieties. We pad and slice so
 * the output always lands at exactly `length` characters and clears the
 * 8-char minimum the password schema enforces.
 */
export function generateTempPassword(length = 12): string {
  if (length < 8) throw new Error("Temp password length must be ≥ 8");
  let out = "";
  while (out.length < length) {
    out += randomBytes(length).toString("base64url").replaceAll(/[-_]/g, "");
  }
  return out.slice(0, length);
}

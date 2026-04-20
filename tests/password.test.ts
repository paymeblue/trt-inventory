import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword", () => {
  it("produces a format of `scrypt$<saltHex>$<hashHex>`", async () => {
    const hash = await hashPassword("correct horse battery");
    const parts = hash.split("$");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16-byte salt hex
    expect(parts[2]).toMatch(/^[0-9a-f]{128}$/); // 64-byte key hex
  });

  it("rejects short passwords at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
    await expect(hashPassword("1234567")).rejects.toThrow();
    await expect(hashPassword("")).rejects.toThrow();
  });

  it("accepts any password length >= 8", async () => {
    await expect(hashPassword("12345678")).resolves.toBeTypeOf("string");
    await expect(hashPassword("x".repeat(200))).resolves.toBeTypeOf("string");
  });

  it("produces unique salted hashes for the same input", async () => {
    const a = await hashPassword("same password 123");
    const b = await hashPassword("same password 123");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword — correct cases", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("verifies both fresh hashes for the same password", async () => {
    const a = await hashPassword("same password 123");
    const b = await hashPassword("same password 123");
    expect(await verifyPassword("same password 123", a)).toBe(true);
    expect(await verifyPassword("same password 123", b)).toBe(true);
  });

  it("handles unicode / emoji passwords", async () => {
    const pw = "pässwörd-🔐-ok!";
    const hash = await hashPassword(pw);
    expect(await verifyPassword(pw, hash)).toBe(true);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassword("CaseSensitive!");
    expect(await verifyPassword("casesensitive!", hash)).toBe(false);
    expect(await verifyPassword("CaseSensitive!", hash)).toBe(true);
  });
});

describe("verifyPassword — rejection cases", () => {
  it("rejects incorrect passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "bogus")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$aa$bb")).toBe(false);
  });

  it("rejects hashes with the wrong algorithm tag", async () => {
    expect(await verifyPassword("x", "argon2$aa$bb")).toBe(false);
    expect(await verifyPassword("x", "md5$aa$bb")).toBe(false);
    expect(await verifyPassword("x", "$aa$bb")).toBe(false);
  });

  it("rejects hashes missing the salt or key", async () => {
    expect(await verifyPassword("x", "scrypt$$")).toBe(false);
    expect(await verifyPassword("x", "scrypt$aa$")).toBe(false);
    expect(await verifyPassword("x", "scrypt$$bb")).toBe(false);
  });

  it("rejects when any character in the hash is tampered with", async () => {
    const hash = await hashPassword("correct horse battery");
    const [algo, salt, key] = hash.split("$");
    // Flip the last character of the key.
    const lastChar = key[key.length - 1];
    const replacement = lastChar === "a" ? "b" : "a";
    const tampered = `${algo}$${salt}$${key.slice(0, -1)}${replacement}`;
    expect(await verifyPassword("correct horse battery", tampered)).toBe(false);
  });

  it("rejects a hash with a truncated key (defence-in-depth: length enforced)", async () => {
    // scrypt output is prefix-consistent, so without an explicit length
    // check a truncated key would still verify. We reject any stored hash
    // whose key isn't exactly KEYLEN bytes.
    const hash = await hashPassword("correct horse battery");
    const [algo, salt, key] = hash.split("$");
    const truncated = `${algo}$${salt}$${key.slice(0, 8)}`;
    expect(await verifyPassword("correct horse battery", truncated)).toBe(
      false,
    );
  });

  it("rejects a hash with a wrong-sized salt", async () => {
    const hash = await hashPassword("correct horse battery");
    const [algo, , key] = hash.split("$");
    // 1-byte salt, definitely the wrong size.
    const tampered = `${algo}$aa$${key}`;
    expect(await verifyPassword("correct horse battery", tampered)).toBe(
      false,
    );
  });

  it("rejects a hash where someone swapped in a different user's salt", async () => {
    const a = await hashPassword("alice-password");
    const b = await hashPassword("alice-password");
    const [, saltA, keyA] = a.split("$");
    const [, saltB] = b.split("$");
    // Take user A's key, paste user B's salt. Verification must fail.
    const frankenstein = `scrypt$${saltB}$${keyA}`;
    expect(await verifyPassword("alice-password", frankenstein)).toBe(false);
  });
});

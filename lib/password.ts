import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * Hashes a password with scrypt. Output format: `scrypt$<saltHex>$<hashHex>`.
 * Using Node's built-in crypto keeps us free of native dependencies.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  // Defence in depth: require the stored key to be exactly KEYLEN bytes.
  // scrypt output is prefix-consistent, so without this check a hash whose
  // key was truncated would still "verify" — harmless in practice (you'd
  // already need the first N bytes of the real hash) but we'd rather fail
  // closed on any tampered envelope.
  if (expected.length !== KEYLEN) return false;
  if (salt.length !== SALT_BYTES) return false;
  const derived = await scrypt(password, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

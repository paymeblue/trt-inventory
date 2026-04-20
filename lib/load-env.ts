import { config } from "dotenv";
import path from "node:path";

/**
 * Loads env vars the same way Next.js does: .env.local wins over .env and
 * neither overrides variables already set in process.env (e.g. from CI).
 */
let loaded = false;
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const root = process.cwd();
  for (const file of [".env.local", ".env"]) {
    config({ path: path.join(root, file), override: false });
  }
}

loadEnv();

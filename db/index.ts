import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/trt_inventory";

const needsSsl =
  connectionString.includes("sslmode=require") ||
  connectionString.includes("neon.tech") ||
  connectionString.includes("supabase.co");

declare global {
  // eslint-disable-next-line no-var
  var __pg_client__: ReturnType<typeof postgres> | undefined;
}

const client =
  global.__pg_client__ ??
  postgres(connectionString, {
    max: 10,
    prepare: false,
    ssl: needsSsl ? "require" : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pg_client__ = client;
}

export const db = drizzle(client, { schema });
export { schema };

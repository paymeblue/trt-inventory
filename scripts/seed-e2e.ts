import "../lib/load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { hashPassword } from "../lib/password";

/**
 * Seeds the four role accounts the Cypress flow spec logs in with
 * (cypress/e2e/project-approval-flow.cy.ts). Idempotent: existing rows
 * are updated in place so it is safe to run before every e2e session.
 *
 *   npm run seed:e2e
 */
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2ePassword123!";

const E2E_USERS = [
  { email: "e2e-pm@trt.local", role: "pm", name: "E2E PM" },
  { email: "e2e-admin@trt.local", role: "super_admin", name: "E2E Super Admin" },
  { email: "e2e-logistics@trt.local", role: "logistics", name: "E2E Logistics" },
  { email: "e2e-receiver@trt.local", role: "installer", name: "E2E Receiver" },
] as const;

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/trt_inventory";

  const client = postgres(connectionString, {
    max: 1,
    ssl: connectionString.includes("sslmode=require") ? "require" : undefined,
    prepare: false,
  });
  const db = drizzle(client, { schema });

  const passwordHash = await hashPassword(E2E_PASSWORD);

  for (const user of E2E_USERS) {
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, user.email),
      columns: { id: true },
    });
    if (existing) {
      await db
        .update(schema.users)
        .set({ passwordHash, role: user.role, name: user.name })
        .where(eq(schema.users.id, existing.id));
      console.log(`Updated e2e user ${user.email} (${user.role})`);
    } else {
      await db.insert(schema.users).values({
        email: user.email,
        passwordHash,
        role: user.role,
        name: user.name,
      });
      console.log(`Created e2e user ${user.email} (${user.role})`);
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

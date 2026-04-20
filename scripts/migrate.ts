import "../lib/load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { hashPassword } from "../lib/password";

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

  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./db/migrations" });
  console.log("Migrations complete.");

  const draftCleanup = await client`
    DELETE FROM orders
    WHERE status = 'draft'
      AND NOT EXISTS (
        SELECT 1 FROM order_items
        WHERE order_items.order_id = orders.id
          AND order_items.scanned_at IS NOT NULL
      )
    RETURNING id
  `;
  if (draftCleanup.length > 0) {
    console.log(`Removed ${draftCleanup.length} empty draft order(s).`);
  }

  const promoted = await client`
    UPDATE orders
    SET status = 'active', completed_at = COALESCE(completed_at, now())
    WHERE status = 'draft'
    RETURNING id
  `;
  if (promoted.length > 0) {
    console.log(
      `Promoted ${promoted.length} draft order(s) with scan history to active.`,
    );
  }

  const email = process.env.SEED_PM_EMAIL;
  const password = process.env.SEED_PM_PASSWORD;
  const name = process.env.SEED_PM_NAME ?? "Project Manager";

  if (email && password) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users);

    if (count === 0) {
      const passwordHash = await hashPassword(password);
      await db.insert(schema.users).values({
        email: email.toLowerCase(),
        passwordHash,
        role: "pm",
        name,
      });
      console.log(`Seeded initial PM: ${email}`);
    } else {
      console.log(`Users already exist (${count}). Skipping seed.`);
    }
  } else {
    console.log(
      "SEED_PM_EMAIL / SEED_PM_PASSWORD not set; no user seeded.",
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

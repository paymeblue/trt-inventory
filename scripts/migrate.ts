import "../lib/load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
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

  /**
   * Optional bootstrap for `super_admin` (approvals queue + can invite logistics on Team).
   * - If that email already exists: set role to super_admin; if password is set (min 8 chars),
   *   also rotate the hash from env (dev/bootstrap only).
   * - If the email does not exist: create a new user when BOOTSTRAP_SUPER_ADMIN_PASSWORD is set.
   *
   * Omit this block in production or leave env vars unset.
   */
  const saEmailRaw = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim();
  const saPassword = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  const saName = process.env.BOOTSTRAP_SUPER_ADMIN_NAME ?? "Super Admin";

  if (saEmailRaw) {
    const saEmail = saEmailRaw.toLowerCase();
    const existingSa = await db.query.users.findFirst({
      where: eq(schema.users.email, saEmail),
    });

    if (existingSa) {
      const updates: {
        role: "super_admin";
        passwordHash?: string;
      } = { role: "super_admin" };
      if (saPassword) {
        if (saPassword.length < 8) {
          console.log(
            "BOOTSTRAP_SUPER_ADMIN_PASSWORD must be at least 8 characters; role promoted without password change.",
          );
        } else {
          updates.passwordHash = await hashPassword(saPassword);
        }
      }
      await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, existingSa.id));
      console.log(
        `Bootstrap: ${saEmail} is now super_admin${
          updates.passwordHash ? " (password updated from env)" : ""
        }.`,
      );
    } else if (saPassword && saPassword.length >= 8) {
      const passwordHash = await hashPassword(saPassword);
      await db.insert(schema.users).values({
        email: saEmail,
        passwordHash,
        role: "super_admin",
        name: saName,
      });
      console.log(`Bootstrap: created super_admin ${saEmail}.`);
    } else {
      console.log(
        `Bootstrap: no user '${saEmail}'. Set BOOTSTRAP_SUPER_ADMIN_PASSWORD (min 8 chars) to create one, or use an email that already exists.`,
      );
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

# Order Management & Verification System (OMVS)

A two-role workflow app for creating, fulfilling, and verifying product orders
with barcode-based scanning, tied to a real warehouse stock ledger. Built with
Next.js (App Router), TypeScript, Tailwind v4, Postgres, and Drizzle ORM.

## What it solves

1. Tracks logistics orders to site to eliminate incorrect / incomplete orders.
2. Gives real-time feedback on deliveries as items are scanned.
3. Records **who** scanned **what** and **when** — per-item accountability via
   authenticated user sessions.
4. Monitors quantity delivered vs. quantity in the warehouse, decrementing
   stock on every verified scan.
5. Builds a digital database of orders tied to project names.

## Roles

- **Project Manager (PM)** — logs in, manages warehouse SKUs, onboards
  installers, creates orders, adds items, generates barcodes, and submits the
  order.
- **Installer** — logs in with credentials the PM sets up, opens an active
  order on-site, and scans each barcode one at a time.

A **seed PM** is created on the first migration (from `SEED_PM_EMAIL` /
`SEED_PM_PASSWORD` in `.env.local`). The PM then creates all other users from
the **Team** page.

## Data model

| Entity         | Key fields                                                                              |
| -------------- | --------------------------------------------------------------------------------------- |
| User           | `id`, `email` (unique), `passwordHash`, `role` (pm / installer), `name`, `createdById`  |
| Product        | `id`, `sku` (unique), `name`, `stockQuantity`                                           |
| Order          | `id`, `projectName`, `status`, `createdBy`, `createdById`, timestamps                   |
| OrderItem      | `id`, `orderId`, `productId` (FK to `products.sku`), `barcode`, `scannedAt/By/ById`     |
| StockMovement  | `id`, `productId`, `delta`, `reason`, `orderId?`, `orderItemId?`, `userId?`             |

Order statuses: `draft → active → fulfilled`, plus `anomaly` when an invalid
scan is detected.

DB-enforced invariants:
- Emails are unique.
- SKUs are unique.
- Barcodes are unique globally.
- Each SKU can only appear once per order.
- Removing a user does not nuke historical scans (scannedBy string is kept).

## Auth

- Passwords are hashed with Node's built-in **scrypt** (salted, no native
  deps) — see `lib/password.ts`.
- Sessions are signed, HTTP-only cookies via **iron-session** — see
  `lib/session.ts`. Set `SESSION_SECRET` to a 32+ char random string.
- `middleware.ts` bounces every unauthenticated request to `/login`
  (pages) or returns `401` (APIs).
- Every API route re-validates the session server-side via `requireUser()`.
- PM-only routes also re-check the role (`requireUser("pm")`).

## Scan rules (and what they do to the warehouse)

| Scan        | Meaning                                          | Effect                                                   |
| ----------- | ------------------------------------------------ | -------------------------------------------------------- |
| `valid`     | barcode matches an unscanned item                | item marked received **and** `stock_quantity -= 1` in tx (only if stock ≥ 1; otherwise 409) |
| `duplicate` | barcode matches an already-scanned item          | silently ignored — no double count, no double decrement  |
| `invalid`   | barcode not found in the order                   | order flipped to `anomaly`, stock untouched              |

When the final unscanned item is verified, the order auto-flips to
`fulfilled`. All three operations (mark item, decrement stock, flip order)
happen in a single Postgres transaction, so the three states can never drift.

Every decrement is also appended to `stock_movements` with the user, order,
item, and reason — you get a full audit trail for free.

## Getting started

Put your Postgres URL + session secret in `.env.local` (an example lives at
`.env.example`):

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Minimum 32 chars. Generate with: openssl rand -hex 32
SESSION_SECRET=replace_with_a_long_random_string_at_least_32_chars

# Bootstrap PM, created only if the users table is empty.
SEED_PM_EMAIL=pm@trt.local
SEED_PM_PASSWORD=changeme123
SEED_PM_NAME=Project Manager
```

Then:

```bash
npm install
npm run db:migrate   # applies SQL migrations + seeds the initial PM
npm run dev
```

Open http://localhost:3000 and log in with the seeded PM credentials.

## Workflow

1. Sign in as the seeded **PM**.
2. Go to **Warehouse** → add SKUs with a name and initial stock.
3. Go to **Team** → create an **Installer** account (name, email, password,
   role = installer). Share the credentials with them.
4. Go to **Orders → New Order** → name the project.
5. On the order page, pick SKUs from the warehouse dropdown. Each added item
   gets its own unique CODE128 barcode. Click **Print barcodes** and attach
   them to the physical goods.
6. Click **Complete & submit** — order moves to `active`.
7. Installer signs in. They only see **Dashboard**, **Orders**, **Scan**. They
   open the order and scan barcodes (camera or USB barcode reader / typing).
   Each successful scan decrements the SKU's warehouse stock by 1.
8. When the last barcode is scanned, the order auto-flips to `fulfilled`.

## Scripts

| Command                 | What it does                                      |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Next.js dev server                                |
| `npm run build`         | Production build                                  |
| `npm run start`         | Run the production build                          |
| `npm run lint`          | ESLint                                            |
| `npm test`              | Vitest unit tests                                 |
| `npm run test:watch`    | Vitest in watch mode                              |
| `npm run db:generate`   | Regenerate SQL migrations from the schema         |
| `npm run db:migrate`    | Apply migrations and seed the initial PM          |
| `npm run db:push`       | Push schema to the DB without generating SQL      |
| `npm run db:studio`     | Launch Drizzle Studio                             |

## Project layout

```
app/
  api/
    auth/{login,logout,me}           auth endpoints
    users/…                          PM-only: list / create / delete users
    products/…                       PM-only writes, everyone can read
    orders/…                         list, detail, items, complete, scan
    stats                            dashboard aggregates
  login/                             login page (public)
  orders/{,new,[id]}/                PM build + installer scan views
  warehouse/                         PM: manage SKUs + stock
  team/                              PM: create installers
  scan/                              installer: pick an active order
  page.tsx                           dashboard
  layout.tsx                         session-aware shell
components/
  session-context.tsx                SessionProvider + useSession / useAuthedUser
  sidebar.tsx, topbar.tsx            role-aware nav + sign-out
  barcode.tsx                        CODE128 rendering (jsbarcode)
  scan-input.tsx                     camera (ZXing) + manual input
  status-pill.tsx                    status badges
db/
  schema.ts                          users, products, orders, orderItems, stockMovements
  migrations/                        SQL migrations
  index.ts                           db client singleton (SSL auto-on for Neon / Supabase)
lib/
  scan.ts                            pure scan-rule resolver (tested)
  barcode.ts                         barcode generator + shape validator (tested)
  password.ts                        scrypt hash + verify (tested)
  session.ts                         iron-session config
  auth-guard.ts                      requireUser() / getCurrentUser()
  api.ts                             JSON error helpers
  load-env.ts                        loads .env.local then .env
  swr.ts                             tiny fetcher hook
middleware.ts                        redirect unauthenticated pages to /login; 401 APIs
scripts/migrate.ts                   applies migrations + seeds the bootstrap PM
tests/                               Vitest unit tests
```

## Tests

```bash
npm test
```

- `tests/scan.test.ts` — every scan rule, auto-fulfillment, anomaly flagging,
  and a full end-to-end simulation.
- `tests/barcode.test.ts` — barcode shape + uniqueness over 1,000 generations.
- `tests/password.test.ts` — hash/verify round-trip, wrong passwords, malformed
  hashes, unique salts.

## API quick reference

| Method | Route                             | Role      | Notes                                   |
| ------ | --------------------------------- | --------- | --------------------------------------- |
| POST   | `/api/auth/login`                 | public    | `{email, password}` → sets session      |
| POST   | `/api/auth/logout`                | any       | clears session                          |
| GET    | `/api/auth/me`                    | any       | `{user: …}` or `{user: null}`           |
| GET    | `/api/users`                      | pm        | list all users                          |
| POST   | `/api/users`                      | pm        | create installer or PM                  |
| DELETE | `/api/users/:id`                  | pm        | remove a user (not yourself)            |
| GET    | `/api/products`                   | any       | list all SKUs + stock                   |
| POST   | `/api/products`                   | pm        | add new SKU                             |
| POST   | `/api/products/:id`               | pm        | `{delta, reason?}` restock / adjust     |
| DELETE | `/api/products/:id`               | pm        | delete SKU                              |
| GET    | `/api/stats`                      | any       | dashboard metrics                       |
| GET    | `/api/orders`                     | any       | list orders                             |
| POST   | `/api/orders`                     | pm        | create draft                            |
| GET    | `/api/orders/:id`                 | any       | order + items + progress                |
| DELETE | `/api/orders/:id`                 | pm        | delete while draft                      |
| POST   | `/api/orders/:id/items`           | pm        | `{productId}` — must exist in warehouse |
| DELETE | `/api/orders/:id/items?itemId=…`  | pm        | remove item from a draft                |
| POST   | `/api/orders/:id/complete`        | pm        | submit order → `active`                 |
| POST   | `/api/orders/:id/scan`            | installer | `{barcode}`; decrements stock in a tx   |

All protected endpoints require the `trt.session` cookie set by
`/api/auth/login`.

## Barcodes

`lib/barcode.ts` produces `TRT-` prefixed 12-char alphanumeric codes (36¹²
possible values — collisions are practically impossible, plus the API retries
on the unique-index violation just in case). They are rendered as CODE128 in
the browser via `jsbarcode`, and scanned client-side by `@zxing/browser`
(camera) or typed / fed in by a USB wedge scanner in manual mode.

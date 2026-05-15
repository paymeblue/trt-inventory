# Order Management & Verification System (OMVS)

Barcode-driven orders inside **projects** (no shared global warehouse). Each
project has its own SKUs, stock, and shipments. Built with Next.js (App Router),
TypeScript, Tailwind v4, Postgres, and Drizzle ORM.

## What it solves

- Tracks what was dispatched and what was verified on site, with **one unique QR
  per physical unit** when you add inventory as separate rows (recommended).
- Gives immediate feedback when installers scan.
- Records **who** scanned **what** and **when**.
- Decrements stock when a scan succeeds (never double-counts).

## People and permissions (in plain language)

- **Project Manager (PM)** — Sets up projects, adds **categories** (labels like
  “Upper unit”), adds **physical items** (each row is one scannable unit),
  starts shipments, and invites installers on **Team**.
- **Installer** — Sees only live projects and orders they’re allowed to open.
  Verifies deliveries by scanning each sticker; stock goes down one step per
  scan.
- **Super admin** — Reviews **new** projects before they go anywhere near a site.
  That’s the “pending creation approval” queue.
- **Logistics** — After super-admin says yes, logistics **scans every warehouse
  packing QR** for that project (one label per unit you added), then **activates**
  the project so installers can work. Installers reuse the **same** stickers on
  site; stock still drops only on their scans.

A seeded **PM** is created on first migration (`SEED_PM_*` in `.env.local`).
Optional `BOOTSTRAP_SUPER_ADMIN_*` creates or promotes a **super admin** so you
can invite **logistics** from **Team**.

## How it works (human version)

1. **PM** creates a project and adds **categories** (optional but handy) — e.g.
   “Upper unit”, “Lower unit”.
2. When adding stock, they choose **Category** or **Custom name**, enter **how
   many units** (e.g. 5). The app creates **5 separate items** (5 rows), not one
   row with “quantity 5”. If you add more than one at a time, a **confirmation
   dialog** lists what will be created before anything hits the database — each
   unit gets its own ID and will get its own QR when orders are generated.
3. **Super admin** approves new projects (after the PM submits them). The
   **logistics** queue updates immediately for logistics users — no refresh
   trick needed.
4. **Logistics** opens **Awaiting logistics**, goes into **warehouse scan** for
   each job, scans **every** packing label, then activates the project.
5. **PM** creates **new orders** (still one barcode per **unit** / line on that
   shipment snapshot).
6. **Installer** verifies on site; **valid** scan = one unit received and stock
   −1 in one transaction.

Legacy note: the API can still accept a **single product row** with aggregated
`stockQuantity` for old integrations; the UI prefers **one row per physical
unit** so every scan maps cleanly.

## Data model (short)

| Entity              | Purpose |
| ------------------- | ------- |
| User                | Login, role (`pm` / `installer` / `logistics` / `super_admin`). |
| Project             | Container; approval workflow; optional installer lock. |
| Project category    | Reusable label inside a project for faster batch adds. |
| Product (item)      | SKU + name + stock; optional `categoryId` and `batchId` when created in a batch. |
| Order               | Snapshot for a project; **gate orders** are seeded for logistics scanning. |
| Order item          | One barcode line; scanned on-site and can be **logistics-scanned** first at the warehouse. |
| Stock movement      | Audit log for every stock change. |

Order statuses: `draft → active → fulfilled`, plus `anomaly` when something
doesn’t match.

DB invariants: unique emails, unique barcodes globally, unique `(project, sku)`
for items.

## Auth

- Passwords: **scrypt** (`lib/password.ts`).
- Sessions: signed HTTP-only cookies (**iron-session**). Set `SESSION_SECRET`
  (32+ random chars).
- APIs re-check `requireUser()` / role helpers on every request.

## Scan behaviour (installer)

| Outcome     | Meaning |
| ----------- | ------- |
| `valid`     | Line matched and not yet verified → mark received, `stock_quantity -= 1` if stock allows. |
| `duplicate` | Same barcode scanned again → ignored. |
| `invalid`   | Barcode not on this order → order can move to `anomaly`. |

Warehouse scans (logistics gate) **do not** move stock; they only prove labels
were checked before the project goes live. Installer scans still perform stock
movement.

## Getting started

```bash
cp .env.example .env.local
# DATABASE_URL, SESSION_SECRET, SEED_PM_*

npm install
npm run db:migrate   # applies migrations + seeds PM if DB empty
npm run dev
```

Open http://localhost:3000 and sign in with the seeded PM.

## Scripts

| Command               | What it does |
| --------------------- | ------------- |
| `npm run dev`         | Dev server |
| `npm run build`       | Production build |
| `npm test`            | Vitest |
| `npm run db:migrate`  | Apply SQL migrations |
| `npm run db:studio`   | Drizzle Studio |

## Project layout (high level)

- `app/` — App Router pages and `app/api/*` route handlers.
- `db/` — Drizzle schema + SQL migrations.
- `lib/` — Scan rules, barcode minting, auth guards, batch item creation helpers.
- `tests/` — Unit tests (scan rules, validation, etc.).

## Tests

```bash
npm test
```

Key suites: `tests/scan.test.ts`, `tests/barcode.test.ts`,
`tests/password.test.ts`, packing / validation helpers.

## API (selected)

Protected routes need the `trt.session` cookie from `/api/auth/login`.

| Method | Route | Notes |
| ------ | ----- | ----- |
| GET    | `/api/projects/[id]` | Project, items (with category names), **categories** list, orders. |
| POST   | `/api/projects/[id]/categories` | Create a category label. |
| GET    | `/api/projects/[id]/categories` | List categories. |
| POST   | `/api/projects/[id]/items` | Add items — **units batch** `{ categoryId, quantity }` or `{ name, quantity }`, or **legacy** `{ sku, name, stockQuantity }`. |
| POST   | `/api/projects/[id]/approval` | Workflow (super-admin, logistics fulfil/reject, etc.). |
| POST   | `/api/orders/[id]/scan` | Installer / token scan. |

## Barcodes

`lib/barcode.ts` issues `TRT-…` codes; collisions retry on unique index.

---

For role-specific pages, use the in-app **Help** link and the approval queues
(**Pending creation approval**, **Awaiting logistics**).

import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const stamp = Date.now();
const PASS = "E2ePassword123!";
const results = [];
const check = (label, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${extra}`}`);

async function loginCookie(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASS }),
  });
  const [pair] = r.headers.get("set-cookie").split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1) };
}
async function api(cookie, method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: `${cookie.name}=${cookie.value}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const pm = await loginCookie("e2e-pm@trt.local");
const sa = await loginCookie("e2e-admin@trt.local");
const lg = await loginCookie("e2e-logistics@trt.local");

// --- P3: active project with a category ---
const catLocal = randomUUID();
const p3 = (await api(pm, "POST", "/api/projects", {
  name: `Edit Approval ${stamp}`,
  categoryDefinitions: [{ localId: catLocal, name: "Upper Unit" }],
  inventory: [{ kind: "category", categoryLocalId: catLocal, quantity: 1 }],
})).json.project;
await api(sa, "POST", `/api/projects/${p3.id}/approval`, { action: "super_admin_approve" });
const gate3 = (await api(sa, "GET", `/api/projects/${p3.id}/logistics-gate`)).json;
for (const it of gate3.items) {
  await api(sa, "POST", `/api/projects/${p3.id}/logistics-gate/scan`, { barcode: it.barcode });
}
await api(lg, "POST", `/api/projects/${p3.id}/approval`, { action: "logistics_fulfill" });

let detail = (await api(pm, "GET", `/api/projects/${p3.id}`)).json;
check("setup: project active with category", detail.project.approvalStatus === "active" && detail.categories.length === 1);
const catId = detail.categories[0].id;
const itemId = detail.items[0].id;
const stockBefore = detail.items[0].stockQuantity;
const itemCountBefore = detail.items.length;

// --- PM edits on the LIVE project must queue ---
let r = await api(pm, "POST", `/api/projects/${p3.id}/categories`, { name: "QueueCat", quantity: 2 });
check("live category add queues for approval", r.json.queuedForApproval === true, JSON.stringify(r.json));

r = await api(pm, "PATCH", `/api/projects/${p3.id}/categories/${catId}`, { name: "Upper Unit Renamed" });
check("live category rename queues for approval", r.json.queuedForApproval === true, JSON.stringify(r.json));

r = await api(pm, "PATCH", `/api/projects/${p3.id}/items/${itemId}`, { delta: 2 });
check("live stock change queues for approval", r.json.queuedForApproval === true, JSON.stringify(r.json));

detail = (await api(pm, "GET", `/api/projects/${p3.id}`)).json;
check("nothing applied before approval",
  detail.categories.length === 1 &&
  detail.categories[0].name === "Upper Unit" &&
  detail.items[0].stockQuantity === stockBefore);
check("change staged for super-admin", detail.project.metadataChangeStage === "pending_super_admin",
  String(detail.project.metadataChangeStage));

// --- SA approves, logistics applies ---
r = await api(sa, "POST", `/api/projects/${p3.id}/approval`, { action: "super_admin_approve_metadata_change" });
check("super-admin approves the edit", r.status === 200, JSON.stringify(r.json));
r = await api(lg, "POST", `/api/projects/${p3.id}/approval`, { action: "logistics_apply_patch" });
check("logistics applies the approved edit", r.status === 200, JSON.stringify(r.json));

detail = (await api(pm, "GET", `/api/projects/${p3.id}`)).json;
const names = detail.categories.map((c) => c.name).sort();
check("category renamed after approval", names.includes("Upper Unit Renamed"), names.join(","));
check("queued category created with 2 units",
  names.includes("QueueCat") && detail.items.length === itemCountBefore + 2,
  `items ${detail.items.length}`);
const item = detail.items.find((i) => i.id === itemId);
check("stock +2 applied after approval", item.stockQuantity === stockBefore + 2, String(item.stockQuantity));
check("pending patch cleared", !detail.project.metadataChangeStage);

// --- P4: non-live project, edits apply directly (no regression) ---
const p4 = (await api(pm, "POST", "/api/projects", { name: `Edit Direct ${stamp}` })).json.project;
r = await api(pm, "POST", `/api/projects/${p4.id}/categories`, { name: "DirectCat", quantity: 1 });
check("non-live category add applies directly", r.status === 201 && !!r.json.category, JSON.stringify(r.json));
r = await api(pm, "PATCH", `/api/projects/${p4.id}/categories/${r.json.category.id}`, { name: "DirectCat 2" });
check("non-live rename applies directly", r.status === 200 && r.json.category?.name === "DirectCat 2", JSON.stringify(r.json));

// --- UI smoke: rename via the Categories tab on P4 ---
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ ...pm, url: BASE }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/projects/${p4.id}`, { timeout: 90000 });
await page.getByRole("button", { name: "Categories" }).click();
await page.getByText("DirectCat 2").waitFor({ timeout: 20000 });
await page.getByRole("button", { name: "Rename" }).click();
await page.locator('td input.input').fill("DirectCat 3");
await page.getByRole("button", { name: "Save" }).click();
await page.getByText("DirectCat 3").waitFor({ timeout: 20000 });
check("UI rename works end-to-end", true);
await browser.close();

console.log(results.join("\n"));

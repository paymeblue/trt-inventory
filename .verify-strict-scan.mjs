import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const stamp = Date.now();
const PASS = "E2ePassword123!";

async function loginCookie(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASS }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  const raw = r.headers.get("set-cookie");
  const [pair] = raw.split(";");
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1) };
}
async function api(cookie, method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `${cookie.name}=${cookie.value}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

const pm = await loginCookie("e2e-pm@trt.local");
const sa = await loginCookie("e2e-admin@trt.local");
const lg = await loginCookie("e2e-logistics@trt.local");
const rc = await loginCookie("e2e-receiver@trt.local");

// ---------- P1: open receiver project ----------
const p1 = (await api(pm, "POST", "/api/projects", {
  name: `Strict Flow ${stamp}`,
  items: [{ sku: `SF-${stamp}`, name: "Strict Box", stockQuantity: 1 }],
})).json.project;
await api(sa, "POST", `/api/projects/${p1.id}/approval`, { action: "super_admin_approve" });
const gate = (await api(pm, "GET", `/api/projects/${p1.id}/logistics-gate`)).json;
const item = gate.items[0];
const stickerUrl = `/s/${encodeURIComponent(item.barcode)}?st=${encodeURIComponent(item.printedScanToken)}`;

const browser = await chromium.launch();
async function pageAs(cookie) {
  const ctx = await browser.newContext();
  if (cookie) await ctx.addCookies([{ ...cookie, url: BASE }]);
  return ctx.newPage();
}
async function visit(cookie, url) {
  const page = await pageAs(cookie);
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1500);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const finalUrl = page.url();
  await page.context().close();
  return { text, finalUrl };
}
const results = [];
function expectCheck(label, ok) { results.push(`${ok ? "PASS" : "FAIL"}  ${label}`); }

// WAREHOUSE STAGE
let r = await visit(null, stickerUrl);
expectCheck("anonymous sticker scan → login redirect", r.finalUrl.includes("/login"));

r = await visit(pm, stickerUrl);
expectCheck("PM cannot warehouse-verify", r.text.includes("Warehouse verification is logistics-only"));

r = await visit(rc, stickerUrl);
expectCheck("receiver cannot warehouse-verify", r.text.includes("logistics-only"));

r = await visit(lg, `/s/${encodeURIComponent(item.barcode)}?st=FORGED`);
expectCheck("logistics with forged token → blocked", r.text.includes("Sticker could not be authenticated"));

r = await visit(lg, `/s/${encodeURIComponent(item.barcode)}`);
expectCheck("logistics without token → in-app scanner", r.finalUrl.includes("/logistics-scan"));

r = await visit(lg, stickerUrl);
expectCheck("logistics with valid token verifies", r.text.includes("Warehouse line recorded"));

// ACTIVATE + ORDER
await api(lg, "POST", `/api/projects/${p1.id}/approval`, { action: "logistics_fulfill" });
const order1 = (await api(pm, "POST", "/api/orders", { projectId: p1.id })).json.order;

// DELIVERY STAGE (same physical sticker)
r = await visit(lg, stickerUrl);
expectCheck("logistics on active project → 'already verified, receiver-only'", r.text.includes("Already verified in the warehouse"));

r = await visit(pm, stickerUrl);
expectCheck("PM cannot fulfill", r.text.includes("On-site scans are receiver-only"));

r = await visit(null, stickerUrl);
expectCheck("anonymous fulfillment → login redirect", r.finalUrl.includes("/login"));

r = await visit(rc, stickerUrl);
expectCheck("receiver fulfills", /Item verified|Order fulfilled/.test(r.text));

const o1 = (await api(pm, "GET", `/api/orders/${order1.id}`)).json;
expectCheck("order fulfilled by receiver session (not anonymous)", o1.order.status === "fulfilled" && o1.items[0].scannedBy === "E2E Receiver");

// ---------- P2: assigned-receiver lock ----------
const other = (await api(sa, "POST", "/api/users", {
  name: "E2E Other Receiver", email: `e2e-other-${stamp}@trt.local`, password: PASS, role: "installer",
})).json;
const otherId = other.user?.id ?? other.id;
const p2 = (await api(pm, "POST", "/api/projects", {
  name: `Strict Assigned ${stamp}`,
  installerUserId: otherId,
  items: [{ sku: `SA-${stamp}`, name: "Assigned Box", stockQuantity: 1 }],
})).json.project;
await api(sa, "POST", `/api/projects/${p2.id}/approval`, { action: "super_admin_approve" });
const gate2 = (await api(pm, "GET", `/api/projects/${p2.id}/logistics-gate`)).json;
for (const it of gate2.items) {
  await api(sa, "POST", `/api/projects/${p2.id}/logistics-gate/scan`, { barcode: it.barcode });
}
await api(lg, "POST", `/api/projects/${p2.id}/approval`, { action: "logistics_fulfill" });
await api(pm, "POST", "/api/orders", { projectId: p2.id });
const sticker2 = `/s/${encodeURIComponent(gate2.items[0].barcode)}?st=${encodeURIComponent(gate2.items[0].printedScanToken)}`;

r = await visit(rc, sticker2);
expectCheck("unassigned receiver blocked on assigned project", r.text.includes("Not the assigned receiver"));

const otherCookie = await loginCookie(`e2e-other-${stamp}@trt.local`);
r = await visit(otherCookie, sticker2);
expectCheck("assigned receiver fulfills", /Item verified|Order fulfilled/.test(r.text));

console.log(results.join("\n"));
await browser.close();

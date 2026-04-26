"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import clsx from "clsx";

type SceneDef = {
  id: string;
  title: string;
  caption: string;
  /** Programmatic scene — same shape Excalidraw uses internally (see convertToExcalidrawElements). */
  skeleton: Parameters<typeof convertToExcalidrawElements>[0];
};

const FONT_MD = 16;
const FONT_SM = 14;
const FONT_LG = 20;

function scenePm(): SceneDef["skeleton"] {
  return [
    {
      type: "text",
      x: 24,
      y: 16,
      width: 860,
      text: "Project Manager — capabilities & hard stops",
      fontSize: FONT_LG,
    },
    {
      type: "rectangle",
      x: 32,
      y: 56,
      width: 400,
      height: 100,
      backgroundColor: "#e8f4fc",
      label: {
        text: "Catalog\n• Create / rename projects\n• Add edit delete SKUs (names unique per project only)",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 32,
      y: 176,
      width: 400,
      height: 88,
      backgroundColor: "#e8f4fc",
      label: {
        text: "Team\n• Create installer users, reset passwords\n• PM-only user APIs",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 32,
      y: 284,
      width: 400,
      height: 140,
      backgroundColor: "#ecfdf3",
      label: {
        text:
          "Orders\n• Create order only if project is eligible (see diagram 2)\n• New order auto-copies every current SKU with new barcodes\n• Add/remove lines only before first scan on that order\n• Delete order only if no line verified yet",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 456,
      y: 56,
      width: 400,
      height: 200,
      backgroundColor: "#feecec",
      strokeColor: "#b91c1c",
      label: {
        text:
          "Blocked for PM (server + UI)\n• POST /api/orders/[id]/scan — installer-only\n• Open /s/[barcode] without valid ?st= — blocked message (not silent success)\n• Same deep-link rules apply to in-app scan UX",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 456,
      y: 276,
      width: 400,
      height: 100,
      backgroundColor: "#f8fafc",
      label: {
        text:
          "Read\n• Dashboard, projects, orders, stats, order detail — same as installers unless edit is PM-only",
        fontSize: FONT_SM,
      },
    },
  ];
}

function sceneEligibility(): SceneDef["skeleton"] {
  return [
    {
      type: "text",
      x: 24,
      y: 12,
      width: 880,
      text: "New order eligibility — why a second dispatch is blocked",
      fontSize: FONT_LG,
    },
    {
      type: "text",
      x: 24,
      y: 48,
      width: 880,
      text: "Goal: never open a second order that can decrement the same project stock twice after work has started.",
      fontSize: FONT_SM,
    },
    {
      type: "rectangle",
      x: 200,
      y: 96,
      width: 480,
      height: 72,
      backgroundColor: "#fff7ed",
      label: {
        text: "1) Does this project already have a fulfilled order?",
        fontSize: FONT_MD,
      },
    },
    {
      type: "rectangle",
      x: 80,
      y: 200,
      width: 200,
      height: 64,
      backgroundColor: "#fee2e2",
      label: { text: "YES → cannot create\nnew order", fontSize: FONT_SM },
    },
    {
      type: "rectangle",
      x: 600,
      y: 200,
      width: 200,
      height: 64,
      backgroundColor: "#dcfce7",
      label: { text: "NO → go to step 2", fontSize: FONT_SM },
    },
    {
      type: "arrow",
      x: 380,
      y: 168,
      width: 160,
      height: 40,
      points: [
        [0, 0],
        [-220, 32],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "arrow",
      x: 460,
      y: 168,
      width: 200,
      height: 40,
      points: [
        [0, 0],
        [200, 32],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "text",
      x: 320,
      y: 176,
      width: 80,
      text: "yes",
      fontSize: FONT_SM,
    },
    {
      type: "text",
      x: 500,
      y: 176,
      width: 80,
      text: "no",
      fontSize: FONT_SM,
    },
    {
      type: "rectangle",
      x: 200,
      y: 296,
      width: 480,
      height: 88,
      backgroundColor: "#fff7ed",
      label: {
        text:
          "2) Any order item under this project has scanned_at set?\n(any verified line, on any order)",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 80,
      y: 416,
      width: 200,
      height: 72,
      backgroundColor: "#fee2e2",
      label: { text: "YES → cannot create\nnew order", fontSize: FONT_SM },
    },
    {
      type: "rectangle",
      x: 600,
      y: 416,
      width: 200,
      height: 96,
      backgroundColor: "#dcfce7",
      label: {
        text: "NO → eligible\nPOST /api/orders seeds\nall project SKUs",
        fontSize: FONT_SM,
      },
    },
    {
      type: "arrow",
      x: 380,
      y: 384,
      width: 160,
      height: 40,
      points: [
        [0, 0],
        [-220, 32],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "arrow",
      x: 460,
      y: 384,
      width: 200,
      height: 40,
      points: [
        [0, 0],
        [200, 32],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "text",
      x: 24,
      y: 528,
      width: 880,
      text: "UI: GET /api/projects?forNewOrder=1 filters the picker; ineligible projects hide “+ New order”.",
      fontSize: FONT_SM,
    },
  ];
}

function sceneInstaller(): SceneDef["skeleton"] {
  return [
    {
      type: "text",
      x: 24,
      y: 12,
      width: 880,
      text: "Installer — verification paths & restrictions",
      fontSize: FONT_LG,
    },
    {
      type: "rectangle",
      x: 32,
      y: 52,
      width: 400,
      height: 120,
      backgroundColor: "#e0f2fe",
      label: {
        text:
          "Signed-in installer\nPOST /api/orders/[id]/scan\n• In-app camera, keyboard, USB scanner\n• Records actor = real user",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 456,
      y: 52,
      width: 400,
      height: 140,
      backgroundColor: "#ede9fe",
      label: {
        text:
          "Printed sticker (phone)\nGET /s/[barcode]?st=<signed>\n• Valid token → verify without login\n• Actor = synthetic “Printed sticker” (no user FK)\n• Token is short-lived; regenerate from order UI",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 32,
      y: 196,
      width: 400,
      height: 100,
      backgroundColor: "#fef9c3",
      label: {
        text:
          "Deep link without ?st=\n• Installer: redirect /login?redirect=… then return\n• PM: blocked on scan page (by design)",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 456,
      y: 212,
      width: 400,
      height: 120,
      backgroundColor: "#feecec",
      strokeColor: "#b91c1c",
      label: {
        text:
          "Installer cannot\n• Create projects or orders\n• Add/remove order lines\n• Manage team or delete orders",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 32,
      y: 312,
      width: 824,
      height: 72,
      backgroundColor: "#f8fafc",
      label: {
        text:
          "Order state: may verify only while order is active or anomaly (fulfilled = closed for new verifications on normal path).",
        fontSize: FONT_SM,
      },
    },
  ];
}

function sceneInventory(): SceneDef["skeleton"] {
  return [
    {
      type: "text",
      x: 24,
      y: 12,
      width: 880,
      text: "Inventory model — one stock counter per project SKU",
      fontSize: FONT_LG,
    },
    {
      type: "rectangle",
      x: 280,
      y: 56,
      width: 320,
      height: 120,
      backgroundColor: "#f1f5f9",
      label: {
        text:
          "project_items (SKUs)\nstock_quantity per (project, sku)\nAll orders on this project share this row",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 64,
      y: 220,
      width: 260,
      height: 100,
      backgroundColor: "#e8f4fc",
      label: {
        text: "Order A\nlines point at SKUs\nverify decrements stock",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 556,
      y: 220,
      width: 260,
      height: 100,
      backgroundColor: "#e8f4fc",
      label: {
        text: "Order B (if ever allowed)\nSame SKU rows\nSame stock_quantity",
        fontSize: FONT_SM,
      },
    },
    {
      type: "arrow",
      x: 300,
      y: 176,
      width: 120,
      height: 60,
      points: [
        [0, 0],
        [-120, 44],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "arrow",
      x: 580,
      y: 176,
      width: 120,
      height: 60,
      points: [
        [0, 0],
        [120, 44],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "rectangle",
      x: 32,
      y: 352,
      width: 824,
      height: 88,
      backgroundColor: "#fff7ed",
      label: {
        text:
          "Each successful verify: stock_quantity -= 1 (project scope).\nIf on-hand is already 0, the verify is rejected — stock never goes negative.",
        fontSize: FONT_SM,
      },
    },
  ];
}

function sceneLifecycle(): SceneDef["skeleton"] {
  return [
    {
      type: "text",
      x: 24,
      y: 12,
      width: 880,
      text: "Order lifecycle — status transitions operators see",
      fontSize: FONT_LG,
    },
    {
      type: "rectangle",
      x: 48,
      y: 64,
      width: 140,
      height: 64,
      backgroundColor: "#e2e8f0",
      label: { text: "draft / created", fontSize: FONT_SM },
    },
    {
      type: "rectangle",
      x: 248,
      y: 64,
      width: 140,
      height: 64,
      backgroundColor: "#e0f2fe",
      label: { text: "active\n(verifying)", fontSize: FONT_SM },
    },
    {
      type: "rectangle",
      x: 448,
      y: 64,
      width: 140,
      height: 64,
      backgroundColor: "#fee2e2",
      label: { text: "anomaly\n(fix & continue)", fontSize: FONT_SM },
    },
    {
      type: "rectangle",
      x: 648,
      y: 64,
      width: 140,
      height: 64,
      backgroundColor: "#dcfce7",
      label: { text: "fulfilled\n(all lines done)", fontSize: FONT_SM },
    },
    {
      type: "arrow",
      x: 188,
      y: 92,
      width: 60,
      height: 4,
      points: [
        [0, 0],
        [60, 0],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "arrow",
      x: 388,
      y: 92,
      width: 60,
      height: 4,
      points: [
        [0, 0],
        [60, 0],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "arrow",
      x: 588,
      y: 92,
      width: 60,
      height: 4,
      points: [
        [0, 0],
        [60, 0],
      ],
      endArrowhead: "arrow",
    },
    {
      type: "text",
      x: 48,
      y: 148,
      width: 780,
      text: "Invalid / policy issues can push active → anomaly while work continues. Last pending line verified → fulfilled.",
      fontSize: FONT_SM,
    },
    {
      type: "rectangle",
      x: 32,
      y: 200,
      width: 824,
      height: 72,
      backgroundColor: "#f8fafc",
      label: {
        text:
          "Eligibility for another new order on the same project keys off fulfilled orders + any scanned line — not only this order’s state.",
        fontSize: FONT_SM,
      },
    },
  ];
}

function sceneAuth(): SceneDef["skeleton"] {
  return [
    {
      type: "text",
      x: 24,
      y: 12,
      width: 880,
      text: "Authentication — browser vs API",
      fontSize: FONT_LG,
    },
    {
      type: "rectangle",
      x: 32,
      y: 56,
      width: 400,
      height: 140,
      backgroundColor: "#e8f4fc",
      label: {
        text:
          "Browser navigation\n• No session → /login?redirect=<intended path>\n• After login, user returns to deep link or dashboard",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 456,
      y: 56,
      width: 400,
      height: 140,
      backgroundColor: "#fef3c7",
      label: {
        text:
          "API (fetch)\n• Missing/invalid session → 401 JSON\n• No HTML redirect from API routes",
        fontSize: FONT_SM,
      },
    },
    {
      type: "rectangle",
      x: 32,
      y: 216,
      width: 824,
      height: 80,
      backgroundColor: "#f1f5f9",
      label: {
        text:
          "Centralized routing helpers: lib/auth-routing.ts, lib/auth-guard.ts (includes printed-scan token path).",
        fontSize: FONT_SM,
      },
    },
  ];
}

const SCENES: SceneDef[] = [
  {
    id: "pm",
    title: "Project Manager",
    caption: "What PMs can change in catalog, team, and orders — and what is explicitly denied.",
    skeleton: scenePm(),
  },
  {
    id: "eligibility",
    title: "New order eligibility",
    caption: "Decision flow enforced in POST /api/orders and the new-order project picker.",
    skeleton: sceneEligibility(),
  },
  {
    id: "installer",
    title: "Installer",
    caption: "In-app scan, printed-sticker token flow, and installer-only restrictions.",
    skeleton: sceneInstaller(),
  },
  {
    id: "inventory",
    title: "Inventory & stock",
    caption: "Why multiple orders share one stock row per SKU and how verifies move quantity.",
    skeleton: sceneInventory(),
  },
  {
    id: "lifecycle",
    title: "Order lifecycle",
    caption: "Statuses from creation through anomaly to fulfilled, and how that ties to eligibility.",
    skeleton: sceneLifecycle(),
  },
  {
    id: "auth",
    title: "Authentication",
    caption: "Redirects for pages versus JSON errors for programmatic callers.",
    skeleton: sceneAuth(),
  },
];

export default function HelpConstraintsExcalidrawBlock() {
  const [active, setActive] = useState(0);
  const scene = SCENES[active] ?? SCENES[0]!;

  useLayoutEffect(() => {
    const g = globalThis as typeof globalThis & { EXCALIDRAW_ASSET_PATH?: string };
    if ("location" in globalThis && globalThis.location?.origin) {
      g.EXCALIDRAW_ASSET_PATH = globalThis.location.origin;
    }
  }, []);

  const initialData = useMemo(() => {
    const elements = convertToExcalidrawElements(scene.skeleton, {
      regenerateIds: true,
    });
    return {
      elements,
      appState: {
        viewBackgroundColor: "#f8fafc",
        theme: "light" as const,
      },
      scrollToContent: true,
    };
  }, [scene.skeleton]);

  return (
    <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Visual reference (Excalidraw)</h2>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            View-only canvases you can pan and zoom. Diagrams are defined in code (
            <code className="font-mono text-xs">components/help-constraints-excalidraw-block.tsx</code>
            ) so they stay in sync with releases. Each tab matches a section below.
          </p>
        </div>

        <div
          className="flex flex-wrap gap-2 border-b border-[color:var(--border)] pb-3"
          role="tablist"
          aria-label="Constraint diagrams"
        >
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                i === active
                  ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                  : "bg-[color:var(--surface-muted)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
              )}
              onClick={() => setActive(i)}
            >
              {s.title}
            </button>
          ))}
        </div>

        <p className="text-sm text-[color:var(--text-muted)]">{scene.caption}</p>

        <div
          className="overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-card)]"
          style={{ height: 520 }}
        >
          <Excalidraw
            key={scene.id}
            initialData={initialData}
            viewModeEnabled
            zenModeEnabled
            gridModeEnabled={false}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: false,
                clearCanvas: false,
                export: false,
                loadScene: false,
                saveToActiveFile: false,
                saveAsImage: false,
                toggleTheme: false,
              },
            }}
          />
        </div>
      </div>
  );
}

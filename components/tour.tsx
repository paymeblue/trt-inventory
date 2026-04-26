"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/components/session-context";

export interface TourStep {
  selector: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
}

interface TourProps {
  steps: TourStep[];
  /**
   * Deprecated — tour completion is now tracked per-user in the database
   * via `users.onboarded_at`. Left in the props for source-compat with
   * existing call sites; ignored at runtime.
   */
  storageKey?: string;
  autoStart?: boolean;
}

interface AnchorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const TOOLTIP_W = 320;
const TOOLTIP_MAX_H = 260;
const GAP = 14;

/** Floating tour launcher — draggable; position persisted in localStorage. */
const TOUR_FAB_PX = 56;
const TOUR_FAB_STORAGE = "trt-tour-fab-pos";

function clampFab(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type FabPos = { left: number; top: number };

function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

function resolveBox(el: Element | null): AnchorBox | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

/**
 * Minimal guided product tour. Renders a dimmed backdrop, spotlights the
 * element matching each step's CSS selector, and shows a tooltip with
 * navigation.
 *
 * Completion state is DB-backed: `users.onboarded_at`. The tour only
 * auto-opens for a user who has never seen it (`onboardedAt === null`).
 * Once they close/skip/finish it, we call `markOnboarded()` which POSTs
 * to `/api/me/onboarded` and updates the session — so the tour never
 * appears again for that account on any device.
 *
 * A draggable floating “?” button (position remembered in localStorage)
 * re-opens the tour on demand; only the automatic first-visit trigger is
 * gated by `onboardedAt`.
 */
export function Tour({ steps, autoStart = true }: TourProps) {
  const mounted = useIsMounted();
  const { user, markOnboarded } = useSession();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<AnchorBox | null>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  // Guard so the auto-open effect only fires once per mount — without
  // this, navigating between pages that both mount <Tour /> could re-open
  // the modal mid-session even after the user dismissed it.
  const autoOpenedRef = useRef(false);

  const step = steps[idx];

  useEffect(() => {
    if (!mounted || !autoStart || steps.length === 0) return;
    if (autoOpenedRef.current) return;
    // No session yet (e.g. /login) or user already onboarded → never auto-open.
    if (!user || user.onboardedAt) return;
    autoOpenedRef.current = true;
    const t = setTimeout(() => setOpen(true), 350);
    return () => clearTimeout(t);
  }, [mounted, autoStart, steps.length, user]);

  const recompute = useCallback(() => {
    if (!open || !step) return;
    const el = document.querySelector(step.selector);
    const b = resolveBox(el);
    setBox(b);

    // Tooltip placement: prefer below; flip if not enough room.
    if (!b) {
      setTip({
        top: window.innerHeight / 2 - TOOLTIP_MAX_H / 2,
        left: window.innerWidth / 2 - TOOLTIP_W / 2,
      });
      return;
    }
    const spaceBelow = window.innerHeight - (b.top + b.height);
    const spaceAbove = b.top;
    const below = spaceBelow >= TOOLTIP_MAX_H + GAP || spaceBelow >= spaceAbove;
    const top = below
      ? Math.min(
          window.innerHeight - TOOLTIP_MAX_H - 12,
          b.top + b.height + GAP,
        )
      : Math.max(12, b.top - TOOLTIP_MAX_H - GAP);
    let left = b.left + b.width / 2 - TOOLTIP_W / 2;
    left = Math.max(12, Math.min(window.innerWidth - TOOLTIP_W - 12, left));
    setTip({ top, left });
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => recompute());
    return () => cancelAnimationFrame(id);
  }, [open, recompute, idx]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(recompute);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    const obs = new MutationObserver(onResize);
    obs.observe(document.body, { subtree: true, childList: true });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      obs.disconnect();
    };
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(step?.selector ?? "");
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [idx, open, step]);

  const close = useCallback(
    (markDone: boolean) => {
      setOpen(false);
      setIdx(0);
      // Persist server-side the very first time the user finishes/skips
      // the tour. Subsequent close events are no-ops because the session
      // already has an onboardedAt.
      if (markDone && user && !user.onboardedAt) {
        void markOnboarded();
      }
    },
    [markOnboarded, user],
  );

  const openTour = useCallback(() => {
    setIdx(0);
    setOpen(true);
  }, []);

  const [fabPos, setFabPos] = useState<FabPos | null>(null);
  const fabPosRef = useRef<FabPos | null>(null);
  const dragRef = useRef<{
    ox: number;
    oy: number;
    ol: number;
    ot: number;
    moved: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    fabPosRef.current = fabPos;
  }, [fabPos]);

  useEffect(() => {
    if (!mounted) return;
    const tick = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(TOUR_FAB_STORAGE);
        if (raw) {
          const p = JSON.parse(raw) as FabPos;
          if (typeof p.left === "number" && typeof p.top === "number") {
            setFabPos({
              left: clampFab(p.left, 8, window.innerWidth - TOUR_FAB_PX - 8),
              top: clampFab(p.top, 8, window.innerHeight - TOUR_FAB_PX - 8),
            });
            return;
          }
        }
      } catch {
        /* ignore corrupt storage */
      }
      setFabPos({
        left: window.innerWidth - TOUR_FAB_PX - 24,
        top: window.innerHeight - TOUR_FAB_PX - 24,
      });
    });
    return () => cancelAnimationFrame(tick);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !fabPos) return;
    const onResize = () => {
      requestAnimationFrame(() => {
        setFabPos((prev) =>
          prev
            ? {
                left: clampFab(
                  prev.left,
                  8,
                  window.innerWidth - TOUR_FAB_PX - 8,
                ),
                top: clampFab(
                  prev.top,
                  8,
                  window.innerHeight - TOUR_FAB_PX - 8,
                ),
              }
            : prev,
        );
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted, fabPos]);

  const onFabPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const p = fabPosRef.current;
      if (!p) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        ox: e.clientX,
        oy: e.clientY,
        ol: p.left,
        ot: p.top,
        moved: false,
      };
    },
    [],
  );

  const onFabPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.ox;
      const dy = e.clientY - d.oy;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      setFabPos({
        left: clampFab(
          d.ol + dx,
          8,
          window.innerWidth - TOUR_FAB_PX - 8,
        ),
        top: clampFab(
          d.ot + dy,
          8,
          window.innerHeight - TOUR_FAB_PX - 8,
        ),
      });
    },
    [],
  );

  const onFabPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      setFabPos((prev) => {
        if (prev) {
          try {
            localStorage.setItem(TOUR_FAB_STORAGE, JSON.stringify(prev));
          } catch {
            /* private mode / quota */
          }
        }
        return prev;
      });
      if (d && !d.moved) openTour();
    },
    [openTour],
  );

  const onFabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openTour();
      }
    },
    [openTour],
  );

  const content = useMemo(() => {
    if (!open || !step) return null;
    const last = idx === steps.length - 1;
    return (
      <div className="fixed inset-0 z-50" aria-live="polite">
        {/* Spotlight + backdrop using box-shadow trick on the spotlight element */}
        {box && (
          <div
            className="tour-spotlight"
            style={{
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            }}
          />
        )}
        {!box && (
          <div className="absolute inset-0 bg-black/55" />
        )}

        {/* Tooltip */}
        <div
          role="dialog"
          aria-labelledby="tour-title"
          className="fixed z-[70] w-[320px] overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)] shadow-xl"
          style={{
            top: tip?.top ?? 120,
            left: tip?.left ?? 120,
            maxHeight: TOOLTIP_MAX_H,
          }}
        >
          <div className="flex items-start justify-between border-b border-[color:var(--border)] px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                Step {idx + 1} of {steps.length}
              </div>
              <div id="tour-title" className="mt-0.5 text-sm font-semibold">
                {step.title}
              </div>
            </div>
            <button
              onClick={() => close(true)}
              className="text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
              aria-label="Close tour"
            >
              ✕
            </button>
          </div>
          <div className="px-4 py-3 text-sm text-[color:var(--text)]">
            {step.body}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
            <button
              onClick={() => close(true)}
              className="text-xs font-semibold text-[color:var(--text-muted)] hover:underline"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              {idx > 0 && (
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                >
                  Back
                </button>
              )}
              <button
                className="btn btn-primary text-xs"
                onClick={() => {
                  if (last) close(true);
                  else setIdx((i) => Math.min(steps.length - 1, i + 1));
                }}
              >
                {last ? "Finish" : "Next →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [open, step, box, tip, idx, steps.length, close]);

  return (
    <>
      {mounted && fabPos !== null && steps.length > 0 ? (
        <button
          type="button"
          className="no-print fixed z-40 flex cursor-grab select-none items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-lg active:cursor-grabbing"
          style={{
            left: fabPos.left,
            top: fabPos.top,
            width: TOUR_FAB_PX,
            height: TOUR_FAB_PX,
            touchAction: "none",
          }}
          aria-label="Guided tour: what to do next on this page"
          title="Drag to move · Click for step-by-step help"
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          onPointerCancel={onFabPointerUp}
          onKeyDown={onFabKeyDown}
        >
          <span className="text-xl font-bold leading-none" aria-hidden>
            ?
          </span>
        </button>
      ) : null}
      {mounted && content ? createPortal(content, document.body) : null}
    </>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useWakeLock } from "@/lib/use-wake-lock";
import { playScanFeedback, type ScanFeedbackKind } from "@/lib/scan-feedback";

export interface ScanSessionFlash {
  kind: ScanFeedbackKind;
  at: number;
}

interface ScanSessionOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  remaining: number;
  total: number;
  /** True while a scan request is in flight — shows a "Recording…" pill. */
  busy: boolean;
  /** Every item on the order is already resolved — auto-closes shortly after. */
  allDone: boolean;
  /** Latest outcome from the parent, drives the beep/vibrate + color flash. */
  flash: ScanSessionFlash | null;
  errorMessage?: string | null;
  children: ReactNode;
}

/**
 * Full-screen chrome shared by every continuous scan session (camera or
 * physical scanner): progress header, Done button, screen wake lock,
 * outcome beep/vibrate + color flash, and auto-close once the order is
 * fulfilled. Callers only supply the scan surface itself (video feed vs.
 * a "ready" panel) via `children`.
 */
export function ScanSessionOverlay({
  open,
  onClose,
  title,
  remaining,
  total,
  busy,
  allDone,
  flash,
  errorMessage,
  children,
}: ScanSessionOverlayProps) {
  useWakeLock(open);

  const [flashVisible, setFlashVisible] = useState(false);
  const lastFlashAtRef = useRef(0);
  useEffect(() => {
    if (!open || !flash || flash.at === lastFlashAtRef.current) return;
    lastFlashAtRef.current = flash.at;
    playScanFeedback(flash.kind);
    setFlashVisible(true);
    const t = setTimeout(() => setFlashVisible(false), 900);
    return () => clearTimeout(t);
  }, [open, flash]);

  useEffect(() => {
    if (!open || !allDone) return;
    const t = setTimeout(() => onClose(), 1400);
    return () => clearTimeout(t);
  }, [open, allDone, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const flashActive = flashVisible && flash;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 bg-black/80 px-4 py-3 text-white">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-white/70">
            {remaining} of {total} remaining
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white active:bg-white/20"
        >
          Done
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        {children}

        {flashActive && (
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity ${
              flash!.kind === "valid"
                ? "bg-[color:var(--success)]/40"
                : flash!.kind === "duplicate"
                  ? "bg-[color:var(--warning)]/40"
                  : "bg-[color:var(--danger)]/40"
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/60 text-4xl text-white">
              {flash!.kind === "valid"
                ? "✓"
                : flash!.kind === "duplicate"
                  ? "↺"
                  : "!"}
            </div>
          </div>
        )}

        {busy && (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
            <span className="rounded-full bg-black/70 px-4 py-1.5 text-xs font-medium text-white">
              Recording…
            </span>
          </div>
        )}

        {allDone && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="rounded-xl bg-white px-6 py-4 text-center text-[color:var(--text)] shadow-xl">
              <div className="text-lg font-semibold">Order fulfilled</div>
              <div className="text-xs text-[color:var(--text-muted)]">
                Closing…
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="absolute inset-x-4 bottom-4 rounded-lg border border-[color:var(--danger)] bg-black/80 px-3 py-2 text-xs text-white">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

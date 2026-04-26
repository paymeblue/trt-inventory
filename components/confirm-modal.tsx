"use client";

import { useEffect, useId, useRef } from "react";

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: "danger" | "default";
  busy?: boolean;
  error?: string | null;
}

/**
 * Accessible, theme-aware confirmation dialog. Replaces native `confirm()`
 * so destructive actions match the rest of the UI.
 */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  variant = "danger",
  busy = false,
  error = null,
}: ConfirmModalProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onOpenChange]);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      aria-hidden={false}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color:var(--spotlight-backdrop)] backdrop-blur-[3px] transition-opacity"
        aria-label="Dismiss dialog"
        disabled={busy}
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="confirm-modal-panel relative w-full max-w-[420px] rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.55)]"
      >
        <div className="flex gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              variant === "danger"
                ? "bg-[color:var(--pill-anomaly-bg)] text-[color:var(--danger)]"
                : "bg-[color:var(--pill-active-bg)] text-[color:var(--primary)]"
            }`}
            aria-hidden
          >
            {variant === "danger" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-6 w-6"
              >
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-6 w-6"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-lg font-semibold leading-snug text-[color:var(--text)]"
            >
              {title}
            </h2>
            <div
              id={descId}
              className="mt-2 text-sm leading-relaxed text-[color:var(--text-muted)]"
            >
              {description}
            </div>
            {error && (
              <p
                className="mt-3 rounded-lg border border-[color:var(--danger)] bg-red-50 px-3 py-2 text-sm text-[color:var(--danger)]"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            className="btn btn-ghost w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            className={`btn w-full sm:w-auto ${
              variant === "danger" ? "btn-danger" : "btn-primary"
            }`}
            onClick={() => void onConfirm()}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

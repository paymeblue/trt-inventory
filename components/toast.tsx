"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastVariant = "success" | "error" | "info";

type ToastAction = { label: string; href: string };

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  /** When true the toast does not auto-dismiss and shows an explicit close button. */
  action?: ToastAction;
};

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
  /** Persistent toast — stays until user clicks Close or the action link. */
  showActionToast: (
    message: string,
    action: ToastAction,
    variant?: ToastVariant,
  ) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    [],
  );

  const showActionToast = useCallback(
    (
      message: string,
      action: ToastAction,
      variant: ToastVariant = "success",
    ) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, variant, action }]);
    },
    [],
  );

  const value = useMemo(
    () => ({ showToast, showActionToast }),
    [showToast, showActionToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.action ? "alertdialog" : "status"}
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
              t.variant === "success"
                ? "border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/90 dark:text-emerald-100"
                : t.variant === "error"
                  ? "border-[color:var(--danger)] bg-red-50 text-[color:var(--danger)] dark:bg-red-950/90"
                  : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text)]"
            }`}
          >
            <p>{t.message}</p>
            {t.action ? (
              <div className="mt-3 flex items-center gap-2">
                <Link
                  href={t.action.href}
                  onClick={() => dismiss(t.id)}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                >
                  {t.action.label}
                </Link>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="rounded-md border border-current/30 px-3 py-1.5 text-xs font-semibold opacity-70 hover:opacity-100"
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

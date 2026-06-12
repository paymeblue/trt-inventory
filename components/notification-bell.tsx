"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { BellAlertIcon } from "@heroicons/react/24/solid";
import { useNotifications } from "./notification-context";
import type { AppNotification } from "@/app/api/notifications/route";

const TYPE_ICON: Record<AppNotification["type"], string> = {
  project_activated: "P",
  order_created: "O",
  order_fulfilled: "F",
  project_pending_sa: "SA",
  project_pending_logistics: "LG",
};

const TYPE_COLOR: Record<AppNotification["type"], string> = {
  project_activated: "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
  order_created: "bg-sky-600 text-white",
  order_fulfilled: "bg-emerald-600 text-white",
  project_pending_sa: "bg-violet-600 text-white",
  project_pending_logistics: "bg-amber-600 text-white",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, dismissModal, pendingModal } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function handleOpen() {
    setOpen((o) => !o);
    if (!open) markAllRead();
  }

  function handleNotifClick(n: AppNotification) {
    dismissModal(n.id);
    setOpen(false);
    router.push(n.href);
  }

  return (
    <>
      {/* Bell button */}
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          onClick={handleOpen}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text)]"
        >
          {unreadCount > 0 ? (
            <BellAlertIcon className="h-5 w-5 text-[color:var(--primary)]" />
          ) : (
            <BellIcon className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--danger)] px-1 text-[9px] font-bold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]"
                aria-label="Close"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <CheckIcon className="h-8 w-8 text-[color:var(--text-muted)]" />
                <p className="text-sm text-[color:var(--text-muted)]">
                  You&apos;re all caught up
                </p>
              </div>
            ) : (
              <ul className="max-h-96 divide-y divide-[color:var(--border)] overflow-y-auto">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleNotifClick(n)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--surface-muted)]"
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${TYPE_COLOR[n.type]}`}
                        aria-hidden
                      >
                        {TYPE_ICON[n.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[color:var(--text)]">
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[color:var(--text-muted)] leading-snug">
                          {n.body}
                        </p>
                        <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Inline modal for project_activated / order_created */}
      {pendingModal && <NotificationModal notif={pendingModal} onDismiss={dismissModal} />}
    </>
  );
}

function NotificationModal({
  notif,
  onDismiss,
}: {
  notif: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();

  const ACTION_LABEL: Partial<Record<AppNotification["type"], string>> = {
    project_activated: "Create order",
    order_created: "View delivery",
    project_pending_sa: "Review now",
    project_pending_logistics: "Open queue",
  };
  const label = ACTION_LABEL[notif.type] ?? "View";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-[color:var(--surface)] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${TYPE_COLOR[notif.type]}`}
            aria-hidden
          >
            {TYPE_ICON[notif.type]}
          </span>
          <div className="flex-1">
            <h2
              id="notif-modal-title"
              className="text-base font-semibold text-[color:var(--text)]"
            >
              {notif.title}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">{notif.body}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onDismiss(notif.id)}
          >
            Later
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onDismiss(notif.id);
              router.push(notif.href);
            }}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

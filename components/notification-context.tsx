"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "./session-context";
import type { AppNotification } from "@/app/api/notifications/route";

const SEEN_KEY = "trt_notif_seen";
const MODAL_DISMISSED_KEY = "trt_notif_modal_dismissed";

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, s: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(s)));
  } catch {
    // storage full or private mode — ignore
  }
}

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  dismissModal: (id: string) => void;
  pendingModal: AppNotification | null;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [modalDismissed, setModalDismissed] = useState<Set<string>>(new Set());
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      setSeenIds(loadSet(SEEN_KEY));
      setModalDismissed(loadSet(MODAL_DISMISSED_KEY));
    }
  }, []);

  const { data } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () =>
      fetchJson<{ notifications: AppNotification[] }>("/api/notifications"),
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !seenIds.has(n.id)).length;

  const markAllRead = useCallback(() => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      saveSet(SEEN_KEY, next);
      return next;
    });
  }, [notifications]);

  const dismissModal = useCallback((id: string) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveSet(SEEN_KEY, next);
      return next;
    });
    setModalDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveSet(MODAL_DISMISSED_KEY, next);
      return next;
    });
  }, []);

  const pendingModal = useMemo(() => {
    const modalTypes: AppNotification["type"][] = [
      "project_activated",
      "order_created",
      "project_pending_sa",
      "project_pending_logistics",
    ];
    return (
      notifications.find(
        (n) => modalTypes.includes(n.type) && !modalDismissed.has(n.id),
      ) ?? null
    );
  }, [notifications, modalDismissed]);

  const value = useMemo(
    () => ({ notifications, unreadCount, markAllRead, dismissModal, pendingModal }),
    [notifications, unreadCount, markAllRead, dismissModal, pendingModal],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}

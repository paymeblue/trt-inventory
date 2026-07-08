"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the screen awake while `active` is true (e.g. a continuous scan
 * session), and re-acquires the lock if the tab was backgrounded and comes
 * back — mobile browsers release wake locks whenever the page loses
 * visibility. Silently no-ops on browsers without the Screen Wake Lock API.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Refused (e.g. low battery, backgrounded tab) — scanning still
        // works, the screen just may dim sooner.
      }
    }

    void acquire();

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinelRef.current) {
        void acquire();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [active]);
}

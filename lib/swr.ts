"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSWROptions<T> {
  /** Fixed-interval polling (always on while the hook is mounted). */
  refreshMs?: number;
  /**
   * Poll every `pollIntervalMs` only while this returns true for the latest
   * `data`. Avoids a parent `useEffect` + `setState` just to toggle polling.
   */
  pollIntervalMs?: number;
  pollWhile?: (data: T | undefined) => boolean;
}

/**
 * Tiny stand-in for SWR so we don't pull in an extra dependency for a
 * handful of fetches. Re-fetches on `mutate()`, window focus, tab
 * visibility (so switching back from a phone-scan tab updates the page),
 * and optional polling (`refreshMs` or `pollIntervalMs` + `pollWhile`).
 */
export default function useSWR<T>(
  url: string | null,
  options: UseSWROptions<T> = {},
): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: () => Promise<void>;
} {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isLoading, setLoading] = useState(!!url);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as T;
      if (mounted.current) {
        setData(json);
        setError(undefined);
      }
    } catch (err) {
      if (mounted.current) setError(err as Error);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    const tick = requestAnimationFrame(() => {
      void load();
    });
    return () => {
      cancelAnimationFrame(tick);
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    let iv: ReturnType<typeof setInterval> | undefined;
    const pollMs = options.pollIntervalMs ?? 0;
    const fixedMs = options.refreshMs ?? 0;
    const pollPred = options.pollWhile;
    if (pollMs > 0 && pollPred) {
      if (pollPred(data)) {
        iv = setInterval(() => void load(), pollMs);
      }
    } else if (fixedMs > 0) {
      iv = setInterval(() => void load(), fixedMs);
    }
    return () => {
      if (iv) clearInterval(iv);
    };
  }, [load, data, options.refreshMs, options.pollIntervalMs, options.pollWhile]);

  return { data, error, isLoading, mutate: load };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tiny stand-in for SWR so we don't pull in an extra dependency for a
 * handful of fetches. Re-fetches on `mutate()` or on window focus.
 */
export default function useSWR<T>(
  url: string | null,
  options: { refreshMs?: number } = {},
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
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    let iv: ReturnType<typeof setInterval> | undefined;
    if (options.refreshMs) {
      iv = setInterval(() => void load(), options.refreshMs);
    }
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", onFocus);
      if (iv) clearInterval(iv);
    };
  }, [load, options.refreshMs]);

  return { data, error, isLoading, mutate: load };
}

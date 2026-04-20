"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/db/schema";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  /**
   * ISO timestamp at which the user finished or skipped the guided tour.
   * `null` → brand-new user who hasn't seen it yet → tour auto-opens once.
   */
  onboardedAt: string | null;
}

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Persist "tour finished" server-side and update the in-memory session
   * so it never auto-opens again for this user. Idempotent and tolerant
   * of network errors — local state moves forward regardless.
   */
  markOnboarded: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

interface Props {
  children: React.ReactNode;
  initialUser: SessionUser | null;
}

export function SessionProvider({ children, initialUser }: Props) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const json = await res.json();
      setUser(json.user ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
    router.refresh();
  }, [router]);

  const markOnboarded = useCallback(async () => {
    setUser((u) => (u ? { ...u, onboardedAt: new Date().toISOString() } : u));
    try {
      await fetch("/api/me/onboarded", { method: "POST" });
    } catch {
      // Best-effort: we've already updated local state. If the server
      // write failed they'll see the tour again next session, which is
      // acceptable degradation.
    }
  }, []);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const value = useMemo<SessionState>(
    () => ({ user, loading, refresh, logout, markOnboarded }),
    [user, loading, refresh, logout, markOnboarded],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/**
 * Convenience that returns the authenticated user. Use in components rendered
 * behind the auth guard. If the session is momentarily null (e.g. during
 * logout or a dev Fast Refresh) it triggers a redirect to /login and returns
 * null so callers can render a fallback instead of crashing.
 */
export function useAuthedUser(): SessionUser | null {
  const { user } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);
  return user;
}

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
}

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
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

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const value = useMemo<SessionState>(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout],
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

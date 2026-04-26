"use client";

import { useSession } from "./session-context";
import { UserMenu } from "./user-menu";

export function Topbar() {
  const { user, logout } = useSession();

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface)] px-6 md:px-10">
      <div>
        <div className="text-base font-semibold leading-tight">
          Order Management & Verification
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          Barcode-driven logistics tracking
        </div>
      </div>

      {user ? <UserMenu user={user} onSignOut={() => void logout()} /> : null}
    </header>
  );
}

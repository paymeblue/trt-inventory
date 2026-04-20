"use client";

import { useTheme } from "./theme-context";

/**
 * Tri-state theme picker: Light / Dark / System.
 *
 * Rendered in the topbar. Uses `suppressHydrationWarning` on the button
 * label because the correct state is only known after client-side
 * hydration (the no-FOUC script paints the right theme but React renders
 * an initial "system" default during SSR).
 */
export function ThemeToggle() {
  const { choice, resolved, setChoice } = useTheme();

  const next: Record<typeof choice, typeof choice> = {
    light: "dark",
    dark: "system",
    system: "light",
  };

  const label =
    choice === "system"
      ? `System (${resolved})`
      : choice === "dark"
        ? "Dark"
        : "Light";

  const icon = resolved === "dark" ? "☾" : "☼";

  return (
    <button
      type="button"
      onClick={() => setChoice(next[choice])}
      className="btn btn-ghost text-xs"
      title={`Theme: ${label}. Click to cycle Light → Dark → System.`}
      aria-label={`Switch theme (current: ${label})`}
      suppressHydrationWarning
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden sm:inline" suppressHydrationWarning>
        {label}
      </span>
    </button>
  );
}

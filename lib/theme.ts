export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "trt.theme";

/**
 * Collapses the three-way choice into the concrete theme that should be
 * applied to `<html data-theme>`. Extracted into a pure helper so the
 * no-FOUC inline script, the React provider, and tests all agree on the
 * exact rule.
 */
export function resolveTheme(
  choice: ThemeChoice,
  prefersDark: boolean,
): ResolvedTheme {
  if (choice === "dark") return "dark";
  if (choice === "light") return "light";
  return prefersDark ? "dark" : "light";
}

/**
 * Emits a `<script>` string that:
 *   1. reads the stored ThemeChoice from localStorage (falling back to "system");
 *   2. resolves against `prefers-color-scheme`;
 *   3. sets `document.documentElement.dataset.theme` before first paint.
 *
 * Rendered into `<head>` via `dangerouslySetInnerHTML` in the root layout
 * so there's zero flash of the wrong theme on page load.
 */
export const themeBootstrapScript = `(() => {
  try {
    var key = ${JSON.stringify(THEME_STORAGE_KEY)};
    var stored = localStorage.getItem(key);
    var choice = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = choice === "dark" ? "dark" : choice === "light" ? "light" : (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (e) {
    // noop: default CSS :root block keeps us on light if anything fails.
  }
})();`;

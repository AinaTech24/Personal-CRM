/** Reads one of the `--safe-*` custom properties (see globals.css, backed by `env(safe-area-inset-*)`) as a pixel number — 0 during SSR or wherever it isn't set. */
export function safeAreaInset(varName: "--safe-top" | "--safe-bottom" | "--safe-left" | "--safe-right"): number {
  if (typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

"use client";

import { useEffect } from "react";

/**
 * Every deploy overwrites `.next` with a new build whose chunk filenames are
 * freshly content-hashed — a tab left open from before the deploy still has
 * the old filenames baked into its already-loaded JS, so the moment it tries
 * to fetch a chunk it hadn't loaded yet (a route it hasn't visited, a lazy
 * import), that file is just gone. The browser surfaces this as a
 * ChunkLoadError (webpack) or a "Failed to fetch dynamically imported
 * module" rejection (the newer bundler) — previously a dead end the person
 * had to notice and manually refresh past. This reloads automatically
 * instead, so a deploy in the background doesn't surface as breakage.
 *
 * A sessionStorage cooldown stops a reload loop if the new build is itself
 * somehow broken (reloading would hit the same error again and again) —
 * one automatic recovery attempt per short window, then it just surfaces
 * like any other error from here out.
 */
const COOLDOWN_KEY = "stale-bundle-reload-at";
const COOLDOWN_MS = 15_000;

function isChunkLoadFailure(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w.-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

function recentlyReloaded(): boolean {
  try {
    const last = Number(sessionStorage.getItem(COOLDOWN_KEY) ?? 0);
    return Date.now() - last < COOLDOWN_MS;
  } catch {
    // Storage blocked (private browsing, etc.) — treat as "not recently
    // reloaded" rather than never recovering at all.
    return false;
  }
}

function reloadOnce() {
  if (recentlyReloaded()) return;
  try {
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch {
    // Can't persist the cooldown — still safe to reload once; worst case a
    // second genuine failure right after just surfaces normally.
  }
  window.location.reload();
}

export function StaleBundleRecovery() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      if (isChunkLoadFailure(event.message) || isChunkLoadFailure(event.error?.name) || isChunkLoadFailure(event.error?.message)) {
        reloadOnce();
      }
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = typeof reason === "string" ? reason : (reason?.message ?? reason?.name);
      if (isChunkLoadFailure(message)) reloadOnce();
    }

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

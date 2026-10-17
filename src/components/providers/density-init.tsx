"use client";

import { useEffect } from "react";

/** Applies the signed-in user's density preference to <html> so the
    compact-density CSS in globals.css can key off it. Renders nothing.
    Skipped on the public Forms routes (/f/**) — unauthenticated, and kept
    independent of auth entirely so a third-party iframe embed never has a
    reason to touch /api/auth/me. */
export function DensityInit() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/f/")) return;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const density = data.user?.density;
        if (density) document.documentElement.dataset.density = density;
      })
      .catch(() => {});
  }, []);

  return null;
}

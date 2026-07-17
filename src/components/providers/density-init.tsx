"use client";

import { useEffect } from "react";

/** Applies the signed-in user's density preference to <html> so the
    compact-density CSS in globals.css can key off it. Renders nothing. */
export function DensityInit() {
  useEffect(() => {
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

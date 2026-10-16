"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes the CRM installable. Only in
 * production — a cached SW during development just serves stale bundles.
 *
 * Skipped entirely on the public Forms routes (/f/**), which can render
 * inside a third-party iframe on someone else's site: an install prompt
 * makes no sense there, and merely touching `navigator.serviceWorker` can
 * throw a SecurityError in that context (Safari ITP, Brave, Incognito, and
 * Chrome with third-party storage blocked all restrict it for an embedded
 * cross-origin frame) — wrapped in try/catch too, so even an unexpected
 * throw elsewhere never takes the page down with it.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (window.location.pathname.startsWith("/f/")) return;
    try {
      if (!("serviceWorker" in navigator)) return;
      const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
      if (document.readyState === "complete") {
        register();
        return;
      }
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    } catch {
      // Accessing navigator.serviceWorker itself can throw in a blocked
      // third-party context — never let that crash the page.
    }
  }, []);

  return null;
}

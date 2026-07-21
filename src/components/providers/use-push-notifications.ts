"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Subscribes this device to Web Push.
 *
 * Push only works from a service worker over HTTPS, and on iOS only once the
 * app has been added to the home screen — Safari in a normal tab has no Push
 * API at all. `supported` reflects that, so the UI can explain rather than
 * offering a switch that could never work.
 */

/** The VAPID key travels as base64url but PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export type PushState = "unsupported" | "unconfigured" | "denied" | "off" | "on";

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  /** Why the last attempt failed, so the UI can say rather than silently revert. */
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supported) {
        if (active) setState("unsupported");
        return;
      }
      const res = await fetch("/api/push/subscribe").catch(() => null);
      const cfg = res && res.ok ? await res.json().catch(() => null) : null;
      if (!active) return;
      if (!cfg?.configured || !cfg.publicKey) {
        setState("unconfigured");
        return;
      }
      setPublicKey(cfg.publicKey);

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
      if (active) setState(sub ? "on" : "off");
    })();
    return () => {
      active = false;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported || !publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        if (permission !== "denied") setError("You dismissed the permission prompt.");
        return;
      }

      // `ready` never settles if no service worker is registered, which would
      // otherwise leave the switch spinning forever with nothing to show for it.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("The service worker isn't running — reload the page and try again.")), 8000)
        ),
      ]);

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          // Required by every browser: a push must show something to the user.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `The server rejected the subscription (${res.status}).`);
      }
      setState("on");
    } catch (err) {
      // Silently reverting the switch is what made this impossible to diagnose:
      // the browser knows exactly why, so pass its reason straight through.
      const raw = err instanceof Error ? err.message : String(err);
      // Brave ships with Google's push service disabled, and its failure text
      // ("push service error") explains nothing on its own.
      const friendly = /push service/i.test(raw)
        ? "Your browser blocked the push service. In Brave: Settings → Privacy and security → turn on \"Use Google services for push messaging\", then restart the browser."
        : raw;
      console.error("[push] enable failed:", err);
      setError(friendly);
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [supported, publicKey]);

  const disable = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Tell the server first — once unsubscribed we no longer have the
        // endpoint to identify the row by.
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { state, busy, error, enable, disable };
}

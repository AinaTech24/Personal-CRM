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
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Required by every browser: pushes must be user-visible.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(res.ok ? "on" : "off");
    } catch {
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

  return { state, busy, enable, disable };
}

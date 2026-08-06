"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";

/**
 * Animation JSON is fetched once per src and shared across every mounted
 * instance (the sidebar alone renders two copies — desktop rail + mobile
 * drawer — so without this every icon would fetch twice on first paint).
 */
const cache = new Map<string, Promise<Record<string, unknown>>>();
function loadAnimation(src: string): Promise<Record<string, unknown>> {
  let pending = cache.get(src);
  if (!pending) {
    pending = fetch(encodeURI(src)).then((r) => r.json());
    cache.set(src, pending);
  }
  return pending;
}

/**
 * The actual color the app is currently rendering `text-muted-foreground`
 * as — read off a throwaway probe element rather than the raw CSS variable,
 * so this works regardless of what color space the theme defines it in
 * (oklch/hsl/hex/…): the browser always normalizes a computed `color` to
 * `rgb(...)`. Re-read whenever the theme changes.
 */
function readMutedForegroundRgb(): [number, number, number] {
  const probe = document.createElement("span");
  probe.className = "text-muted-foreground";
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const nums = resolved.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return [140, 140, 140];
  return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
}

type LottieColor = { k: unknown };

function setColorValue(k: unknown, target: [number, number, number]) {
  if (Array.isArray(k) && typeof k[0] === "number") {
    k[0] = target[0];
    k[1] = target[1];
    k[2] = target[2];
    return;
  }
  if (Array.isArray(k)) {
    // Animated color — a keyframe array, each with start/end value tuples.
    for (const frame of k as Record<string, unknown>[]) {
      const s = frame.s;
      const e = frame.e;
      if (Array.isArray(s)) {
        s[0] = target[0];
        s[1] = target[1];
        s[2] = target[2];
      }
      if (Array.isArray(e)) {
        e[0] = target[0];
        e[1] = target[1];
        e[2] = target[2];
      }
    }
  }
}

function walkShapes(shapes: unknown, target: [number, number, number]) {
  if (!Array.isArray(shapes)) return;
  for (const shape of shapes as Record<string, unknown>[]) {
    if ((shape.ty === "fl" || shape.ty === "st") && shape.c) {
      setColorValue((shape.c as LottieColor).k, target);
    }
    if (Array.isArray(shape.it)) walkShapes(shape.it, target);
  }
}

/**
 * Deep-clones the animation and overwrites every fill/stroke color with
 * `rgb` — these icons ship black by default; the app wants them the same
 * grayish tone as sidebar link text, in both themes. Alpha is left alone.
 */
function recolor(data: Record<string, unknown>, rgb: [number, number, number]): Record<string, unknown> {
  const target: [number, number, number] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  const clone = JSON.parse(JSON.stringify(data));
  for (const layer of (clone.layers as Record<string, unknown>[] | undefined) ?? []) {
    walkShapes(layer.shapes, target);
  }
  // Precomps (referenced by id from a layer) keep their own shapes under assets.
  for (const asset of (clone.assets as Record<string, unknown>[] | undefined) ?? []) {
    for (const layer of (asset.layers as Record<string, unknown>[] | undefined) ?? []) {
      walkShapes(layer.shapes, target);
    }
  }
  return clone;
}

/**
 * A Lottie animation used in place of a static icon: sits on its first frame
 * at rest, and plays — looping for as long as `playing` stays true — the
 * instant it doesn't. The caller decides what "playing" means: hover for a
 * plain nav icon, hover-or-unread for the notification bell, hover-or-
 * filter-applied for a filter icon, etc. Recolored to match the app's own
 * muted-foreground tone (re-derived on theme change) instead of shipping
 * whatever color the source file happened to be exported in, and rendered
 * viewBox-only so every icon — regardless of its own canvas size — fills
 * exactly `size`×`size` px, no bigger or smaller than its neighbors.
 */
export function LottieIcon({
  src,
  size = 20,
  className,
  playing = false,
}: {
  /** Path under /public, e.g. "/icons/Dashboard.json". */
  src: string;
  size?: number;
  className?: string;
  playing?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [coloredData, setColoredData] = useState<Record<string, unknown> | null>(null);
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    let cancelled = false;
    loadAnimation(src).then((json) => {
      if (!cancelled) setRawData(json);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Re-tint whenever the source data arrives or the theme flips — the
  // resolved muted-foreground color is different in each. Deferred by a
  // macrotask: next-themes applies its `data-theme` attribute change from
  // its OWN effect on the provider, an ancestor of every icon here — React
  // fires passive effects bottom-up (children before parents), so reading
  // computed style synchronously in this effect would run before that
  // attribute update lands, sampling the outgoing theme's color instead of
  // the new one. All effects from a single commit — ours and the
  // provider's — run synchronously before any timer callback gets a turn,
  // so by the time this fires the attribute is guaranteed to be current.
  // A plain setTimeout is used over requestAnimationFrame because rAF is
  // throttled to a crawl (or stops firing) on a backgrounded/non-visible
  // tab, which would leave a backgrounded tab's icons stuck on stale colors
  // far longer than this needs to be delayed.
  useEffect(() => {
    if (!rawData) return;
    const timer = setTimeout(() => {
      setColoredData(recolor(rawData, readMutedForegroundRgb()));
    }, 0);
    return () => clearTimeout(timer);
  }, [rawData, resolvedTheme]);

  useEffect(() => {
    const instance = lottieRef.current;
    if (!instance || !coloredData) return;
    if (playing) instance.play();
    else instance.goToAndStop(0);
  }, [playing, coloredData]);

  if (!coloredData) {
    return <span aria-hidden style={{ width: size, height: size, display: "inline-block" }} className={className} />;
  }

  return (
    <span aria-hidden style={{ width: size, height: size, display: "inline-flex" }} className={className}>
      <Lottie
        lottieRef={lottieRef}
        animationData={coloredData}
        autoplay={false}
        loop={playing}
        rendererSettings={{ viewBoxOnly: true, preserveAspectRatio: "xMidYMid meet" }}
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}

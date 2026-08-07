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
 * oklab(L a b [/ alpha]) → sRGB 0–255, per the CSS Color Module 4 / Björn
 * Ottosson's reference formulas. Needed because a computed color WITH an
 * alpha channel (any opacity-modified `text-*` Tailwind class, e.g.
 * "text-primary/70") comes back from getComputedStyle as `oklab(...)`, not
 * `rgb(...)`/`rgba(...)` — a
 * plain-number regex over that string reads L/a/b (each in roughly a 0–1
 * range) as if they were 0–255 RGB channels, producing a near-black color
 * regardless of the actual hue. A canvas fillStyle round-trip doesn't help:
 * current engines report it back as oklab() too, rather than converting.
 */
function oklabToRgb(l: number, a: number, b: number): [number, number, number] {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;
  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const clamp = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);
  return [clamp(gamma(rLin)), clamp(gamma(gLin)), clamp(gamma(bLin))];
}

/**
 * The actual color the app is currently rendering a given `text-*` utility
 * as — read off a throwaway probe element rather than the raw CSS variable,
 * so this works regardless of what color space the theme defines it in
 * (oklch/hsl/hex/…). Pass "text-muted-foreground" for the icon's resting
 * shade, "text-foreground" for its hovered/active one — the same two classes
 * every surrounding nav label already switches between — or any other
 * `text-*` class, opacity modifier included (e.g. "text-primary/70").
 */
function readColorRgb(className: string): [number, number, number] {
  const probe = document.createElement("span");
  probe.className = className;
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);

  // An opacity-modified class (any `text-*/NN`) reports back as oklab(...)
  // rather than rgb()/rgba() — see oklabToRgb's comment.
  const oklab = resolved.match(/^oklab\(\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
  if (oklab) return oklabToRgb(Number(oklab[1]), Number(oklab[2]), Number(oklab[3]));

  const nums = resolved.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return [140, 140, 140];
  return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
}

type LottieScalar = { k: unknown };

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

/** Raises a possibly-animated scalar (Lottie wraps even single numbers in a 1-element array for keyframes) to at least `floor`, in place. */
function floorScalarValue(k: unknown, floor: number) {
  if (typeof k === "number") return Math.max(k, floor);
  if (Array.isArray(k)) {
    for (const frame of k as Record<string, unknown>[]) {
      const s = frame.s;
      const e = frame.e;
      if (Array.isArray(s) && typeof s[0] === "number") s[0] = Math.max(s[0], floor);
      if (Array.isArray(e) && typeof e[0] === "number") e[0] = Math.max(e[0], floor);
    }
  }
  return k;
}

/**
 * Stroke width, relative to canvas size, used as a floor so every Lottie
 * icon reads at roughly the same visual weight instead of whatever the
 * source file happened to ship with (this pack ranges from 5 to 22.5 on an
 * identical 576-unit canvas). Tuned by bracketing across several rounds of
 * feedback: a literal match of the static Icon* set's own ratio (1.75/24,
 * ~42 here) made busy multi-curve icons (the notification bell) look
 * heavy-handed/blobby; ~30 was still too heavy on Clients/Projects; ~20 read
 * as too thin on simpler icons (Search, the theme toggle). Landed low,
 * closer to that last point — a slightly light icon is a much smaller
 * problem than a blobby or visually broken one.
 *
 * A separate attempt at fixing icons whose content only fills a small
 * fraction of their own canvas (cropping the rendered viewBox in toward
 * canvas center to magnify sparse ones) was reverted — several of this
 * pack's icons aren't actually centered on their own canvas the way that
 * assumed, so the crop clipped real content and turned recognizable icons
 * into unrelated shapes (a magnifying glass into a crescent, a bell into a
 * rounded square). No replacement for that is in place; a too-small icon
 * is preferable to a corrupted one.
 */
const REFERENCE_STROKE_RATIO = 22 / 576;

function restyleShapes(shapes: unknown, targetColor: [number, number, number], strokeFloor: number) {
  if (!Array.isArray(shapes)) return;
  for (const shape of shapes as Record<string, unknown>[]) {
    if ((shape.ty === "fl" || shape.ty === "st") && shape.c) {
      setColorValue((shape.c as LottieScalar).k, targetColor);
    }
    if (shape.ty === "st" && shape.w && typeof shape.w === "object") {
      const w = shape.w as LottieScalar;
      w.k = floorScalarValue(w.k, strokeFloor);
    }
    if (Array.isArray(shape.it)) restyleShapes(shape.it, targetColor, strokeFloor);
  }
}

/**
 * Deep-clones the animation, overwrites every fill/stroke color with `rgb`,
 * and normalizes every stroke to at least the app's own reference weight.
 * These icons ship black, at whatever stroke width each individually
 * happened to be exported with (this pack ranges from 5 to 22.5 units on an
 * identical 576-unit canvas) — fine at whatever size the source file was
 * designed for, but at the ~20px this app renders icons at, the thinner
 * ones are close to invisible and the set looks inconsistent next to itself.
 * Alpha is left alone; an icon already at or above the floor is untouched.
 */
function restyle(data: Record<string, unknown>, rgb: [number, number, number]): Record<string, unknown> {
  const targetColor: [number, number, number] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  const clone = JSON.parse(JSON.stringify(data));
  const canvasSize = typeof clone.w === "number" ? clone.w : 576;
  const strokeFloor = canvasSize * REFERENCE_STROKE_RATIO;
  for (const layer of (clone.layers as Record<string, unknown>[] | undefined) ?? []) {
    restyleShapes(layer.shapes, targetColor, strokeFloor);
  }
  // Precomps (referenced by id from a layer) keep their own shapes under assets.
  for (const asset of (clone.assets as Record<string, unknown>[] | undefined) ?? []) {
    for (const layer of (asset.layers as Record<string, unknown>[] | undefined) ?? []) {
      restyleShapes(layer.shapes, targetColor, strokeFloor);
    }
  }
  return clone;
}

/**
 * A Lottie animation used in place of a static icon: sits on its first frame
 * at rest, and plays — looping for as long as `playing` stays true — the
 * instant it doesn't. The caller decides what "playing" means: hover for a
 * plain nav icon, hover-or-unread for the notification bell, hover-or-
 * filter-applied for a filter icon, etc.
 *
 * Recolored to match the app's own muted-foreground tone at rest, or its
 * foreground tone when `highlighted` — the same two shades every
 * surrounding nav label already switches between on hover/active, which a
 * static Icon* gets for free via `stroke="currentColor"` but a Lottie
 * export with baked-in color values does not. Re-derived on theme change,
 * and rendered viewBox-only so every icon — regardless of its own canvas
 * size — fills exactly `size`×`size` px, no bigger or smaller than its
 * neighbors.
 */
export function LottieIcon({
  src,
  size = 20,
  className,
  playing = false,
  highlighted = false,
  colorClassName,
}: {
  /** Path under /public, e.g. "/icons/Dashboard.json". */
  src: string;
  size?: number;
  className?: string;
  playing?: boolean;
  highlighted?: boolean;
  /**
   * Overrides the default muted-foreground/foreground pair with a single
   * fixed `text-*` shade, used regardless of `highlighted` — for an icon
   * that never sits on the sidebar's own muted-foreground text color to
   * begin with, e.g. one drawn on a solid `bg-primary` circle, where it
   * needs `text-primary-foreground` instead.
   */
  colorClassName?: string;
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

  // Re-tint whenever the source data arrives, the theme flips, or the
  // highlighted state changes. Deferred by a macrotask: next-themes applies
  // its `data-theme` attribute change from its OWN effect on the provider,
  // an ancestor of every icon here — React fires passive effects bottom-up
  // (children before parents), so reading computed style synchronously in
  // this effect would run before that attribute update lands, sampling the
  // outgoing theme's color instead of the new one. All effects from a
  // single commit — ours and the provider's — run synchronously before any
  // timer callback gets a turn, so by the time this fires the attribute is
  // guaranteed to be current. A plain setTimeout is used over
  // requestAnimationFrame because rAF is throttled to a crawl (or stops
  // firing) on a backgrounded/non-visible tab, which would leave a
  // backgrounded tab's icons stuck on stale colors far longer than this
  // needs to be delayed.
  useEffect(() => {
    if (!rawData) return;
    const timer = setTimeout(() => {
      const rgb = readColorRgb(colorClassName ?? (highlighted ? "text-foreground" : "text-muted-foreground"));
      setColoredData(restyle(rawData, rgb));
    }, 0);
    return () => clearTimeout(timer);
  }, [rawData, resolvedTheme, highlighted, colorClassName]);

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

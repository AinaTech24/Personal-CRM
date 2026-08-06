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
 * The actual color the app is currently rendering a given `text-*` utility
 * as — read off a throwaway probe element rather than the raw CSS variable,
 * so this works regardless of what color space the theme defines it in
 * (oklch/hsl/hex/…): the browser always normalizes a computed `color` to
 * `rgb(...)`. Pass "text-muted-foreground" for the icon's resting shade,
 * "text-foreground" for its hovered/active one — the same two classes every
 * surrounding nav label already switches between.
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
 * identical 576-unit canvas). Tuned by bracketing: a literal match of the
 * static Icon* set's own ratio (1.75/24, ~42 here) made multi-curve icons
 * like the notification bell look heavy-handed/blobby; dropping to ~20 to
 * fix that then read as too thin on simpler icons (Search, the theme
 * toggle). This sits at the midpoint of that feedback.
 */
const REFERENCE_STROKE_RATIO = 30 / 576;

function collectVertices(shapes: unknown, out: [number, number][]) {
  if (!Array.isArray(shapes)) return;
  for (const shape of shapes as Record<string, unknown>[]) {
    if (shape.ty === "sh" && shape.ks) {
      const k = (shape.ks as LottieScalar).k;
      const frames = Array.isArray(k) ? k : [k];
      for (const frame of frames as Record<string, unknown>[]) {
        const v = (frame.v as [number, number][] | undefined) ?? (frame.s as { v?: [number, number][] } | undefined)?.v;
        if (Array.isArray(v)) for (const pt of v) out.push(pt);
      }
    }
    if (shape.ty === "el" && shape.p && shape.s) {
      const p = (shape.p as LottieScalar).k as number[] | undefined;
      const sz = (shape.s as LottieScalar).k as number[] | undefined;
      if (Array.isArray(p) && Array.isArray(sz)) {
        out.push([p[0] - sz[0] / 2, p[1] - sz[1] / 2]);
        out.push([p[0] + sz[0] / 2, p[1] + sz[1] / 2]);
      }
    }
    if (Array.isArray(shape.it)) collectVertices(shape.it, out);
  }
}

const TARGET_FILL_RATIO = 0.72;
const MAX_CONTENT_ZOOM = 2.2;

/**
 * How much to crop the SVG's viewBox in toward canvas center to bring this
 * icon's own drawn content up to a consistent fraction of the frame.
 * Some icons in this pack draw their glyph across a fifth of their own
 * 576-unit canvas (the bell in Notifications.json: ~19%) while others use
 * nearly all of it (Meetings.json: ~91%) — at an identical container size
 * the sparser ones read visibly smaller even though nothing about the
 * container changed. Deliberately centers on the CANVAS's own center, not
 * the shape's bounding-box center — several icons' individual layers have
 * off-center anchors (this pack composites each icon from many small
 * independently-anchored shape layers), so a bbox built from each layer's
 * absolute position came out nonsensical, in one case exceeding the canvas
 * entirely. Every icon observed in this pack is roughly canvas-centered
 * overall even where individual pieces aren't, so this simpler, sturdier
 * measure — width/height span of every vertex, position-independent, so it
 * can't produce the same nonsense — is used instead. Returns 1 (no crop)
 * for anything already at or above the target, and for anything with no
 * directly-readable shape data to measure.
 */
function contentZoom(data: Record<string, unknown>): number {
  const canvasSize = typeof data.w === "number" ? data.w : 576;
  const points: [number, number][] = [];
  for (const layer of (data.layers as Record<string, unknown>[] | undefined) ?? []) {
    collectVertices(layer.shapes, points);
  }
  for (const asset of (data.assets as Record<string, unknown>[] | undefined) ?? []) {
    for (const layer of (asset.layers as Record<string, unknown>[] | undefined) ?? []) {
      collectVertices(layer.shapes, points);
    }
  }
  if (points.length === 0) return 1;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const ratio = Math.max(width, height) / canvasSize;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(Math.max(TARGET_FILL_RATIO / ratio, 1), MAX_CONTENT_ZOOM);
}

/** SVG viewBox string cropped in toward canvas center by `zoom`; undefined (native, uncropped) when zoom is 1. */
function viewBoxForZoom(data: Record<string, unknown>, zoom: number): string | undefined {
  if (zoom <= 1) return undefined;
  const w = typeof data.w === "number" ? data.w : 576;
  const h = typeof data.h === "number" ? data.h : 576;
  const croppedW = w / zoom;
  const croppedH = h / zoom;
  return `${(w - croppedW) / 2} ${(h - croppedH) / 2} ${croppedW} ${croppedH}`;
}

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
  const [viewBoxSize, setViewBoxSize] = useState<string | undefined>(undefined);
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    let cancelled = false;
    loadAnimation(src).then((json) => {
      if (!cancelled) {
        setRawData(json);
        // Pure geometry — doesn't depend on theme/highlight, computed once
        // per source file rather than alongside the recolor effect below.
        setViewBoxSize(viewBoxForZoom(json, contentZoom(json)));
      }
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
        rendererSettings={{ viewBoxOnly: true, preserveAspectRatio: "xMidYMid meet", viewBoxSize }}
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}

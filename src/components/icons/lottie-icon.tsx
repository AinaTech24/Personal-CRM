"use client";

import { useEffect, useRef, useState } from "react";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";

/**
 * Animation JSON is fetched once per src and shared across every mounted
 * instance (the sidebar alone renders two copies — desktop rail + mobile
 * drawer — so without this every icon would fetch twice on first paint).
 */
const cache = new Map<string, Promise<object>>();
function loadAnimation(src: string): Promise<object> {
  let pending = cache.get(src);
  if (!pending) {
    pending = fetch(encodeURI(src)).then((r) => r.json());
    cache.set(src, pending);
  }
  return pending;
}

/**
 * A Lottie animation used in place of a static icon. Sits on its first frame
 * at rest, plays through once on hover, and — while `active` is true —
 * loops continuously no matter the hover state, so it keeps drawing
 * attention until whatever caused it clears (unread notifications, an
 * applied filter/sort, an incoming message).
 */
export function LottieIcon({
  src,
  size = 20,
  className,
  active = false,
}: {
  /** Path under /public, e.g. "/icons/Dashboard.json". */
  src: string;
  size?: number;
  className?: string;
  active?: boolean;
}) {
  const [data, setData] = useState<object | null>(null);
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    let cancelled = false;
    loadAnimation(src).then((json) => {
      if (!cancelled) setData(json);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // `active` toggling is the only thing that should move playback on its
  // own — hover is handled entirely by the mouse handlers below.
  useEffect(() => {
    const instance = lottieRef.current;
    if (!instance || !data) return;
    if (active) instance.play();
    else instance.goToAndStop(0);
  }, [active, data]);

  if (!data) {
    return <span aria-hidden style={{ width: size, height: size, display: "inline-block" }} className={className} />;
  }

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, display: "inline-flex" }}
      className={className}
      onMouseEnter={() => {
        if (active) return; // already looping — hover shouldn't interrupt it
        lottieRef.current?.goToAndPlay(0, true);
      }}
      onMouseLeave={() => {
        if (active) return;
        lottieRef.current?.goToAndStop(0);
      }}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={data}
        autoplay={false}
        loop={active}
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}

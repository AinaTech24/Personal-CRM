"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

/**
 * Loaded only when this page is reached, and only in the browser: three.js is
 * a large dependency and a WebGL scene has nothing to render on the server.
 */
const NotFoundScene = dynamic(() => import("@/components/not-found-scene").then((m) => m.NotFoundScene), {
  ssr: false,
});

/**
 * Custom 404.
 *
 * The SVG shows immediately and keeps showing until the WebGL scene is both
 * loaded and confirmed working — so a slow connection, a blocked GPU or a
 * browser without WebGL still gets a finished-looking page rather than a gap
 * where an illustration should be. The SVG animates on SMIL alone, so it costs
 * no JavaScript.
 */
export default function NotFound() {
  const [webglReady, setWebglReady] = useState(false);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="relative flex h-[260px] w-full max-w-[420px] items-center justify-center">
        {!webglReady && (
          <svg
            width="320"
            height="200"
            viewBox="0 0 320 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
            className="absolute"
          >
            {/* soft orbit ring behind the 0 */}
            <g transform="translate(160 100)">
              <circle
                r="54"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeWidth="2"
                strokeDasharray="4 8"
                className="text-foreground"
              >
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite" />
              </circle>
              <g>
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />
                <circle cx="54" cy="0" r="5" className="fill-primary" />
              </g>
            </g>

            <g className="fill-foreground" fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontWeight="800" fontSize="120">
              <text x="70" y="140" textAnchor="middle">
                4
                <animateTransform attributeName="transform" type="translate" values="0 0; 0 -8; 0 0" dur="3s" repeatCount="indefinite" />
              </text>
              <text x="250" y="140" textAnchor="middle">
                4
                <animateTransform attributeName="transform" type="translate" values="0 0; 0 -8; 0 0" dur="3s" begin="1.5s" repeatCount="indefinite" />
              </text>
            </g>

            <g transform="translate(160 100)">
              <animateTransform attributeName="transform" type="translate" values="160 100; 160 108; 160 100" dur="4s" repeatCount="indefinite" additive="sum" />
              <circle r="34" className="fill-primary/15 stroke-primary" strokeWidth="6" fill="none" />
              <circle cx="-12" cy="-8" r="4" className="fill-primary" fillOpacity="0.5" />
              <circle cx="10" cy="6" r="6" className="fill-primary" fillOpacity="0.35" />
            </g>
          </svg>
        )}

        <NotFoundScene onReady={setWebglReady} />

        {/* The numerals sit over the scene rather than inside it — text drawn
            in WebGL would need a font atlas and wouldn't be selectable. */}
        {webglReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2">
            <span className="text-7xl font-extrabold text-foreground/90 drop-shadow-sm">4</span>
            <span className="text-7xl font-extrabold text-foreground/90 drop-shadow-sm">4</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Lost in space</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you&apos;re looking for drifted off — it may have been moved, renamed, or never existed.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

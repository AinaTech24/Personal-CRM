import Link from "next/link";

/** Custom 404 with a self-animating SVG (SMIL — no JS, works in a server component). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <svg width="320" height="200" viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        {/* soft orbit ring behind the 0 */}
        <g transform="translate(160 100)">
          <circle r="54" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="2" strokeDasharray="4 8" className="text-foreground">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite" />
          </circle>
          {/* orbiting satellite dot */}
          <g>
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />
            <circle cx="54" cy="0" r="5" className="fill-primary" />
          </g>
        </g>

        {/* the "4 0 4" */}
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

        {/* the middle 0 as a little planet */}
        <g transform="translate(160 100)">
          <animateTransform attributeName="transform" type="translate" values="160 100; 160 108; 160 100" dur="4s" repeatCount="indefinite" additive="sum" />
          <circle r="34" className="fill-primary/15 stroke-primary" strokeWidth="6" fill="none" />
          <circle cx="-12" cy="-8" r="4" className="fill-primary" fillOpacity="0.5" />
          <circle cx="10" cy="6" r="6" className="fill-primary" fillOpacity="0.35" />
        </g>
      </svg>

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

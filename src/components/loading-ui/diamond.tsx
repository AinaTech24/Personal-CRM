/**
 * An 8-bit diamond loader: eight square pixels arranged in a ring, each
 * fading in on its own offset (keyframes in globals.css). Adapted from
 * https://www.loading-ui.com/docs/components/diamond — sized via `size-*`
 * and colored via `currentColor`/`text-*`, same as that component.
 */
function Diamond(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" role="status" aria-label="Loading" {...props}>
      {/* Top */}
      <rect className="diamond-pixel-1" x="8" y="0" width="4" height="4" />
      {/* Top Right */}
      <rect className="diamond-pixel-2" x="12" y="4" width="4" height="4" />
      {/* Right */}
      <rect className="diamond-pixel-3" x="16" y="8" width="4" height="4" />
      {/* Bottom Right */}
      <rect className="diamond-pixel-4" x="12" y="12" width="4" height="4" />
      {/* Bottom */}
      <rect className="diamond-pixel-5" x="8" y="16" width="4" height="4" />
      {/* Bottom Left */}
      <rect className="diamond-pixel-6" x="4" y="12" width="4" height="4" />
      {/* Left */}
      <rect className="diamond-pixel-7" x="0" y="8" width="4" height="4" />
      {/* Top Left */}
      <rect className="diamond-pixel-8" x="4" y="4" width="4" height="4" />
    </svg>
  );
}

export { Diamond };

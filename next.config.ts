import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server accept requests proxied in from another device on the
  // LAN (e.g. via nginx at http://<lan-ip>:8080) — without this, Next blocks
  // dev-only asset/RSC requests whose Origin isn't localhost, which silently
  // breaks hydration/styling for anyone testing from a different machine.
  allowedDevOrigins: ["192.168.29.249"],
  experimental: {
    // src/proxy.ts buffers every matched request body in memory up to this
    // limit — anything over it is silently truncated rather than rejected.
    // The default (10MB) is too small for the Website Onboarding Form's
    // several image uploads in one JSON submission (up to ~30MB of raw
    // attachment bytes, larger again once base64-encoded); raised just
    // enough to cover that with headroom.
    proxyClientMaxBodySize: "45mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Voice notes need the microphone on our own origin. Stated explicitly
          // so a hardening default — or a reverse proxy that sets
          // `Permissions-Policy: microphone=()` — can't silently disable recording.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
          // Baseline hardening for everything except the Forms embed path below
          // (which overrides frame-ancestors for its own, narrower allowlist —
          // header overriding is per-key, so these other keys still apply there
          // too). Nothing here was set anywhere before, so the whole app was
          // framable by any site and shipped no sniffing/referrer protection.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // The public Forms pages are meant to be embedded on other AinaTech
        // sites and their Vercel previews — explicitly allow framing them
        // there, overriding the stricter frame-ancestors above for just this
        // path (header overriding: the last matching rule for a given key wins).
        source: "/f/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://ainatech.in https://*.ainatech.in https://*.vercel.app;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

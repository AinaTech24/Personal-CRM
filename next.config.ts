import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server accept requests proxied in from another device on the
  // LAN (e.g. via nginx at http://<lan-ip>:8080) — without this, Next blocks
  // dev-only asset/RSC requests whose Origin isn't localhost, which silently
  // breaks hydration/styling for anyone testing from a different machine.
  allowedDevOrigins: ["192.168.29.249"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Voice notes need the microphone on our own origin. Stated explicitly
          // so a hardening default — or a reverse proxy that sets
          // `Permissions-Policy: microphone=()` — can't silently disable recording.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

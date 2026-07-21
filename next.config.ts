import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

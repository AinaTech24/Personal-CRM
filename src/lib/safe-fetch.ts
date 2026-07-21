import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Guards against SSRF when fetching a URL a user pasted.
 *
 * Without this, anyone who can send a chat message could make the server fetch
 * http://169.254.169.254/ (cloud metadata) or http://127.0.0.1:3306 and infer
 * things from the result. Every hostname is resolved and checked against
 * private ranges before we connect, and redirects are followed manually so a
 * public URL can't bounce us somewhere internal.
 */

function ipv4IsPrivate(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function ipv6IsPrivate(ip: string) {
  const addr = ip.toLowerCase().split("%")[0]; // drop any zone index
  if (addr === "::1" || addr === "::") return true;
  // IPv4-mapped (::ffff:127.0.0.1) must be judged on the embedded address.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  if (/^f[cd]/.test(addr)) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
  if (/^ff/.test(addr)) return true; // multicast
  return false;
}

export function isPrivateAddress(ip: string) {
  const version = net.isIP(ip);
  if (version === 4) return ipv4IsPrivate(ip);
  if (version === 6) return ipv6IsPrivate(ip);
  return true; // not an IP we understand — refuse
}

/** Rejects a URL that isn't plain http(s) or resolves somewhere internal. */
export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https are supported");
  }
  // A literal IP needs no DNS, but still needs checking.
  if (net.isIP(url.hostname) && isPrivateAddress(url.hostname)) {
    throw new Error("Refusing to fetch a private address");
  }
  const results = await lookup(url.hostname, { all: true }).catch(() => {
    throw new Error("Could not resolve host");
  });
  if (results.length === 0) throw new Error("Could not resolve host");
  // Every A/AAAA record must be public: one private answer is enough to abuse.
  for (const r of results) {
    if (isPrivateAddress(r.address)) throw new Error("Refusing to fetch a private address");
  }
  return url;
}

/**
 * Fetch that validates every hop and never reads more than `maxBytes`.
 *
 * Redirects are manual because the built-in follower would happily land on an
 * internal host after a public first hop.
 */
export async function safeFetchHtml(raw: string, { maxBytes = 512 * 1024, timeoutMs = 6000, maxRedirects = 3 } = {}) {
  let current = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Identifying ourselves honestly; many sites serve OG tags only to
          // agents that look like a crawler or a browser.
          "User-Agent": "AinaCRM-LinkPreview/1.0 (+link unfurling for internal chat)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error("Redirect without a location");
        current = new URL(location, url).toString();
        continue;
      }
      if (!res.ok) throw new Error(`Upstream returned ${res.status}`);

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("html")) throw new Error("Not an HTML page");

      // Stream and stop at the cap rather than trusting content-length, which
      // a hostile or misconfigured server can understate.
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty response");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          chunks.push(value);
          if (total >= maxBytes) {
            await reader.cancel().catch(() => {});
            break;
          }
        }
      }
      const buf = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        buf.set(c.subarray(0, Math.min(c.length, total - offset)), offset);
        offset += c.length;
        if (offset >= total) break;
      }
      return { html: new TextDecoder("utf-8").decode(buf), finalUrl: url.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many redirects");
}

/**
 * Fetches a favicon for a stored link via Google's public favicon service —
 * deliberately never the target link itself. That service (and only that
 * service) is what this app makes an outbound request to, so an entry's
 * arbitrary user-supplied `link` never causes this server to fetch content
 * from a host the user chose (no SSRF surface), unlike a "fetch /favicon.ico
 * from the link's own origin" approach would have.
 */
export async function fetchFaviconDataUrl(link: string): Promise<string | null> {
  let hostname: string;
  try {
    hostname = new URL(link).hostname;
  } catch {
    return null;
  }
  if (!hostname) return null;

  try {
    const res = await fetch(`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 200_000) return null;

    const contentType = res.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    // Best-effort only — a broken/unreachable favicon never blocks saving the entry.
    return null;
  }
}

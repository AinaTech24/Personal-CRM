import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchLinkPreview, type LinkPreviewData } from "@/lib/link-preview";

/**
 * Unfurls a link pasted into chat: title, description and image from its
 * OpenGraph tags.
 *
 * Fetched server-side because the browser can't read a cross-origin page, and
 * because it keeps every member's IP away from whatever was linked.
 */

// Previews change rarely and a busy chat re-requests the same link constantly.
// A plain Map is enough: one process, small entries.
const cache = new Map<string, { at: number; value: LinkPreviewData | null }>();
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: LinkPreviewData | null) {
  if (cache.size >= MAX_ENTRIES) {
    // Map preserves insertion order, so the first key is the oldest.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = req.nextUrl.searchParams.get("url");
  if (!target) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const cached = cacheGet(target);
  if (cached !== undefined) return NextResponse.json({ preview: cached, cached: true });

  // Failures come back as null rather than an error: the reason (blocked,
  // unreachable, not HTML) would otherwise let a member probe what exists
  // inside the network.
  const preview = await fetchLinkPreview(target);
  cacheSet(target, preview);
  return NextResponse.json({ preview });
}

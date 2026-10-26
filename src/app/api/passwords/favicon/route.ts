import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isUngrantedModuleHidden } from "@/lib/module-permissions-store";
import { fetchFaviconDataUrl } from "@/lib/favicon";

/**
 * Live favicon preview for the Add/Edit Source dialog, while a link is still
 * being typed (an already-saved, unchanged entry instead reuses its own
 * cached `faviconDataUrl` — see password-manager-view.tsx). Proxied through
 * the server rather than having the browser call Google's favicon service
 * directly, so a saved credential's host is never sent from the viewer's own
 * browser/IP — matches fetchFaviconDataUrl's own stated intent that this
 * app's server is the only thing that ever talks to that service.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isUngrantedModuleHidden(user, "passwords")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const host = req.nextUrl.searchParams.get("host")?.trim();
  if (!host || host.length > 253) return NextResponse.json({ faviconDataUrl: null });

  const faviconDataUrl = await fetchFaviconDataUrl(`https://${host}`);
  return NextResponse.json({ faviconDataUrl });
}

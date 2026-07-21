import { safeFetchHtml } from "@/lib/safe-fetch";

/**
 * OpenGraph unfurling. Separate from the route because a route file may only
 * export HTTP handlers, which would leave this untestable on its own.
 */

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

export function decodeEntities(s: string) {
  return s
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (m, e) => ENTITIES[e] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Every <meta> as key→content, tolerating either attribute order. */
export function parseMeta(html: string) {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    // First wins: pages sometimes repeat a tag, and the head copy is the one meant.
    if (key && content && !meta[key.toLowerCase()]) meta[key.toLowerCase()] = decodeEntities(content.trim());
  }
  return meta;
}

function clamp(s: string | undefined, max: number) {
  const t = s?.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Builds a preview from a page's HTML. Returns null when nothing is worth showing. */
export function previewFromHtml(html: string, finalUrl: string): LinkPreviewData | null {
  const meta = parseMeta(html);
  const htmlTitle = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");

  const rawImage = meta["og:image"] || meta["twitter:image"] || meta["twitter:image:src"];
  let image: string | undefined;
  if (rawImage) {
    try {
      // OG images are often root-relative; resolve against the page we landed on.
      const resolved = new URL(rawImage, finalUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") image = resolved.toString();
    } catch {
      // A malformed image URL shouldn't cost us the rest of the preview.
    }
  }

  const preview: LinkPreviewData = {
    url: finalUrl,
    title: clamp(meta["og:title"] || meta["twitter:title"] || htmlTitle, 120),
    description: clamp(meta["og:description"] || meta["twitter:description"] || meta.description, 200),
    image,
    siteName: clamp(meta["og:site_name"], 60),
  };

  return preview.title || preview.description || preview.image ? preview : null;
}

/** Fetches and unfurls. Any failure — blocked, unreachable, not HTML — is null. */
export async function fetchLinkPreview(target: string): Promise<LinkPreviewData | null> {
  try {
    const { html, finalUrl } = await safeFetchHtml(target);
    return previewFromHtml(html, finalUrl);
  } catch {
    return null;
  }
}

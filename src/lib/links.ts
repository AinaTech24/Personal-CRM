/**
 * URL detection for chat messages. Pure and dependency-free so the message
 * bubble (client) and the preview endpoint (server) agree on what a link is.
 */

// Deliberately conservative: an explicit scheme, or a bare www. host. Matching
// every "example.com" would turn ordinary sentences ("ends in 3.5s") into links.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/** Characters that usually end a sentence rather than a URL. */
const TRAILING = new Set([".", ",", "!", "?", ";", ":", "'", '"', "”", "’", "»"]);

/**
 * Trims punctuation that belongs to the sentence, not the link.
 *
 * Brackets are balance-aware: a trailing ")" is kept when the URL opened one
 * (Wikipedia's `(disambiguation)` style) and dropped when it didn't, as in
 * "see (https://example.com)".
 */
export function trimUrlPunctuation(raw: string) {
  let url = raw;
  while (url.length > 1) {
    const last = url[url.length - 1];
    if (TRAILING.has(last)) {
      url = url.slice(0, -1);
      continue;
    }
    if (last === ")" || last === "]" || last === "}") {
      const open = last === ")" ? "(" : last === "]" ? "[" : "{";
      const opens = url.split(open).length - 1;
      const closes = url.split(last).length - 1;
      if (closes > opens) {
        url = url.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return url;
}

/** The href to actually navigate to (bare `www.` hosts need a scheme). */
export function normalizeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Every URL in the text, in order, de-duplicated, punctuation trimmed. */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE);
  if (!found) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const url = trimUrlPunctuation(raw);
    const href = normalizeUrl(url);
    if (!seen.has(href)) {
      seen.add(href);
      out.push(href);
    }
  }
  return out;
}

export type Token = { type: "text" | "url"; value: string; href?: string };

/**
 * Splits text into plain and link runs for rendering. Used instead of a regex
 * replace so the bubble can keep rendering React nodes rather than raw HTML.
 */
export function tokenizeLinks(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  // Fresh regex each call: URL_RE is global and carries lastIndex between uses.
  const re = new RegExp(URL_RE.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const trimmed = trimUrlPunctuation(match[0]);
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    tokens.push({ type: "url", value: trimmed, href: normalizeUrl(trimmed) });
    lastIndex = match.index + trimmed.length;
    // Punctuation we trimmed is still text and must not be swallowed.
    re.lastIndex = lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ type: "text", value: text.slice(lastIndex) });
  return tokens;
}

/** Shortens a URL for display: host plus a hint of the path. */
export function displayUrl(href: string, max = 48) {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    const full = host + rest;
    return full.length > max ? `${full.slice(0, max - 1)}…` : full;
  } catch {
    return href;
  }
}

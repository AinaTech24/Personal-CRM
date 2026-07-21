"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated emoji from Google's Noto Emoji Animation set
 * (https://googlefonts.github.io/noto-emoji-animation/).
 *
 * Each emoji maps to /{codepoints}/512.webp, where codepoints are the lowercase
 * hex values of the sequence joined by "_". Anything the set doesn't cover (or
 * a blocked/offline CDN) silently falls back to the plain text emoji, so chat
 * never renders an empty box.
 */

const CDN = "https://fonts.gstatic.com/s/e/notoemoji/latest";

const VARIATION = "(?:\\uFE0F|\\uFE0E)?";
const PICTO = "\\p{Extended_Pictographic}";

/** Matches one emoji, including ZWJ sequences and variation selectors. */
export const EMOJI_RE = new RegExp(`(${PICTO}${VARIATION}(?:\\u200D${PICTO}${VARIATION})*)`, "gu");

const emojiRe = () => new RegExp(EMOJI_RE.source, "gu");

export function emojiCodepoints(emoji: string) {
  return [...emoji].map((c) => c.codePointAt(0)!.toString(16)).join("_");
}

/** Animated (WebP) — plays as soon as it's rendered. */
export function animatedEmojiUrl(emoji: string) {
  return `${CDN}/${emojiCodepoints(emoji)}/512.webp`;
}

/** Still frame (PNG) — same Noto artwork, no animation cost. */
export function staticEmojiUrl(emoji: string) {
  return `${CDN}/${emojiCodepoints(emoji)}/512.png`;
}

/** True when the text is nothing but emoji (and whitespace). */
export function isEmojiOnly(text: string) {
  const t = text.trim();
  if (!t) return false;
  return t.replace(emojiRe(), "").trim().length === 0;
}

export function countEmoji(text: string) {
  return text.match(emojiRe())?.length ?? 0;
}

export function AnimatedEmoji({
  emoji,
  className,
  sizePx,
  playOnHover = false,
  lazy = false,
}: {
  emoji: string;
  className?: string;
  /** Explicit box size; keeps the still frame the same size as the animation. */
  sizePx?: number;
  /** Show the still frame until hovered — a grid of animations is expensive. */
  playOnHover?: boolean;
  /** For long scrolling grids, only fetch what comes into view. */
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cls = className ?? "h-5 w-5";
  const boxStyle = sizePx ? { width: sizePx, height: sizePx } : undefined;
  const hoverHandlers = playOnHover
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  // Last resort only: the CDN is unreachable or the set lacks this emoji.
  if (failed) {
    return (
      <span
        {...hoverHandlers}
        role="img"
        aria-label={emoji}
        style={{ ...boxStyle, fontSize: sizePx ? sizePx * 0.88 : undefined, lineHeight: 1 }}
        className={cn("inline-flex select-none items-center justify-center", !sizePx && cls)}
      >
        {emoji}
      </span>
    );
  }

  // Same Noto artwork throughout — the still frame at rest, animating on hover.
  const src = !playOnHover || hovered ? animatedEmojiUrl(emoji) : staticEmojiUrl(emoji);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...hoverHandlers}
      src={src}
      alt={emoji}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      style={boxStyle}
      className={cn("inline-block select-none align-[-0.2em] object-contain", !sizePx && cls)}
    />
  );
}

/**
 * Renders text with every emoji swapped for its animated version. `emojiClass`
 * sizes those images — pass something larger for emoji-only messages.
 */
export function TextWithAnimatedEmoji({
  text,
  emojiClass,
  renderText,
}: {
  text: string;
  emojiClass?: string;
  renderText?: (chunk: string, key: number) => ReactNode;
}) {
  const parts = text.split(emojiRe());
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        // split() with a capturing group puts the emoji at odd indices.
        if (i % 2 === 1) return <AnimatedEmoji key={i} emoji={part} className={emojiClass} />;
        return renderText ? renderText(part, i) : <span key={i}>{part}</span>;
      })}
    </>
  );
}

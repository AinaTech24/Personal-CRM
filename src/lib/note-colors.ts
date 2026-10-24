import type { NoteColor } from "@/generated/prisma/enums";

export type { NoteColor };

interface NoteColorMeta {
  key: NoteColor;
  label: string;
  /** Card background + border. */
  card: string;
  /** Solid dot shown in the color picker and as the pinned-floating-note accent. */
  swatch: string;
}

/** Fixed, named palette — never an arbitrary user-entered color. Order here is the order shown in the picker. */
export const NOTE_COLORS: NoteColorMeta[] = [
  { key: "WHITE", label: "Neutral", card: "bg-card border-border", swatch: "bg-muted-foreground/40" },
  { key: "PINK", label: "Pink", card: "bg-pink-500/10 border-pink-500/25", swatch: "bg-pink-400" },
  { key: "BLUE", label: "Blue", card: "bg-blue-500/10 border-blue-500/25", swatch: "bg-blue-400" },
  { key: "GREEN", label: "Green", card: "bg-emerald-500/10 border-emerald-500/25", swatch: "bg-emerald-400" },
  { key: "YELLOW", label: "Yellow", card: "bg-amber-500/10 border-amber-500/25", swatch: "bg-amber-400" },
  { key: "LAVENDER", label: "Lavender", card: "bg-violet-500/10 border-violet-500/25", swatch: "bg-violet-400" },
  { key: "PEACH", label: "Peach", card: "bg-orange-500/10 border-orange-500/25", swatch: "bg-orange-400" },
  { key: "GRAY", label: "Gray", card: "bg-gray-500/15 border-gray-500/30", swatch: "bg-gray-400" },
];

const BY_KEY = new Map(NOTE_COLORS.map((c) => [c.key, c]));

export function noteColorMeta(color: NoteColor): NoteColorMeta {
  return BY_KEY.get(color) ?? NOTE_COLORS[0];
}

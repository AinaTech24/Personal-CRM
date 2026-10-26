/**
 * A note's color is a free-form hex string the user picks with a real color
 * picker (not a fixed named palette) — null/"" means "use the normal theme
 * card background" rather than a specific color. These are just a handful
 * of quick-pick suggestions shown next to the picker for convenience; any
 * other color is equally valid and stored exactly as chosen.
 */
export const NOTE_COLOR_PRESETS: string[] = [
  "#fecdd3", // pink
  "#bfdbfe", // blue
  "#bbf7d0", // green
  "#fef08a", // yellow
  "#ddd6fe", // lavender
  "#fed7aa", // peach
  "#e5e7eb", // gray
];

/** Relative-luminance based pick of black or white text, so arbitrary user-picked backgrounds stay readable. */
export function contrastTextColor(hex: string): "#000000" | "#ffffff" {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#000000";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.55 ? "#000000" : "#ffffff";
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** A darker, more saturated version of a color — used for the "washi tape" accent and the content sub-panel, so they read as a deliberate shade of the same hue rather than a separate color. */
export function shade(hex: string, lightnessDelta: number, saturationDelta = 0): string {
  const [h, s, l] = hexToHsl(hex);
  const nextS = Math.min(1, Math.max(0, s + saturationDelta));
  const nextL = Math.min(1, Math.max(0, l + lightnessDelta));
  return hslToHex(h, nextS, nextL);
}

/** A stable (not re-randomized per render) small rotation for the "hand-placed sticky note" look, derived from the note's own id. */
export function rotationFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  // -3.5deg..3.5deg, skewed away from dead-zero so every note visibly tilts.
  const normalized = ((hash % 1000) + 1000) % 1000 / 1000; // 0..1
  return normalized * 7 - 3.5;
}

/** A small rotating set of tape colors for notes with no custom color of their own. */
const DEFAULT_TAPE_COLORS = ["#fca5a5", "#86efac", "#fde047", "#93c5fd", "#c4b5fd"];
export function tapeColorFor(id: string, noteColor: string | null): string {
  if (noteColor) return shade(noteColor, -0.18, 0.15);
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return DEFAULT_TAPE_COLORS[Math.abs(hash) % DEFAULT_TAPE_COLORS.length];
}

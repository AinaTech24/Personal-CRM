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

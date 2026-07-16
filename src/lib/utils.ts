import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats a number as Indian Rupees, e.g. 12500 → ₹12,500.00. */
export function formatMoney(value: number) {
  return INR.format(Number.isFinite(value) ? value : 0);
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? `-${ONES[o]}` : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** Converts a whole number to words using the Indian numbering system (lakh, crore). */
function integerToWords(num: number): string {
  if (num === 0) return "Zero";
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}

/**
 * Renders an amount as words in Indian Rupees, e.g.
 * 71532.10 → "Indian Rupee Seventy-One Thousand Five Hundred Thirty-Two and Ten Paise Only".
 */
export function amountToWords(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);

  let out = `Indian Rupee ${integerToWords(rupees)}`;
  if (paise > 0) out += ` and ${twoDigits(paise)} Paise`;
  return `${out} Only`;
}

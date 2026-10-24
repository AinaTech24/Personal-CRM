/** Display formatting for Command Centre values (client-safe: no catalog import). */
import type { FieldMeta, Labels } from "./ui-types";

const IST: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" };

export function humanize(v: string) {
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatValue(f: FieldMeta, v: unknown, labels?: Labels): string {
  if (v === null || v === undefined || v === "") return "—";
  if (f.options) return f.options.find((o) => o.value === v)?.label ?? humanize(String(v));
  if (f.lookup && typeof v === "string") return labels?.[f.column]?.[v] ?? "—";
  switch (f.kind) {
    case "bool":
      return v ? "Yes" : "No";
    case "date":
      return new Date(`${v as string}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    case "datetime":
      return new Date(v as string).toLocaleString("en-IN", { ...IST, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    case "decimal": {
      const n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: f.scale ?? 2 }) : String(v);
    }
    case "json":
      return JSON.stringify(v);
    default:
      return String(v);
  }
}

/** Tailwind classes for a status-ish value, by rough meaning. */
export function statusTone(value: unknown): "success" | "warning" | "destructive" | "secondary" | "default" {
  const v = String(value ?? "");
  if (/^(active|won|approved|published|accepted|verified|validated|completed|resolved|closed|paid|clean|granted|minutes_approved|operational|acknowledged|converted|sent)$/.test(v)) return "success";
  if (/^(blocked|lost|rejected|terminated|failed|quarantined|critical|overdue|cancelled|disputed|do_not_engage|not_realized|withdrawn)$/.test(v)) return "destructive";
  if (/^(draft|new|pending|requested|identified|planned|scheduled|not_started|prospect|hypothesis|unverified)$/.test(v)) return "secondary";
  if (/^(high|under_review|submitted|submitted_for_review|verification|in_progress|reopened|part_paid|pending_approval|validating|in_remediation)$/.test(v)) return "warning";
  return "default";
}

/** Value for an <input> of this field kind. */
export function inputValue(f: FieldMeta, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (f.kind === "datetime") {
    const d = new Date(v as string);
    if (Number.isNaN(d.getTime())) return "";
    // datetime-local in IST
    const ist = new Date(d.getTime() + 330 * 60_000);
    return ist.toISOString().slice(0, 16);
  }
  if (f.kind === "json") return JSON.stringify(v, null, 2);
  return String(v);
}

/** Parses an <input> value back to the API value for this field kind. */
export function parseInput(f: FieldMeta, raw: string | boolean): unknown {
  if (f.kind === "bool") return !!raw;
  const s = String(raw);
  if (s.trim() === "") return null;
  switch (f.kind) {
    case "int":
    case "bigint":
      return Number(s);
    case "datetime":
      return new Date(`${s}:00+05:30`).toISOString();
    case "json":
      return JSON.parse(s);
    default:
      return s;
  }
}

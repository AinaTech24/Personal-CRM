/** Wraps a value for CSV: quotes it and escapes embedded quotes. Guards against formula injection. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  // A leading =/+/-/@ makes spreadsheets execute the cell as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** One CSV row from cell values. */
export function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map(csvCell).join(",");
}

/** Joins rows with a BOM prefix so Excel reads the file as UTF-8. */
export function toCsv(lines: string[]): string {
  return "﻿" + lines.join("\r\n");
}

/** A CSV NextResponse with the standard download headers. */
export function csvResponse(lines: string[], filename: string) {
  return new Response(toCsv(lines), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

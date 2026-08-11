"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, useDialogState } from "@/components/ui/dialog";
import { SkeletonForm } from "@/components/ui/skeleton";
import { IconDownload, IconEye } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { htmlToPdf } from "@/lib/html-to-pdf";
import {
  MONTH_NAMES,
  CALENDAR_CONTENT_TYPE_LABELS,
  CALENDAR_STATUS_LABELS,
  calendarDaysForMonth,
  type CalendarSlot,
  type CalendarSlotStatus,
} from "@/lib/social-calendar";

interface MonthEntry {
  year: number;
  month: number;
  count: number;
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STATUS_COLOR: Record<CalendarSlotStatus, string> = {
  DONE: "#16a34a",
  PENDING: "#d97706",
  NOT_UPLOADED: "#dc2626",
};

/** One row per real calendar day of the month — date, weekday, type, number/note, status — for a printable audit trail. */
function buildContentReportHtml(clientName: string, year: number, month: number, slots: CalendarSlot[]) {
  const days = calendarDaysForMonth(year, month, slots);

  const rows = days
    .map(({ date, slot }) => {
      const type = slot?.contentType ? CALENDAR_CONTENT_TYPE_LABELS[slot.contentType] : slot?.note ? "Note" : "—";
      const number = slot?.contentType ? String(slot.manualNumber ?? "Auto") : slot?.note ? esc(slot.note) : "—";
      const status = slot ? CALENDAR_STATUS_LABELS[slot.status] : "—";
      const color = slot ? STATUS_COLOR[slot.status] : "#8a8a8a";
      return `
      <tr>
        <td>${format(date, "dd MMM yyyy")}</td>
        <td>${format(date, "EEEE")}</td>
        <td>${esc(type)}</td>
        <td>${number}</td>
        <td><span class="status" style="color:${color}">${esc(status)}</span></td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(clientName)} — ${esc(MONTH_NAMES[month - 1])} ${year} Content Report</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #2b2b2b; font-size: 12px; margin: 0; background: #fff; padding: 14mm; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .co-name { font-weight: 700; font-size: 15px; }
  .sub { color: #555; margin-top: 3px; }
  .meta { text-align: right; color: #777; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #3c3c3c; color: #fff; font-weight: 600; padding: 8px; text-align: left; font-size: 11px; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #e6e6e6; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .status { font-weight: 600; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="co-name">${esc(clientName)}</div>
      <div class="sub">Content Calendar Report — ${esc(MONTH_NAMES[month - 1])} ${year}</div>
    </div>
    <div class="meta">Generated ${esc(format(new Date(), "dd MMM yyyy, h:mm a"))}</div>
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>Day</th><th>Type</th><th>Number / Note</th><th>Status</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function reportFilename(clientName: string, year: number, month: number) {
  return `${clientName} - ${MONTH_NAMES[month - 1]} ${year} Content Report.pdf`;
}

export function ContentReportsTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const toast = useToast();
  const [months, setMonths] = useState<MonthEntry[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);
  // Tracks the live blob: URL outside React state so it's reliably revoked even
  // across rapid View clicks, not just on close — state alone would leak one
  // blob per click if the user views several months without closing the dialog.
  const activeBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    fetch(`/api/social/calendar/months?clientId=${clientId}`)
      .then((r) => r.json())
      .then((d) => setMonths(d.months ?? []))
      .catch(() => setMonths([]));
  }, [clientId]);

  useEffect(() => {
    return () => {
      if (activeBlobUrl.current) URL.revokeObjectURL(activeBlobUrl.current);
    };
  }, []);

  async function loadSlots(year: number, month: number): Promise<CalendarSlot[]> {
    const res = await fetch(`/api/social/calendar?clientId=${clientId}&year=${year}&month=${month}`);
    if (!res.ok) throw new Error("Failed to load calendar data");
    const data = await res.json();
    return data.slots ?? [];
  }

  async function handleDownload(m: MonthEntry) {
    const key = `${m.year}-${m.month}-download`;
    setBusyKey(key);
    try {
      const slots = await loadSlots(m.year, m.month);
      const html = buildContentReportHtml(clientName, m.year, m.month, slots);
      const pdf = await htmlToPdf(html);
      pdf.save(reportFilename(clientName, m.year, m.month));
    } catch {
      toast.error("Couldn't generate the report");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleView(m: MonthEntry) {
    const key = `${m.year}-${m.month}-view`;
    setBusyKey(key);
    try {
      const slots = await loadSlots(m.year, m.month);
      const html = buildContentReportHtml(clientName, m.year, m.month, slots);
      const pdf = await htmlToPdf(html);
      const url = pdf.output("bloburl").toString();
      if (activeBlobUrl.current) URL.revokeObjectURL(activeBlobUrl.current);
      activeBlobUrl.current = url;
      setPreview({ title: `${MONTH_NAMES[m.month - 1]} ${m.year}`, url });
    } catch {
      toast.error("Couldn't generate the report");
    } finally {
      setBusyKey(null);
    }
  }

  function closePreview() {
    if (activeBlobUrl.current) {
      URL.revokeObjectURL(activeBlobUrl.current);
      activeBlobUrl.current = null;
    }
    setPreview(null);
  }

  // Keeps the iframe mounted (on its last-known content) while the dialog
  // plays its close animation — clearing `preview` straight to null unmounts
  // the iframe mid-close and the dialog just blinks shut instead of animating.
  const previewDialog = useDialogState(preview);

  return (
    <div className="flex flex-col gap-3">
      {months === null ? (
        <SkeletonForm fields={3} />
      ) : months.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No Content Calendar activity yet — a report appears here for every month that has planned content.
          </CardContent>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {months.map((m) => {
            const downloading = busyKey === `${m.year}-${m.month}-download`;
            const viewing = busyKey === `${m.year}-${m.month}-view`;
            const label = `${MONTH_NAMES[m.month - 1]} ${m.year}`;
            return (
              <div key={`${m.year}-${m.month}`} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.count} tracked {m.count === 1 ? "day" : "days"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip label="View">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`View ${label} report`}
                      disabled={viewing || downloading}
                      onClick={() => handleView(m)}
                    >
                      <IconEye className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <Tooltip label="Download">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Download ${label} report`}
                      disabled={viewing || downloading}
                      onClick={() => handleDownload(m)}
                    >
                      <IconDownload className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Dialog open={previewDialog.open} onOpenChange={(v) => !v && closePreview()}>
        <DialogContent size="lg" className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewDialog.value?.title} Content Report</DialogTitle>
          </DialogHeader>
          <DialogBody className="overflow-hidden p-0">
            {previewDialog.value && (
              // The fragment hash hides the browser PDF viewer's own toolbar/side
              // panel/scrollbar so only the document shows inside the dialog.
              <iframe
                src={`${previewDialog.value.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                title={`${previewDialog.value.title} report`}
                className="h-[80vh] w-full border-0 bg-white"
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

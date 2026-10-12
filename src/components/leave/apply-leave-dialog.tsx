"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/providers/toast-provider";
import { CATEGORY_OPTIONS, fmtDays, type LeaveRequestRow } from "@/components/leave/leave-shared";

export function ApplyLeaveDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState("CASUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const singleDay = startDate !== "" && startDate === endDate;
  const ready = startDate !== "" && endDate !== "" && endDate >= startDate && reason.trim() !== "";

  function reset() {
    setCategory("CASUAL");
    setStartDate("");
    setEndDate("");
    setIsHalfDay(false);
    setReason("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, startDate, endDate, isHalfDay: isHalfDay && singleDay, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't submit the request", data.error);
      const created = data.request as LeaveRequestRow;
      toast.success("Leave request sent", `${fmtDays(created.days)} day(s), waiting for approval.`);
      reset();
      onOpenChange(false);
      onApplied();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Apply for leave</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Leave type</Label>
              <Dropdown value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Start date</Label>
                <DatePicker
                  value={startDate}
                  clearable={false}
                  onChange={(v) => {
                    setStartDate(v);
                    // Keep the range valid: an end before the new start follows it.
                    if (!endDate || endDate < v) setEndDate(v);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End date</Label>
                <DatePicker value={endDate} clearable={false} onChange={setEndDate} />
              </div>
            </div>
            {startDate && endDate && endDate < startDate && (
              <p className="text-xs text-destructive">End date can&apos;t be before the start date.</p>
            )}
            {singleDay && (
              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={isHalfDay} onChange={setIsHalfDay} aria-label="Half day" />
                Half day only
              </label>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Reason</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Why do you need this leave?"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Duration counts working days only, so Sundays and holidays inside the range aren&apos;t deducted.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || saving}>
              {saving ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconPaperclip, IconX } from "@/components/icons";
import { fmtBytes } from "@/components/tasks/attachment-picker";
import { useToast } from "@/components/providers/toast-provider";
import { CATEGORY_OPTIONS, fmtAmount, type ExpenseRow } from "@/components/expenses/expense-shared";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export function SubmitExpenseDialog({
  open,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("TRAVEL");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const amountValue = Number(amount);
  const ready = expenseDate !== "" && amount.trim() !== "" && amountValue > 0 && description.trim() !== "";

  function reset() {
    setCategory("TRAVEL");
    setAmount("");
    setExpenseDate("");
    setDescription("");
    setReceipt(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickReceipt(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error("Receipt too large", `${fmtBytes(file.size)} exceeds the 10MB limit.`);
      return;
    }
    setReceipt(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("amount", amount);
      form.append("expenseDate", expenseDate);
      form.append("description", description);
      if (receipt) form.append("receipt", receipt);

      const res = await fetch("/api/expenses", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't submit the claim", data.error);
      const created = data.expense as ExpenseRow;
      toast.success("Expense claim sent", `${fmtAmount(created.amount)}, waiting for approval.`);
      reset();
      onOpenChange(false);
      onSubmitted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Submit an expense claim</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Dropdown value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Date</Label>
                <DatePicker value={expenseDate} clearable={false} onChange={setExpenseDate} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="What was this for?"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Receipt (optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,application/pdf"
                className="hidden"
                onChange={(e) => pickReceipt(e.target.files?.[0])}
              />
              {receipt ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <IconPaperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{receipt.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtBytes(receipt.size)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Remove receipt"
                    onClick={() => {
                      setReceipt(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-fit">
                  <IconPaperclip className="h-4 w-4" />
                  Attach receipt
                </Button>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || saving}>
              {saving ? "Submitting…" : "Submit claim"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { IconPaperclip, IconPencil, IconTrash } from "@/components/icons";
import {
  CATEGORY_OPTIONS,
  categoryDisplay,
  fmtAmount,
  fmtApplied,
  fmtExpenseDate,
  ExpenseStatusBadge,
  PERIOD_OPTIONS,
  periodWindow,
  type ExpenseRow,
} from "@/components/expenses/expense-shared";

const FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "PAID", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All claims" },
];

export function ExpensesAdminView({
  canEditDelete = true,
  teamScope,
}: {
  canEditDelete?: boolean;
  /** Narrows to exactly one team's own claims — the same "crm"/"social-media"/"team:<id>" values Leave/Leads/Tasks/Meetings/Projects already take. Omit for the unscoped admin/own-department/own-teams view at /admin/expenses. */
  teamScope?: "crm" | "social-media" | `team:${string}`;
}) {
  const toast = useToast();
  const { socket } = useSocket();
  const expensesUrl = teamScope ? `/api/expenses?scope=all&teamScope=${teamScope}` : "/api/expenses?scope=all";
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [filter, setFilter] = useState("PENDING");
  const [period, setPeriod] = useState("all-time");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [deciding, setDeciding] = useState<{ expense: ExpenseRow; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<ExpenseRow | null>(null);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [editCategory, setEditCategory] = useState("TRAVEL");
  const [editCategoryOther, setEditCategoryOther] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<ExpenseRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(expensesUrl);
    if (teamScope && res.status === 403) {
      setForbidden(true);
      return;
    }
    setForbidden(false);
    setExpenses(res.ok ? (await res.json()).expenses : []);
  }, [expensesUrl, teamScope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on("expense_request_changed", load);
    return () => {
      socket.off("expense_request_changed", load);
    };
  }, [socket, load]);

  const dateWindow = periodWindow(period, customFrom, customTo);
  const inPeriod = (expenses ?? []).filter((e) => !dateWindow || (e.expenseDate >= dateWindow.from && e.expenseDate <= dateWindow.to));

  const counts: Record<string, number> = { ALL: inPeriod.length };
  for (const e of inPeriod) counts[e.status] = (counts[e.status] ?? 0) + 1;

  const visible = inPeriod.filter((e) => filter === "ALL" || e.status === filter);

  async function decide() {
    if (!deciding) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/expenses/${deciding.expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: deciding.action, adminNote: note || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast.error("Couldn't save the decision", d.error);
      else toast.success(deciding.action === "approve" ? "Expense approved" : "Expense rejected", deciding.expense.user.name);
      setDeciding(null);
      setNote("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function confirmMarkPaid() {
    if (!markingPaid) return;
    const res = await fetch(`/api/expenses/${markingPaid.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markPaid" }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) toast.error("Couldn't mark as paid", d.error);
    else toast.success("Marked as paid", markingPaid.user.name);
    setMarkingPaid(null);
    load();
  }

  function openEdit(e: ExpenseRow) {
    setEditing(e);
    setEditCategory(e.category);
    setEditCategoryOther(e.categoryOther ?? "");
    setEditAmount(String(e.amount));
    setEditDate(e.expenseDate);
    setEditDescription(e.description);
  }

  const editIsOther = editCategory === "OTHER";
  const editAmountValue = Number(editAmount);
  const editReady =
    editDate !== "" &&
    editAmount.trim() !== "" &&
    editAmountValue > 0 &&
    editDescription.trim() !== "" &&
    (!editIsOther || editCategoryOther.trim() !== "");

  async function saveEdit() {
    if (!editing || !editReady) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/expenses/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          category: editCategory,
          categoryOther: editIsOther ? editCategoryOther.trim() : undefined,
          amount: editAmountValue,
          expenseDate: editDate,
          description: editDescription,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save changes", d.error);
      toast.success("Expense claim updated", editing.user.name);
      setEditing(null);
      load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDeleteExpense() {
    if (!deletingExpense) return;
    const res = await fetch(`/api/expenses/${deletingExpense.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) toast.error("Couldn't delete the claim", d.error);
    else toast.success("Expense claim deleted", deletingExpense.user.name);
    setDeletingExpense(null);
    load();
  }

  if (forbidden) {
    return (
      <Card className="flex flex-col items-center justify-center gap-1 py-16 text-center">
        <p className="text-sm font-medium">You don&apos;t have access to this team&apos;s Expense claims</p>
        <p className="text-sm text-muted-foreground">Ask your team lead or a company admin for access.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Expenses</h1>
          <HelpDialog title="Expenses — help">
            <HelpSection heading="What this page is for">
              <p>Review submitted reimbursement claims, approve or reject them, and mark an approved claim as paid once it&apos;s been reimbursed.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>See and decide on every claim across every department.</p>
            </HelpSection>
            <HelpSection heading="Department Admins & Permission grants">
              <p>See and decide on claims only where explicitly granted (Permissions → Expenses) — their own department by default, or every department if a company Admin turned on &quot;All departments&quot; for them.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown size="sm" value={period} onChange={setPeriod} className="w-40" options={PERIOD_OPTIONS} />
          {period === "custom" && (
            <>
              <DatePicker value={customFrom} clearable={false} onChange={setCustomFrom} />
              <span className="text-xs text-muted-foreground">to</span>
              <DatePicker value={customTo} clearable={false} onChange={setCustomTo} />
            </>
          )}
          <Dropdown
            size="sm"
            value={filter}
            onChange={setFilter}
            className="w-48"
            options={FILTERS.map((f) => ({ ...f, label: `${f.label} (${counts[f.value] ?? 0})` }))}
          />
        </div>
      </div>

      {!expenses ? (
        <SkeletonTable rows={5} columns={7} />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {filter === "PENDING" ? "No expense claims are waiting for you." : "Nothing to show here."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {["Employee", "Submitted", "Date", "Category", "Amount", "Description", "Status", ""].map((h, i) => (
                      <th key={i} className={`px-4 py-2.5 font-medium ${h === "Amount" ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 align-top last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={e.user.name} avatarDataUrl={e.user.avatarDataUrl} className="h-7 w-7 text-xs" />
                          <div className="min-w-0">
                            <p className="whitespace-nowrap font-medium">{e.user.name}</p>
                            {e.user.department && <p className="text-xs text-muted-foreground">{e.user.department}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{fmtApplied(e.appliedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{fmtExpenseDate(e.expenseDate)}</td>
                      <td className="px-4 py-3">{categoryDisplay(e)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtAmount(e.amount)}</td>
                      <td className="max-w-64 px-4 py-3">
                        <p className="line-clamp-2 break-words" title={e.description}>
                          {e.description}
                        </p>
                        {e.receiptFilePath && (
                          <a
                            href={`/api/uploads/${e.receiptFilePath}?mode=view`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <IconPaperclip className="h-3 w-3" />
                            {e.receiptFileName ?? "Receipt"}
                          </a>
                        )}
                        {e.adminNote && <p className="mt-1 text-xs text-muted-foreground">Note: {e.adminNote}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <ExpenseStatusBadge status={e.status} />
                        {e.decidedByName && (e.status === "APPROVED" || e.status === "REJECTED") && (
                          <p className="mt-0.5 text-xs text-muted-foreground">by {e.decidedByName}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {e.status === "PENDING" && (
                            <>
                              <Button type="button" size="sm" onClick={() => setDeciding({ expense: e, action: "approve" })}>
                                Approve
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setDeciding({ expense: e, action: "reject" })}>
                                Reject
                              </Button>
                            </>
                          )}
                          {e.status === "APPROVED" && (
                            <Button type="button" size="sm" onClick={() => setMarkingPaid(e)}>
                              Mark Paid
                            </Button>
                          )}
                          {canEditDelete && (
                            <RowActionsMenu
                              label={`Actions for ${e.user.name}'s expense claim`}
                              actions={[
                                { key: "edit", label: "Edit", icon: <IconPencil className="h-4 w-4" />, onSelect: () => openEdit(e) },
                                {
                                  key: "delete",
                                  label: "Delete",
                                  icon: <IconTrash className="h-4 w-4" />,
                                  destructive: true,
                                  onSelect: () => setDeletingExpense(e),
                                },
                              ]}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={deciding !== null} onOpenChange={(v) => !v && !saving && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deciding?.action === "approve" ? "Approve expense" : "Reject expense"}</DialogTitle>
            {deciding && (
              <DialogDescription>
                {deciding.expense.user.name} · {categoryDisplay(deciding.expense)} · {fmtAmount(deciding.expense.amount)}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            {deciding && <p className="rounded-md bg-muted/50 p-3 text-sm">{deciding.expense.description}</p>}
            <Label>Note to {deciding?.expense.user.name.split(" ")[0]} (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDeciding(null)}>
              Back
            </Button>
            <Button
              type="button"
              variant={deciding?.action === "reject" ? "destructive" : "default"}
              disabled={saving}
              onClick={decide}
            >
              {saving ? "Saving…" : deciding?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={markingPaid !== null}
        onOpenChange={(v) => !v && setMarkingPaid(null)}
        title="Mark this claim as paid?"
        description={markingPaid ? `${markingPaid.user.name}'s claim for ${fmtAmount(markingPaid.amount)} will be marked as reimbursed.` : ""}
        confirmLabel="Mark Paid"
        onConfirm={confirmMarkPaid}
      />

      <Dialog open={editing !== null} onOpenChange={(v) => !v && !savingEdit && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit expense claim</DialogTitle>
            {editing && <DialogDescription>{editing.user.name}</DialogDescription>}
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Dropdown value={editCategory} onChange={setEditCategory} options={CATEGORY_OPTIONS} />
            </div>
            {editIsOther && (
              <div className="flex flex-col gap-1.5">
                <Label>Please specify</Label>
                <Input
                  value={editCategoryOther}
                  onChange={(e) => setEditCategoryOther(e.target.value)}
                  maxLength={200}
                  placeholder="What kind of expense is this?"
                  required
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Amount</Label>
                <Input type="number" min="0" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Date</Label>
                <DatePicker value={editDate} clearable={false} onChange={setEditDate} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} maxLength={1000} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!editReady || savingEdit} onClick={saveEdit}>
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingExpense !== null}
        onOpenChange={(v) => !v && setDeletingExpense(null)}
        title="Delete this expense claim?"
        description={deletingExpense ? `${deletingExpense.user.name}'s claim for ${fmtAmount(deletingExpense.amount)} will be moved to Trash, where it'll stay recoverable for 30 days before being permanently deleted.` : ""}
        confirmLabel="Delete"
        onConfirm={confirmDeleteExpense}
      />
    </div>
  );
}

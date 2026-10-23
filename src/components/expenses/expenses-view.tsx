"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { IconCheck, IconClock, IconPaperclip, IconPlus, IconWallet, IconX } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { SubmitExpenseDialog } from "@/components/expenses/submit-expense-dialog";
import {
  categoryLabel,
  fmtAmount,
  fmtApplied,
  fmtExpenseDate,
  ExpenseStatusBadge,
  type ExpenseRow,
} from "@/components/expenses/expense-shared";

interface Summary {
  pending: number;
  approved: number;
  paid: number;
  rejected: number;
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <span className={tone}>{icon}</span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExpensesView() {
  const toast = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ExpenseRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/expenses");
    if (!res.ok) {
      setExpenses([]);
      return;
    }
    const d = await res.json();
    setExpenses(d.expenses);
    setSummary(d.summary);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(e: ExpenseRow) {
    const res = await fetch(`/api/expenses/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error("Couldn't cancel the claim", d.error);
    }
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My Expenses</h1>
          <p className="text-sm text-muted-foreground">Submit reimbursement claims and follow their status.</p>
        </div>
        <Button type="button" onClick={() => setSubmitOpen(true)}>
          <IconPlus className="h-4 w-4" />
          Submit expense
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Expense dashboard</h2>
        {!summary ? (
          <SkeletonCards count={4} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<IconClock className="h-5 w-5" />} label="Pending" value={fmtAmount(summary.pending)} tone="text-amber-500" />
            <StatCard icon={<IconCheck className="h-5 w-5" />} label="Approved, awaiting payment" value={fmtAmount(summary.approved)} tone="text-emerald-500" />
            <StatCard icon={<IconWallet className="h-5 w-5" />} label="Paid" value={fmtAmount(summary.paid)} tone="text-primary" />
            <StatCard icon={<IconX className="h-5 w-5" />} label="Rejected" value={fmtAmount(summary.rejected)} tone="text-destructive" />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Claim history</h2>
        {!expenses ? (
          <SkeletonTable rows={4} columns={7} />
        ) : expenses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              You haven&apos;t submitted any expense claims yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {["Submitted", "Date", "Category", "Amount", "Description", "Status", ""].map((h, i) => (
                        <th key={i} className={`px-4 py-2.5 font-medium ${h === "Amount" ? "text-right" : ""}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className="border-b border-border/50 align-top last:border-0">
                        <td className="whitespace-nowrap px-4 py-3">{fmtApplied(e.appliedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{fmtExpenseDate(e.expenseDate)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{categoryLabel(e.category)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmtAmount(e.amount)}</td>
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
                          {e.adminNote && <p className="mt-1 text-xs text-muted-foreground">Admin: {e.adminNote}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <ExpenseStatusBadge status={e.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {e.status === "PENDING" && (
                            <Button type="button" size="sm" variant="outline" onClick={() => setCancelTarget(e)}>
                              Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <SubmitExpenseDialog open={submitOpen} onOpenChange={setSubmitOpen} onSubmitted={load} />
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        title="Cancel this expense claim?"
        description={cancelTarget ? `Your claim for ${fmtAmount(cancelTarget.amount)} will no longer be submitted.` : ""}
        confirmLabel="Cancel claim"
        loadingLabel="Cancelling…"
        onConfirm={() => (cancelTarget ? cancel(cancelTarget) : undefined)}
      />
    </div>
  );
}

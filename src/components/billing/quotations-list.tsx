"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonTable } from "@/components/ui/skeleton";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/ui/selection-bar";
import { IconPencil, IconShare, IconTrash } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { GlobalSearchBar } from "@/components/layout/global-search-bar";
import { useSearch } from "@/components/providers/search-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { NewQuotationDialog } from "@/components/billing/new-quotation-dialog";
import { QuotationDetailDialog } from "@/components/billing/quotation-detail-dialog";
import { DocumentPreviewDialog } from "@/components/billing/document-preview-dialog";
import { buildQuotationHtml } from "@/components/billing/quotation-print";
import { downloadQuotationPdf } from "@/components/billing/pdf";
import { shareDocument } from "@/components/billing/share";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { formatMoney, cn } from "@/lib/utils";
import {
  QUOTATION_STATUS_VARIANT,
  statusLabel,
  type CompanyProfile,
  type CurrentUser,
  type Department,
  type QuotationDetail,
  type QuotationSummary,
} from "@/components/billing/types";

export function QuotationsList() {
  const toast = useToast();
  const { query } = useSearch();
  const { socket } = useSocket();
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [editId, setEditId] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuotation, setPreviewQuotation] = useState<QuotationDetail | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadQuotations() {
    const res = await fetch("/api/quotations");
    const data = await res.json();
    if (res.ok) setQuotations(data.quotations);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [qRes, meRes, cpRes] = await Promise.all([
        fetch("/api/quotations"),
        fetch("/api/auth/me"),
        fetch("/api/company-profile"),
      ]);
      const [qData, meData, cpData] = await Promise.all([qRes.json(), meRes.json(), cpRes.json()]);
      if (qRes.ok) setQuotations(qData.quotations);
      if (meRes.ok) setCurrentUser(meData.user);
      if (cpRes.ok) setCompanyProfile(cpData.profile);

      const isAdmin = meData.user?.role === "SUPER_ADMIN" || meData.user?.role === "ADMIN";
      if (isAdmin) {
        const deptRes = await fetch("/api/departments");
        const deptData = await deptRes.json();
        if (deptRes.ok) setDepartments(deptData.departments);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("quotation");
    if (id) openPreview(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onChange = () => loadQuotations();
    socket.on("quotation_created", onChange);
    socket.on("quotation_updated", onChange);
    socket.on("quotation_deleted", onChange);
    return () => {
      socket.off("quotation_created", onChange);
      socket.off("quotation_updated", onChange);
      socket.off("quotation_deleted", onChange);
    };
  }, [socket]);

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter((row) =>
      [row.quotationNumber, row.clientName, row.clientEmail].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
    );
  }, [quotations, query]);

  async function openPreview(id: string) {
    setPreviewOpen(true);
    setPreviewHtml(null);
    setPreviewQuotation(null);
    const data = await fetch(`/api/quotations/${id}`).then((r) => r.json());
    if (data.quotation) {
      setPreviewQuotation(data.quotation);
      setPreviewHtml(buildQuotationHtml(data.quotation, companyProfile, { padded: true }));
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelection() {
    setSelectedIds(new Set());
  }

  function onRowClick(row: QuotationSummary) {
    if (selectedIds.size > 0) toggleSelected(row.id);
    else openPreview(row.id);
  }

  async function shareRow(row: QuotationSummary) {
    await shareDocument({
      kind: "quotation",
      id: row.id,
      number: row.quotationNumber,
      clientName: row.clientName,
      amountLabel: formatMoney(row.total),
    });
  }

  async function bulkDelete() {
    const res = await fetch("/api/quotations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    if (res.ok) {
      const { deleted } = await res.json().catch(() => ({ deleted: selectedIds.size }));
      exitSelection();
      await loadQuotations();
      toast.success(`${deleted} quotation${deleted === 1 ? "" : "s"} deleted`);
    } else {
      toast.error("Couldn't delete quotations");
    }
  }

  async function singleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/quotations/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      await loadQuotations();
      toast.success("Quotation deleted");
    } else {
      toast.error("Couldn't delete quotation");
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Quotes</h1>
          <HelpDialog title="Quotes — help">
            <HelpSection heading="What this page is for">
              <p>Draft a quotation with line items, GST and a discount, send it for approval, and convert an approved one straight into an invoice.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>See every quotation, company-wide, and are the only ones who can approve or reject a sent quotation.</p>
            </HelpSection>
            <HelpSection heading="Everyone else">
              <p>You see only the quotations you created — sharing a department doesn&apos;t by itself show you a colleague&apos;s quotations.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearchBar placeholder="Search quotations…" />
          <AnimatePresence initial={false}>
            {selectedIds.size > 0 ? (
              <SelectionBar
                key="selection"
                count={selectedIds.size}
                allSelected={allSelected}
                onSelectAll={() =>
                  setSelectedIds((prev) => {
                    const ids = filtered.map((r) => r.id);
                    const all = ids.every((id) => prev.has(id));
                    const next = new Set(prev);
                    if (all) ids.forEach((id) => next.delete(id));
                    else ids.forEach((id) => next.add(id));
                    return next;
                  })
                }
                onCancel={exitSelection}
                onDelete={() => setConfirmOpen(true)}
              />
            ) : (
              <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <NewQuotationDialog isAdmin={!!isAdmin} departments={departments} companyProfile={companyProfile} onCreated={loadQuotations} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {loading && <SkeletonTable rows={8} columns={6} />}

      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-border focus:outline-none">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Number</th>
                <th className="px-3 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Total</th>
                <th className="px-3 py-2.5 font-medium">Valid until</th>
                <th className="px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const selected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick(row)}
                    className={cn(
                      "group cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-primary/5",
                      selected && "bg-accent/40"
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <HoverCheckbox
                        checked={selected}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={`Select ${row.quotationNumber}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium">{row.quotationNumber}</td>
                    <td className="px-3 py-2.5">
                      <div>{row.clientName}</div>
                      {row.clientEmail && <div className="text-xs text-muted-foreground">{row.clientEmail}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={QUOTATION_STATUS_VARIANT[row.status]}>{statusLabel(row.status)}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatMoney(row.total)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.validUntil ? new Date(row.validUntil).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <RowIcon label="Share" onClick={() => shareRow(row)}>
                          <IconShare className="h-4 w-4" />
                        </RowIcon>
                        <RowIcon label="Edit" onClick={() => setEditId(row.id)}>
                          <IconPencil className="h-4 w-4" />
                        </RowIcon>
                        <RowIcon label="Delete" danger onClick={() => setDeleteId(row.id)}>
                          <IconTrash className="h-4 w-4" />
                        </RowIcon>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No quotations found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <DocumentPreviewDialog
        open={previewOpen}
        title={previewQuotation ? previewQuotation.quotationNumber : "Quotation"}
        html={previewHtml}
        onOpenChange={setPreviewOpen}
        onShare={() =>
          previewQuotation &&
          shareDocument({
            kind: "quotation",
            id: previewQuotation.id,
            number: previewQuotation.quotationNumber,
            clientName: previewQuotation.clientName,
            amountLabel: formatMoney(previewQuotation.total),
          })
        }
        onDownload={() => {
          if (previewQuotation) return downloadQuotationPdf(previewQuotation, companyProfile);
        }}
      />

      <QuotationDetailDialog
        quotationId={editId}
        currentUser={currentUser}
        companyProfile={companyProfile}
        onClose={() => setEditId(null)}
        onChanged={loadQuotations}
        onDeleted={loadQuotations}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete this quotation?"
        description="This permanently deletes the quotation, its line items, versions, and approval history. This cannot be undone."
        onConfirm={singleDelete}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} quotation${selectedIds.size === 1 ? "" : "s"}?`}
        description="This permanently deletes the selected quotation(s) along with their items, versions, and approval history. This cannot be undone."
        onConfirm={bulkDelete}
      />
    </div>
  );
}

function RowIcon({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground",
          danger && "hover:text-destructive"
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

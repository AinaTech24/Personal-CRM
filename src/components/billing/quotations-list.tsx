"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

/** How many quotations a single fetch loads — both the initial page and each "Load more". */
const PAGE_SIZE = 50;

export function QuotationsList() {
  const toast = useToast();
  const { query } = useSearch();
  const { socket } = useSocket();
  const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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

  // Debounced so free-text search (typed into the shared header search bar)
  // doesn't fire a request per keystroke.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // The one reactive fetch: re-runs (resetting to the first page) whenever
  // the search query changes — search now happens server-side, so this is
  // also what makes "Load more" safe. `take` lets a live-update refresh ask
  // for as many as were already loaded, instead of collapsing back to page one.
  const loadQuotations = useCallback(
    async (take: number = PAGE_SIZE) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        params.set("take", String(Math.max(take, PAGE_SIZE)));
        const res = await fetch(`/api/quotations?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setQuotations(data.quotations ?? []);
          setTotal(data.total ?? 0);
          setHasMore(!!data.hasMore);
        }
      } finally {
        setLoading(false);
      }
    },
    [q]
  );

  async function loadMoreQuotations() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("take", String(PAGE_SIZE));
      params.set("skip", String(quotations.length));
      const res = await fetch(`/api/quotations?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load more quotations", data.error);
      setQuotations((prev) => [...prev, ...(data.quotations ?? [])]);
      setTotal(data.total ?? 0);
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  // A live update or a mutation (delete, an edit) re-fetches in place,
  // preserving however many quotations were already loaded (via "Load
  // more"), rather than collapsing the list back to page one.
  function refreshQuotations() {
    return loadQuotations(quotations.length);
  }

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  // User, company profile, and (for an admin) departments don't depend on
  // any filter — loaded once, not re-fetched every time search changes.
  useEffect(() => {
    (async () => {
      const [meRes, cpRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/company-profile")]);
      const [meData, cpData] = await Promise.all([meRes.json().catch(() => ({})), cpRes.json().catch(() => ({}))]);
      if (meRes.ok) setCurrentUser(meData.user);
      if (cpRes.ok) setCompanyProfile(cpData.profile);

      const isAdminUser = meData.user?.role === "SUPER_ADMIN" || meData.user?.role === "ADMIN";
      if (isAdminUser) {
        const deptRes = await fetch("/api/departments");
        const deptData = await deptRes.json().catch(() => ({}));
        if (deptRes.ok) setDepartments(deptData.departments);
      }
    })();
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("quotation");
    if (id) openPreview(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onChange = () => refreshQuotations();
    socket.on("quotation_created", onChange);
    socket.on("quotation_updated", onChange);
    socket.on("quotation_deleted", onChange);
    return () => {
      socket.off("quotation_created", onChange);
      socket.off("quotation_updated", onChange);
      socket.off("quotation_deleted", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, quotations.length]);

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";

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
      await refreshQuotations();
      toast.success(`${deleted} quotation${deleted === 1 ? "" : "s"} deleted`);
    } else {
      toast.error("Couldn't delete quotations");
    }
  }

  async function singleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/quotations/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      await refreshQuotations();
      toast.success("Quotation deleted");
    } else {
      toast.error("Couldn't delete quotation");
    }
  }

  // "Select all" covers whatever's currently loaded, not necessarily every
  // quotation matching the search — same convention as Gmail et al:
  // paginated lists select the loaded page, not silently everything.
  const allSelected = quotations.length > 0 && quotations.every((r) => selectedIds.has(r.id));

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
                    const ids = quotations.map((r) => r.id);
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
                <NewQuotationDialog isAdmin={!!isAdmin} departments={departments} companyProfile={companyProfile} onCreated={refreshQuotations} />
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
              {quotations.map((row) => {
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
              {quotations.length === 0 && (
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

      {!loading && quotations.length > 0 && (
        <div className="flex items-center justify-center gap-3 py-1">
          <span className="text-xs text-muted-foreground">
            Showing {quotations.length} of {total} quotation{total === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <Button type="button" variant="outline" size="sm" onClick={loadMoreQuotations} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
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
        onChanged={refreshQuotations}
        onDeleted={refreshQuotations}
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

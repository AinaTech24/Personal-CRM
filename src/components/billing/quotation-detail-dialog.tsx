"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { EightDotsRotate } from "@/components/ui/loader";
import { IconTrash, IconDownload, IconCheck, IconX } from "@/components/icons";
import { formatMoney } from "@/lib/utils";
import { LineItemsEditor, previewTotals } from "@/components/billing/line-items-editor";
import { downloadQuotationPdf } from "@/components/billing/pdf";
import { SellerFieldsEditor } from "@/components/billing/seller-fields-editor";
import {
  QUOTATION_EDITABLE_STATUSES,
  QUOTATION_STATUS_VARIANT,
  sellerFromDocument,
  sellerToPayload,
  statusLabel,
  type CompanyProfile,
  type CurrentUser,
  type LineItem,
  type QuotationDetail,
  type QuotationStatus,
  type SellerInfo,
} from "@/components/billing/types";

export function QuotationDetailDialog({
  quotationId,
  currentUser,
  companyProfile,
  onClose,
  onChanged,
  onDeleted,
}: {
  quotationId: string | null;
  currentUser: CurrentUser | null;
  companyProfile: CompanyProfile | null;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [seller, setSeller] = useState<SellerInfo | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientGstin, setClientGstin] = useState("");
  const [shipToAddress, setShipToAddress] = useState("");
  const [shipToGstin, setShipToGstin] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<Date | null>(null);
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";
  const totals = previewTotals(items, discount);

  useEffect(() => {
    if (!quotationId) {
      setQuotation(null);
      return;
    }
    setQuotation(null);
    fetch(`/api/quotations/${quotationId}`)
      .then((r) => r.json())
      .then((data) => {
        const q: QuotationDetail = data.quotation;
        setQuotation(q);
        setSeller(sellerFromDocument(q, companyProfile));
        setClientName(q.clientName);
        setClientEmail(q.clientEmail ?? "");
        setClientAddress(q.clientAddress ?? "");
        setClientGstin(q.clientGstin ?? "");
        setShipToAddress(q.shipToAddress ?? "");
        setShipToGstin(q.shipToGstin ?? "");
        setPlaceOfSupply(q.placeOfSupply ?? "");
        setSubject(q.subject ?? "");
        setNotes(q.notes ?? "");
        setValidUntil(q.validUntil ? new Date(q.validUntil) : null);
        setDiscount(q.discount);
        setItems(q.items.map((i) => ({ description: i.description, hsnSac: i.hsnSac ?? "", qty: i.qty, unitPrice: i.unitPrice, gstRate: i.gstRate })));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  async function patch(body: Record<string, unknown>) {
    if (!quotationId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quotations/${quotationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await fetch(`/api/quotations/${quotationId}`).then((r) => r.json());
        setQuotation(data.quotation);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails() {
    const cleanItems = items.filter((i) => i.description.trim());
    if (cleanItems.length === 0) return;
    await patch({
      clientName,
      clientEmail: clientEmail || null,
      clientAddress: clientAddress || null,
      clientGstin: clientGstin || null,
      shipToAddress: shipToAddress || null,
      shipToGstin: shipToGstin || null,
      placeOfSupply: placeOfSupply || null,
      subject: subject || null,
      notes: notes || null,
      validUntil: validUntil ? validUntil.toISOString() : null,
      discount,
      ...(seller ? sellerToPayload(seller) : {}),
      items: cleanItems,
    });
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!quotationId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quotations/${quotationId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: approvalComment || null }),
      });
      if (res.ok) {
        setApprovalComment("");
        const data = await fetch(`/api/quotations/${quotationId}`).then((r) => r.json());
        setQuotation(data.quotation);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function convertToInvoice() {
    if (!quotationId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quotations/${quotationId}/convert`, { method: "POST" });
      if (res.ok) {
        const data = await fetch(`/api/quotations/${quotationId}`).then((r) => r.json());
        setQuotation(data.quotation);
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!quotationId) return;
    const res = await fetch(`/api/quotations/${quotationId}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted();
      onClose();
    }
  }

  function print() {
    if (quotation) downloadQuotationPdf(quotation, companyProfile);
  }

  const locked = quotation?.status === "APPROVED" || quotation?.status === "REJECTED";

  return (
    <Dialog open={!!quotationId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh]">
        {!quotation ? (
          <div className="flex h-72 items-center justify-center">
            <EightDotsRotate className="h-9 w-9" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <DialogTitle>{quotation.quotationNumber}</DialogTitle>
                <Badge variant={QUOTATION_STATUS_VARIANT[quotation.status]}>{statusLabel(quotation.status)}</Badge>
                <span className="text-xs text-muted-foreground">v{quotation.currentVersion}</span>
              </div>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-5">
              {seller && !locked && (
                <div className="rounded-md border border-border p-3">
                  <SellerFieldsEditor seller={seller} onChange={setSeller} />
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-client">Client name</Label>
                  <Input id="qd-client" value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={locked} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-email">Client email</Label>
                  <Input id="qd-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} disabled={locked} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Valid until</Label>
                  <DateTimePicker value={validUntil} onChange={setValidUntil} placeholder="Not set" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-status">Status</Label>
                  <Dropdown
                    id="qd-status"
                    value={QUOTATION_EDITABLE_STATUSES.some((s) => s.value === quotation.status) ? quotation.status : ""}
                    onChange={(v) => patch({ status: v as QuotationStatus })}
                    placeholder={statusLabel(quotation.status)}
                    disabled={locked}
                    options={QUOTATION_EDITABLE_STATUSES}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-caddr">Client address</Label>
                  <Textarea id="qd-caddr" rows={3} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} disabled={locked} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-cgst">Client GSTIN</Label>
                  <Input id="qd-cgst" value={clientGstin} onChange={(e) => setClientGstin(e.target.value)} disabled={locked} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-saddr">Shipping address</Label>
                  <Textarea id="qd-saddr" rows={3} value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} disabled={locked} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-sgst">Ship-to GSTIN</Label>
                  <Input id="qd-sgst" value={shipToGstin} onChange={(e) => setShipToGstin(e.target.value)} disabled={locked} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-pos">Place of supply</Label>
                  <Input id="qd-pos" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} disabled={locked} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-subject">Subject</Label>
                  <Input id="qd-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Line items</Label>
                {locked ? (
                  <div className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-sm">
                    {quotation.items.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-2">
                        <span>
                          {i.description}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({i.qty} × {formatMoney(i.unitPrice)}, GST {i.gstRate}%)
                          </span>
                        </span>
                        <span className="tabular-nums">{formatMoney(i.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <LineItemsEditor items={items} onChange={setItems} showHsn />
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 border-t border-border pt-3 text-sm">
                <div className="flex w-56 items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatMoney(locked ? quotation.subtotal : totals.subtotal)}</span>
                </div>
                <div className="flex w-56 items-center justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <span className="tabular-nums">{formatMoney(locked ? quotation.gstAmount : totals.gstAmount)}</span>
                </div>
                <div className="flex w-56 items-center justify-between gap-2">
                  <span className="text-muted-foreground">Discount</span>
                  {locked ? (
                    <span className="tabular-nums">{formatMoney(quotation.discount)}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 w-28 text-right"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                  )}
                </div>
                <div className="flex w-56 items-center justify-between border-t border-border pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(locked ? quotation.total : totals.total)}</span>
                </div>
              </div>

              {!locked && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="qd-notes">Notes</Label>
                  <Textarea id="qd-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              )}

              {!locked && (
                <Button type="button" size="sm" onClick={saveDetails} disabled={saving} className="self-start">
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              )}

              {/* Approval workflow */}
              {isAdmin && (quotation.status === "SENT" || quotation.status === "DRAFT") && (
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <Label>Approval decision</Label>
                  <Textarea
                    placeholder="Optional comment"
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => decide("APPROVED")} disabled={saving} className="gap-1.5">
                      <IconCheck className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => decide("REJECTED")} disabled={saving} className="gap-1.5">
                      <IconX className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {quotation.status === "APPROVED" && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div className="text-sm">
                    <p className="font-medium">Convert to invoice</p>
                    <p className="text-xs text-muted-foreground">
                      {quotation.invoices.length > 0
                        ? `${quotation.invoices.length} invoice(s) generated`
                        : "Generate an invoice from this approved quotation"}
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={convertToInvoice} disabled={saving}>
                    Generate invoice
                  </Button>
                </div>
              )}

              {quotation.invoices.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Linked invoices</Label>
                  {quotation.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between rounded-md bg-accent/50 px-2.5 py-1.5 text-sm">
                      <span>{inv.invoiceNumber}</span>
                      <Badge variant="secondary">{statusLabel(inv.status)}</Badge>
                    </div>
                  ))}
                </div>
              )}

              {quotation.approvals.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Approval history</Label>
                  {quotation.approvals.map((a) => (
                    <div key={a.id} className="rounded-md bg-accent/50 px-2.5 py-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span>
                          {a.approver.name} · <span className={a.decision === "APPROVED" ? "text-emerald-500" : "text-destructive"}>{statusLabel(a.decision)}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(a.decidedAt).toLocaleString()}</span>
                      </div>
                      {a.comment && <p className="mt-0.5 text-xs text-muted-foreground">{a.comment}</p>}
                    </div>
                  ))}
                </div>
              )}

              {quotation.versions.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Version history</Label>
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {quotation.versions.map((v) => {
                      const total = typeof v.snapshot.total === "number" ? v.snapshot.total : Number(v.snapshot.total ?? 0);
                      return (
                        <div key={v.id} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>v{v.versionNumber} · {new Date(v.createdAt).toLocaleString()}</span>
                          <span className="tabular-nums">{formatMoney(total)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </DialogBody>

            <DialogFooter className="justify-between">
              <Tooltip label="Delete quotation">
                <button
                  type="button"
                  aria-label="Delete quotation"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </Tooltip>
              <Button type="button" variant="outline" size="sm" onClick={print} className="gap-1.5">
                <IconDownload className="h-3.5 w-3.5" />
                Download PDF
              </Button>
            </DialogFooter>
          </motion.div>
        )}
      </DialogContent>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete this quotation?"
        description="This permanently deletes the quotation, its line items, versions, and approval history. This cannot be undone."
        onConfirm={del}
      />
    </Dialog>
  );
}

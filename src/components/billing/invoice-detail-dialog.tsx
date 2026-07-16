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
import { IconTrash, IconDownload } from "@/components/icons";
import { formatMoney } from "@/lib/utils";
import { LineItemsEditor, previewTotals } from "@/components/billing/line-items-editor";
import { downloadInvoicePdf } from "@/components/billing/pdf";
import { SellerFieldsEditor } from "@/components/billing/seller-fields-editor";
import {
  INVOICE_EDITABLE_STATUSES,
  INVOICE_STATUS_VARIANT,
  sellerFromDocument,
  sellerToPayload,
  statusLabel,
  type CompanyProfile,
  type InvoiceDetail,
  type InvoiceStatus,
  type LineItem,
  type SellerInfo,
} from "@/components/billing/types";

const PAYMENT_METHODS = [
  { value: "Bank transfer", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "Cash", label: "Cash" },
  { value: "Cheque", label: "Cheque" },
  { value: "Card", label: "Card" },
];

const TERMS_OPTIONS = [
  { value: "Due on Receipt", label: "Due on Receipt" },
  { value: "Net 15", label: "Net 15" },
  { value: "Net 30", label: "Net 30" },
  { value: "Net 45", label: "Net 45" },
];

export function InvoiceDetailDialog({
  invoiceId,
  companyProfile,
  onClose,
  onChanged,
  onDeleted,
}: {
  invoiceId: string | null;
  companyProfile: CompanyProfile | null;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [seller, setSeller] = useState<SellerInfo | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientGstin, setClientGstin] = useState("");
  const [shipToAddress, setShipToAddress] = useState("");
  const [shipToGstin, setShipToGstin] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [terms, setTerms] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState("Bank transfer");
  const [payNote, setPayNote] = useState("");

  const totals = previewTotals(items, 0);

  function hydrate(inv: InvoiceDetail) {
    setInvoice(inv);
    setSeller(sellerFromDocument(inv, companyProfile));
    setClientName(inv.clientName);
    setClientEmail(inv.clientEmail ?? "");
    setClientAddress(inv.clientAddress ?? "");
    setClientGstin(inv.clientGstin ?? "");
    setShipToAddress(inv.shipToAddress ?? "");
    setShipToGstin(inv.shipToGstin ?? "");
    setInvoiceDate(inv.invoiceDate ? new Date(inv.invoiceDate) : null);
    setDueDate(inv.dueDate ? new Date(inv.dueDate) : null);
    setTerms(inv.terms ?? "");
    setPoNumber(inv.poNumber ?? "");
    setPlaceOfSupply(inv.placeOfSupply ?? "");
    setSubject(inv.subject ?? "");
    setNotes(inv.notes ?? "");
    setItems(inv.items.map((i) => ({ description: i.description, hsnSac: i.hsnSac ?? "", qty: i.qty, unitPrice: i.unitPrice, gstRate: i.gstRate })));
    setPayAmount(Math.max(0, inv.balance));
  }

  async function reload() {
    if (!invoiceId) return;
    const data = await fetch(`/api/invoices/${invoiceId}`).then((r) => r.json());
    if (data.invoice) setInvoice(data.invoice);
  }

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null);
      return;
    }
    setInvoice(null);
    fetch(`/api/invoices/${invoiceId}`)
      .then((r) => r.json())
      .then((data) => data.invoice && hydrate(data.invoice))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const itemsLocked = !invoice || invoice.amountPaid > 0 || invoice.status === "CANCELLED";

  async function patch(body: Record<string, unknown>) {
    if (!invoiceId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await reload();
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails() {
    const cleanItems = items.filter((i) => i.description.trim());
    const body: Record<string, unknown> = {
      clientName,
      clientEmail: clientEmail || null,
      clientAddress: clientAddress || null,
      clientGstin: clientGstin || null,
      shipToAddress: shipToAddress || null,
      shipToGstin: shipToGstin || null,
      invoiceDate: invoiceDate ? invoiceDate.toISOString() : null,
      dueDate: dueDate ? dueDate.toISOString() : null,
      terms: terms || null,
      poNumber: poNumber || null,
      placeOfSupply: placeOfSupply || null,
      subject: subject || null,
      notes: notes || null,
      ...(seller ? sellerToPayload(seller) : {}),
    };
    if (!itemsLocked && cleanItems.length > 0) body.items = cleanItems;
    await patch(body);
  }

  async function recordPayment() {
    if (!invoiceId || payAmount <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: payAmount, method: payMethod, note: payNote || null }),
      });
      if (res.ok) {
        setPayNote("");
        await reload();
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(paymentId: string) {
    if (!invoiceId) return;
    const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    if (res.ok) {
      await reload();
      onChanged();
    }
  }

  async function del() {
    if (!invoiceId) return;
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted();
      onClose();
    }
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh]">
        {!invoice ? (
          <div className="flex h-72 items-center justify-center">
            <EightDotsRotate className="h-9 w-9" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <DialogTitle>{invoice.invoiceNumber}</DialogTitle>
                <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>{statusLabel(invoice.status)}</Badge>
                {invoice.quotation && (
                  <span className="text-xs text-muted-foreground">from {invoice.quotation.quotationNumber}</span>
                )}
              </div>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-5">
              {/* Company (seller) */}
              {seller && (
                <div className="rounded-md border border-border p-3">
                  <SellerFieldsEditor seller={seller} onChange={setSeller} />
                </div>
              )}

              {/* Bill To */}
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold">Bill To</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="id-client">Client name</Label>
                    <Input id="id-client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="id-email">Client email</Label>
                    <Input id="id-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="id-caddr">Billing address</Label>
                    <Textarea id="id-caddr" rows={3} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="id-cgst">Client GSTIN</Label>
                    <Input id="id-cgst" value={clientGstin} onChange={(e) => setClientGstin(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Ship To */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="id-saddr">Ship-to address</Label>
                  <Textarea id="id-saddr" rows={2} value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="id-sgst">Ship-to GSTIN</Label>
                  <Input id="id-sgst" value={shipToGstin} onChange={(e) => setShipToGstin(e.target.value)} />
                </div>
              </div>

              {/* Invoice details */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Invoice date</Label>
                  <DateTimePicker value={invoiceDate} onChange={setInvoiceDate} placeholder="Not set" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Due date</Label>
                  <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="Not set" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="id-terms">Terms</Label>
                  <Dropdown id="id-terms" value={terms} onChange={setTerms} placeholder="None" options={TERMS_OPTIONS} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="id-po">P.O. #</Label>
                  <Input id="id-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="id-pos">Place of supply</Label>
                  <Input id="id-pos" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="id-status">Status</Label>
                  <Dropdown
                    id="id-status"
                    value={INVOICE_EDITABLE_STATUSES.some((s) => s.value === invoice.status) ? invoice.status : ""}
                    onChange={(v) => patch({ status: v as InvoiceStatus })}
                    placeholder={statusLabel(invoice.status)}
                    options={INVOICE_EDITABLE_STATUSES}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="id-subject">Subject</Label>
                <Input id="id-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              {/* Items */}
              <div className="flex flex-col gap-2">
                <Label>
                  Line items{" "}
                  {itemsLocked && <span className="text-xs font-normal text-muted-foreground">(locked — payments recorded)</span>}
                </Label>
                {itemsLocked ? (
                  <div className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-sm">
                    {invoice.items.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-2">
                        <span>
                          {i.description}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({i.hsnSac ? `HSN ${i.hsnSac}, ` : ""}
                            {i.qty} × {formatMoney(i.unitPrice)}, GST {i.gstRate}%)
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

              {/* Totals */}
              <div className="flex flex-col items-end gap-1.5 border-t border-border pt-3 text-sm">
                <div className="flex w-60 items-center justify-between">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="tabular-nums">{formatMoney(itemsLocked ? invoice.subtotal : totals.subtotal)}</span>
                </div>
                <div className="flex w-60 items-center justify-between">
                  <span className="text-muted-foreground">IGST</span>
                  <span className="tabular-nums">{formatMoney(itemsLocked ? invoice.gstAmount : totals.gstAmount)}</span>
                </div>
                <div className="flex w-60 items-center justify-between border-t border-border pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(itemsLocked ? invoice.total : totals.total)}</span>
                </div>
                <div className="flex w-60 items-center justify-between text-emerald-500">
                  <span>Paid</span>
                  <span className="tabular-nums">{formatMoney(invoice.amountPaid)}</span>
                </div>
                <div className="flex w-60 items-center justify-between font-medium">
                  <span>Balance due</span>
                  <span className="tabular-nums">{formatMoney(invoice.balance)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="id-notes">Notes</Label>
                <Textarea id="id-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <Button type="button" size="sm" onClick={saveDetails} disabled={saving} className="self-start">
                {saving ? "Saving..." : "Save changes"}
              </Button>

              {/* Payments */}
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                <Label>Record a payment</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                  />
                  <Dropdown value={payMethod} onChange={setPayMethod} options={PAYMENT_METHODS} />
                  <Input placeholder="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                </div>
                <Button type="button" size="sm" onClick={recordPayment} disabled={saving || payAmount <= 0} className="self-start">
                  Add payment
                </Button>
              </div>

              {invoice.payments.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Payment history</Label>
                  {invoice.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-accent/50 px-2.5 py-1.5 text-sm">
                      <div>
                        <span className="tabular-nums font-medium">{formatMoney(p.amount)}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          · {p.method} · {new Date(p.paidAt).toLocaleDateString()} · {p.recordedBy.name}
                        </span>
                        {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removePayment(p.id)}
                        aria-label="Remove payment"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </DialogBody>

            <DialogFooter className="justify-between">
              <Tooltip label="Delete invoice">
                <button
                  type="button"
                  aria-label="Delete invoice"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </Tooltip>
              <Button type="button" variant="outline" size="sm" onClick={() => invoice && downloadInvoicePdf(invoice, companyProfile)} className="gap-1.5">
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
        title="Delete this invoice?"
        description="This permanently deletes the invoice, its line items, and payment history. This cannot be undone."
        onConfirm={del}
      />
    </Dialog>
  );
}

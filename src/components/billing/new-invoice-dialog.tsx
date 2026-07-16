"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { IconPlus } from "@/components/icons";
import { formatMoney } from "@/lib/utils";
import { LineItemsEditor, emptyLineItem, previewTotals } from "@/components/billing/line-items-editor";
import { SellerFieldsEditor } from "@/components/billing/seller-fields-editor";
import { useToast } from "@/components/providers/toast-provider";
import {
  sellerFromProfile,
  sellerToPayload,
  type CompanyProfile,
  type Department,
  type LineItem,
  type SellerInfo,
} from "@/components/billing/types";

const TERMS_OPTIONS = [
  { value: "Due on Receipt", label: "Due on Receipt" },
  { value: "Net 15", label: "Net 15" },
  { value: "Net 30", label: "Net 30" },
  { value: "Net 45", label: "Net 45" },
];

export function NewInvoiceDialog({
  isAdmin,
  departments,
  companyProfile,
  onCreated,
}: {
  isAdmin: boolean;
  departments: Department[];
  companyProfile: CompanyProfile | null;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [seller, setSeller] = useState<SellerInfo>(() => sellerFromProfile(companyProfile));
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientGstin, setClientGstin] = useState("");
  const [shipToAddress, setShipToAddress] = useState("");
  const [shipToGstin, setShipToGstin] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState<Date | null>(new Date());
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [terms, setTerms] = useState("Due on Receipt");
  const [poNumber, setPoNumber] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("Thanks for your business.");
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totals = previewTotals(items, 0);

  // Pre-fill the seller from the company profile each time the dialog opens.
  useEffect(() => {
    if (open) setSeller(sellerFromProfile(companyProfile));
  }, [open, companyProfile]);

  function reset() {
    setSeller(sellerFromProfile(companyProfile));
    setClientName("");
    setClientEmail("");
    setClientAddress("");
    setClientGstin("");
    setShipToAddress("");
    setShipToGstin("");
    setDepartmentId("");
    setInvoiceDate(new Date());
    setDueDate(null);
    setTerms("Due on Receipt");
    setPoNumber("");
    setPlaceOfSupply("");
    setSubject("");
    setNotes("Thanks for your business.");
    setItems([emptyLineItem()]);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanItems = items.filter((i) => i.description.trim());
    if (cleanItems.length === 0) {
      setError("Add at least one line item with a description");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientEmail: clientEmail || null,
          clientAddress: clientAddress || null,
          clientGstin: clientGstin || null,
          shipToAddress: shipToAddress || null,
          shipToGstin: shipToGstin || null,
          departmentId: departmentId || null,
          invoiceDate: invoiceDate ? invoiceDate.toISOString() : null,
          dueDate: dueDate ? dueDate.toISOString() : null,
          terms: terms || null,
          poNumber: poNumber || null,
          placeOfSupply: placeOfSupply || null,
          subject: subject || null,
          notes: notes || null,
          ...sellerToPayload(seller),
          items: cleanItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        toast.error("Couldn't create invoice", data.error);
        return;
      }
      reset();
      setOpen(false);
      onCreated();
      toast.success(`Invoice ${data.invoice?.invoiceNumber ?? ""} created`.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <IconPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="new-invoice-form" onSubmit={onSubmit} className="flex flex-col gap-5">
            {/* Company (seller) */}
            <div className="rounded-md border border-border p-3">
              <SellerFieldsEditor seller={seller} onChange={setSeller} />
            </div>

            {/* Bill To */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Bill To</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-client">Client name</Label>
                  <Input id="i-client" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-email">Client email</Label>
                  <Input id="i-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-caddr">Billing address</Label>
                  <Textarea id="i-caddr" rows={3} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-cgst">Client GSTIN</Label>
                  <Input id="i-cgst" value={clientGstin} onChange={(e) => setClientGstin(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Ship To */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Ship To</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-saddr">Shipping address</Label>
                  <Textarea id="i-saddr" rows={3} value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-sgst">Ship-to GSTIN</Label>
                  <Input id="i-sgst" value={shipToGstin} onChange={(e) => setShipToGstin(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Invoice details */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Invoice details</p>
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
                  <Label htmlFor="i-terms">Terms</Label>
                  <Dropdown id="i-terms" value={terms} onChange={setTerms} options={TERMS_OPTIONS} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-po">P.O. #</Label>
                  <Input id="i-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="i-pos">Place of supply</Label>
                  <Input id="i-pos" placeholder="Maharashtra (27)" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="i-dept">Department</Label>
                    <Dropdown
                      id="i-dept"
                      value={departmentId}
                      onChange={setDepartmentId}
                      placeholder="None"
                      options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="i-subject">Subject</Label>
                <Input id="i-subject" placeholder="Mutual Fund Brokerage / Commission" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>

            {/* Items */}
            <div className="flex flex-col gap-2">
              <Label>Line items</Label>
              <LineItemsEditor items={items} onChange={setItems} showHsn />
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end gap-1.5 border-t border-border pt-3 text-sm">
              <div className="flex w-56 items-center justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="tabular-nums">{formatMoney(totals.subtotal)}</span>
              </div>
              <div className="flex w-56 items-center justify-between">
                <span className="text-muted-foreground">IGST</span>
                <span className="tabular-nums">{formatMoney(totals.gstAmount)}</span>
              </div>
              <div className="flex w-56 items-center justify-between border-t border-border pt-1.5 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totals.total)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="i-notes">Notes</Label>
              <Textarea id="i-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="new-invoice-form" disabled={loading}>
            {loading ? "Creating..." : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

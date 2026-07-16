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

export function NewQuotationDialog({
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
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("This quotation is valid until the date mentioned above.");
  const [departmentId, setDepartmentId] = useState("");
  const [validUntil, setValidUntil] = useState<Date | null>(null);
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<LineItem[]>([emptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totals = previewTotals(items, discount);

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
    setPlaceOfSupply("");
    setSubject("");
    setNotes("This quotation is valid until the date mentioned above.");
    setDepartmentId("");
    setValidUntil(null);
    setDiscount(0);
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
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientEmail: clientEmail || null,
          clientAddress: clientAddress || null,
          clientGstin: clientGstin || null,
          shipToAddress: shipToAddress || null,
          shipToGstin: shipToGstin || null,
          placeOfSupply: placeOfSupply || null,
          subject: subject || null,
          notes: notes || null,
          departmentId: departmentId || null,
          validUntil: validUntil ? validUntil.toISOString() : null,
          discount,
          ...sellerToPayload(seller),
          items: cleanItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        toast.error("Couldn't create quotation", data.error);
        return;
      }
      reset();
      setOpen(false);
      onCreated();
      toast.success(`Quotation ${data.quotation?.quotationNumber ?? ""} created`.trim());
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
          <DialogTitle>New quotation</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="new-quotation-form" onSubmit={onSubmit} className="flex flex-col gap-4">
            {/* Company (seller) */}
            <div className="rounded-md border border-border p-3">
              <SellerFieldsEditor seller={seller} onChange={setSeller} />
            </div>

            {/* Quotation For */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Quotation For</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-client">Client name</Label>
                  <Input id="q-client" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-email">Client email</Label>
                  <Input id="q-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-caddr">Client address</Label>
                  <Textarea id="q-caddr" rows={3} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-cgst">Client GSTIN</Label>
                  <Input id="q-cgst" value={clientGstin} onChange={(e) => setClientGstin(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Ship To */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Ship To</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-saddr">Shipping address</Label>
                  <Textarea id="q-saddr" rows={3} value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-sgst">Ship-to GSTIN</Label>
                  <Input id="q-sgst" value={shipToGstin} onChange={(e) => setShipToGstin(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Quotation details */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Quotation details</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Valid until</Label>
                  <DateTimePicker value={validUntil} onChange={setValidUntil} placeholder="Not set" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-pos">Place of supply</Label>
                  <Input id="q-pos" placeholder="Maharashtra (27)" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="q-dept">Department</Label>
                    <Dropdown
                      id="q-dept"
                      value={departmentId}
                      onChange={setDepartmentId}
                      placeholder="None"
                      options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="q-subject">Subject</Label>
                <Input id="q-subject" placeholder="Proposal for services" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Line items</Label>
              <LineItemsEditor items={items} onChange={setItems} showHsn />
            </div>

            <div className="flex flex-col items-end gap-1.5 border-t border-border pt-3 text-sm">
              <div className="flex w-56 items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatMoney(totals.subtotal)}</span>
              </div>
              <div className="flex w-56 items-center justify-between">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{formatMoney(totals.gstAmount)}</span>
              </div>
              <div className="flex w-56 items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-8 w-28 text-right"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                />
              </div>
              <div className="flex w-56 items-center justify-between border-t border-border pt-1.5 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totals.total)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="q-notes">Notes</Label>
              <Textarea id="q-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="new-quotation-form" disabled={loading}>
            {loading ? "Creating..." : "Create quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

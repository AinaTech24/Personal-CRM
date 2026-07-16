"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { IconX } from "@/components/icons";
import type { SellerInfo } from "@/components/billing/types";

const MAX_IMAGE_BYTES = 1_000_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Editor for the per-document company (seller) header shown on invoices/quotations.
 * Pre-filled from the company profile but overridable per document.
 */
export function SellerFieldsEditor({
  seller,
  onChange,
}: {
  seller: SellerInfo;
  onChange: (seller: SellerInfo) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const signRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof SellerInfo>(key: K, value: SellerInfo[K]) {
    onChange({ ...seller, [key]: value });
  }

  async function pickImage(file: File | undefined, key: "logoDataUrl" | "signatureDataUrl") {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file");
    if (file.size > MAX_IMAGE_BYTES) return setError("Image is too large (max ~1MB)");
    set(key, await readAsDataUrl(file));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Company details (from)</p>
        <span className="text-xs text-muted-foreground">Pre-filled from your company profile — editable per document</span>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-28 items-center justify-center overflow-hidden rounded-md border border-border bg-accent/30">
          {seller.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seller.logoDataUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No logo</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => logoRef.current?.click()}>
            {seller.logoDataUrl ? "Change logo" : "Select logo"}
          </Button>
          {seller.logoDataUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={() => set("logoDataUrl", null)}>
              <IconX className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0], "logoDataUrl")} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Company name</Label>
          <Input value={seller.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>GSTIN</Label>
          <Input value={seller.gstin} onChange={(e) => set("gstin", e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Company address</Label>
        <Textarea rows={3} value={seller.address} onChange={(e) => set("address", e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>Phone</Label>
          <Input value={seller.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <Input value={seller.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Website</Label>
          <Input value={seller.website} onChange={(e) => set("website", e.target.value)} />
        </div>
      </div>

      {/* Signature */}
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-32 items-center justify-center overflow-hidden rounded-md border border-border bg-accent/30">
          {seller.signatureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seller.signatureDataUrl} alt="Signature" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No signature</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => signRef.current?.click()}>
            {seller.signatureDataUrl ? "Change signature" : "Select signature"}
          </Button>
          {seller.signatureDataUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={() => set("signatureDataUrl", null)}>
              <IconX className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <input ref={signRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0], "signatureDataUrl")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Signatory name</Label>
        <Input placeholder="Authorized Signatory" value={seller.signatory} onChange={(e) => set("signatory", e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

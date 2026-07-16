"use client";

import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { IconX } from "@/components/icons";
import type { CompanyProfile } from "@/components/billing/types";

const MAX_IMAGE_BYTES = 1_000_000; // ~1MB before base64 overhead

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CompanyProfileDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (profile: CompanyProfile) => void;
}) {
  const [name, setName] = useState("");
  const [addressLines, setAddressLines] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [signatoryName, setSignatoryName] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const signInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/company-profile")
      .then((r) => r.json())
      .then((data) => {
        const p: CompanyProfile = data.profile;
        setName(p.name ?? "");
        setAddressLines(p.addressLines ?? "");
        setGstin(p.gstin ?? "");
        setPhone(p.phone ?? "");
        setEmail(p.email ?? "");
        setWebsite(p.website ?? "");
        setSignatoryName(p.signatoryName ?? "");
        setLogoDataUrl(p.logoDataUrl ?? null);
        setSignatureDataUrl(p.signatureDataUrl ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  async function onPickImage(file: File | undefined, setter: (v: string | null) => void) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large (max ~1MB)");
      return;
    }
    setter(await readAsDataUrl(file));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/company-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          addressLines: addressLines || null,
          gstin: gstin || null,
          phone: phone || null,
          email: email || null,
          website: website || null,
          signatoryName: signatoryName || null,
          logoDataUrl,
          signatureDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      onSaved?.(data.profile);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Company profile</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {/* Logo */}
              <div className="flex flex-col gap-1.5">
                <Label>Company logo</Label>
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-md border border-border bg-accent/30">
                    {logoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoDataUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No logo</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                      {logoDataUrl ? "Change" : "Select logo"}
                    </Button>
                    {logoDataUrl && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setLogoDataUrl(null)}>
                        <IconX className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickImage(e.target.files?.[0], setLogoDataUrl)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-name">Company name</Label>
                <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-address">Address</Label>
                <Textarea
                  id="cp-address"
                  rows={4}
                  placeholder={"104, Maruti Sumiran, A V ROAD\nANAND Gujarat 388001\nIndia"}
                  value={addressLines}
                  onChange={(e) => setAddressLines(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-gstin">GSTIN</Label>
                  <Input id="cp-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-phone">Phone</Label>
                  <Input id="cp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-email">Email</Label>
                  <Input id="cp-email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-website">Website</Label>
                  <Input id="cp-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
              </div>

              {/* Signature */}
              <div className="flex flex-col gap-1.5">
                <Label>Authorized signature</Label>
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-md border border-border bg-accent/30">
                    {signatureDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={signatureDataUrl} alt="Signature" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No signature</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => signInputRef.current?.click()}>
                      {signatureDataUrl ? "Change" : "Select image"}
                    </Button>
                    {signatureDataUrl && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setSignatureDataUrl(null)}>
                        <IconX className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <input
                    ref={signInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickImage(e.target.files?.[0], setSignatureDataUrl)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-signatory">Signatory name (printed under the signature)</Label>
                <Input
                  id="cp-signatory"
                  placeholder="Authorized Signatory"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading}>
            {saving ? "Saving..." : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

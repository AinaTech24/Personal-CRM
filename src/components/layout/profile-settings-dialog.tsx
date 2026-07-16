"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { IconX, IconUser } from "@/components/icons";

const MAX_IMAGE_BYTES = 1_000_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProfileSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCurrentPassword("");
    setNewPassword("");
    setLoading(true);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const u = data.user;
        if (u) {
          setName(u.name ?? "");
          setSurname(u.surname ?? "");
          setMobile(u.mobile ?? "");
          setEmail(u.email ?? "");
          setAvatarDataUrl(u.avatarDataUrl ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  async function onPickImage(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file");
    if (file.size > MAX_IMAGE_BYTES) return setError("Image is too large (max ~1MB)");
    setAvatarDataUrl(await readAsDataUrl(file));
  }

  async function save() {
    setError(null);
    if (newPassword && newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          surname: surname || null,
          mobile: mobile || null,
          avatarDataUrl,
          ...(newPassword ? { currentPassword, newPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save profile");
        return;
      }
      onSaved?.();
      router.refresh();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {/* Profile image */}
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border text-muted-foreground">
                  {avatarDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarDataUrl} alt="Avatar" className="h-full w-full object-contain" />
                  ) : (
                    <IconUser className="h-7 w-7" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                    {avatarDataUrl ? "Change photo" : "Upload photo"}
                  </Button>
                  {avatarDataUrl && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarDataUrl(null)}>
                      <IconX className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ps-name">Name</Label>
                  <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ps-surname">Surname</Label>
                  <Input id="ps-surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ps-mobile">Mobile number</Label>
                  <Input id="ps-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ps-email">Email (login)</Label>
                  <Input id="ps-email" value={email} readOnly disabled className="opacity-70" />
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <p className="text-sm font-medium">Change password</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ps-cur">Current password</Label>
                    <Input id="ps-cur" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ps-new">New password</Label>
                    <Input id="ps-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="Leave blank to keep" />
                  </div>
                </div>
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
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

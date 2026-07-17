"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EightDotsRotate } from "@/components/ui/loader";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import {
  IconBell,
  IconBuildingCog,
  IconMoon,
  IconShield,
  IconSliders,
  IconSun,
  IconUser,
  IconX,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 1_000_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Small reusable toggle switch, matching the one used on the SMTP settings page. */
function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

type SectionId = "profile" | "preferences" | "notifications" | "security" | "company";

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const PERSONAL_ITEMS: NavItem[] = [
  { id: "profile", label: "Profile", icon: IconUser },
  { id: "preferences", label: "Preferences", icon: IconSliders },
  { id: "notifications", label: "Notifications", icon: IconBell },
  { id: "security", label: "Security", icon: IconShield },
];

const WORKSPACE_ITEMS: NavItem[] = [{ id: "company", label: "Company profile", icon: IconBuildingCog, adminOnly: true }];

export function SettingsDialog({
  open,
  onOpenChange,
  isAdmin,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { theme, setTheme } = useTheme();

  const [section, setSection] = useState<SectionId>("profile");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);

  // Profile
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Security
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Company profile (admin)
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [cName, setCName] = useState("");
  const [cAddress, setCAddress] = useState("");
  const [cGstin, setCGstin] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cWebsite, setCWebsite] = useState("");
  const [cSignatory, setCSignatory] = useState("");
  const [cLogo, setCLogo] = useState<string | null>(null);
  const [cSignature, setCSignature] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSection("profile");
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

  // Company profile is loaded lazily the first time that pane is opened.
  useEffect(() => {
    if (!open || !isAdmin || section !== "company" || companyLoaded) return;
    fetch("/api/company-profile")
      .then((r) => r.json())
      .then((data) => {
        const p = data.profile;
        if (!p) return;
        setCName(p.name ?? "");
        setCAddress(p.addressLines ?? "");
        setCGstin(p.gstin ?? "");
        setCPhone(p.phone ?? "");
        setCEmail(p.email ?? "");
        setCWebsite(p.website ?? "");
        setCSignatory(p.signatoryName ?? "");
        setCLogo(p.logoDataUrl ?? null);
        setCSignature(p.signatureDataUrl ?? null);
      })
      .catch(() => {})
      .finally(() => setCompanyLoaded(true));
  }, [open, isAdmin, section, companyLoaded]);

  async function onPickImage(file: File | undefined, setter: (v: string | null) => void) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (file.size > MAX_IMAGE_BYTES) return toast.error("Image is too large", "Max ~1MB");
    setter(await readAsDataUrl(file));
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, surname: surname || null, mobile: mobile || null, avatarDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save profile", data.error);
      toast.success("Profile saved");
      onSaved?.();
      router.refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSecurity() {
    if (newPassword && newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (!newPassword) {
      toast.error("Enter a new password to change it");
      return;
    }
    setSavingSecurity(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't change password", data.error);
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
    } finally {
      setSavingSecurity(false);
    }
  }

  async function saveCompany() {
    setSavingCompany(true);
    try {
      const res = await fetch("/api/company-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cName,
          addressLines: cAddress || null,
          gstin: cGstin || null,
          phone: cPhone || null,
          email: cEmail || null,
          website: cWebsite || null,
          signatoryName: cSignatory || null,
          logoDataUrl: cLogo,
          signatureDataUrl: cSignature,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save company profile", data.error);
      toast.success("Company profile saved");
    } finally {
      setSavingCompany(false);
    }
  }

  function NavButton({ item }: { item: NavItem }) {
    const active = section === item.id;
    return (
      <button
        type="button"
        onClick={() => setSection(item.id)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
          active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {item.label}
      </button>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[85vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>

          {/* Sidebar */}
          <div className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card/40 p-3">
            <p className="px-2.5 pt-1 text-sm font-semibold">Settings</p>
            <div className="flex flex-col gap-0.5">
              <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">Personal</p>
              {PERSONAL_ITEMS.map((item) => (
                <NavButton key={item.id} item={item} />
              ))}
            </div>
            {isAdmin && (
              <div className="flex flex-col gap-0.5">
                <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">Workspace</p>
                {WORKSPACE_ITEMS.map((item) => (
                  <NavButton key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            <Tooltip label="Close" side="bottom" wrapperClassName="absolute right-4 top-4 z-20">
              <Dialog.Close className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
                <IconX className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </Tooltip>

            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <EightDotsRotate className="h-9 w-9" />
                </div>
              ) : (
                <motion.div
                  key={section}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-5"
                >
                  {section === "profile" && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Profile</h2>
                        <p className="text-sm text-muted-foreground">Your personal details.</p>
                      </div>
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
                          <Button type="button" size="sm" variant="outline" onClick={() => avatarInputRef.current?.click()}>
                            {avatarDataUrl ? "Change photo" : "Upload photo"}
                          </Button>
                          {avatarDataUrl && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarDataUrl(null)}>
                              <IconX className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onPickImage(e.target.files?.[0], setAvatarDataUrl)}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-name">Name</Label>
                          <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-surname">Surname</Label>
                          <Input id="set-surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-mobile">Mobile number</Label>
                          <Input id="set-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-email">Email (login)</Label>
                          <Input id="set-email" value={email} readOnly disabled className="opacity-70" />
                        </div>
                      </div>
                      <Button type="button" onClick={saveProfile} disabled={savingProfile} className="self-start">
                        {savingProfile ? "Saving..." : "Save changes"}
                      </Button>
                    </>
                  )}

                  {section === "preferences" && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Preferences</h2>
                        <p className="text-sm text-muted-foreground">How Aina CRM looks and feels for you.</p>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                        <div className="flex items-center gap-2.5">
                          {theme === "dark" ? <IconMoon className="h-4 w-4 text-muted-foreground" /> : <IconSun className="h-4 w-4 text-muted-foreground" />}
                          <div>
                            <p className="text-sm font-medium">Dark mode</p>
                            <p className="text-xs text-muted-foreground">Switch between light and dark themes.</p>
                          </div>
                        </div>
                        <ToggleSwitch
                          checked={theme === "dark"}
                          onChange={(v) => setTheme(v ? "dark" : "light")}
                          label="Toggle dark mode"
                        />
                      </div>
                      <ComingSoon
                        items={["Timezone", "Language", "Default landing page", "Compact/comfortable density"]}
                      />
                    </>
                  )}

                  {section === "notifications" && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Notifications</h2>
                        <p className="text-sm text-muted-foreground">
                          Control which events notify you and how.
                        </p>
                      </div>
                      <ComingSoon
                        items={[
                          "Per-category toggles (Leads, Tasks, Projects, Quotations, Invoices)",
                          "In-app vs. email delivery",
                          "Daily digest mode",
                          "Quiet hours",
                        ]}
                      />
                    </>
                  )}

                  {section === "security" && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Security</h2>
                        <p className="text-sm text-muted-foreground">Manage your password and account security.</p>
                      </div>
                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <p className="text-sm font-medium">Change password</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="set-cur">Current password</Label>
                            <Input
                              id="set-cur"
                              type="password"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              autoComplete="current-password"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="set-new">New password</Label>
                            <Input
                              id="set-new"
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              autoComplete="new-password"
                              placeholder="At least 8 characters"
                            />
                          </div>
                        </div>
                        <Button type="button" size="sm" onClick={saveSecurity} disabled={savingSecurity} className="self-start">
                          {savingSecurity ? "Saving..." : "Change password"}
                        </Button>
                      </div>
                      <ComingSoon items={["Two-factor authentication", "Active sessions", "Login history"]} />
                    </>
                  )}

                  {section === "company" && isAdmin && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Company profile</h2>
                        <p className="text-sm text-muted-foreground">
                          The default letterhead used on quotations and invoices.
                        </p>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label>Company logo</Label>
                        <div className="flex items-center gap-3">
                          <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-md border border-border bg-accent/30">
                            {cLogo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="text-xs text-muted-foreground">No logo</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                              {cLogo ? "Change" : "Select logo"}
                            </Button>
                            {cLogo && (
                              <Button type="button" size="sm" variant="ghost" onClick={() => setCLogo(null)}>
                                <IconX className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => onPickImage(e.target.files?.[0], setCLogo)}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="set-cp-name">Company name</Label>
                        <Input id="set-cp-name" value={cName} onChange={(e) => setCName(e.target.value)} />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="set-cp-address">Address</Label>
                        <Textarea id="set-cp-address" rows={3} value={cAddress} onChange={(e) => setCAddress(e.target.value)} />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-cp-gstin">GSTIN</Label>
                          <Input id="set-cp-gstin" value={cGstin} onChange={(e) => setCGstin(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-cp-phone">Phone</Label>
                          <Input id="set-cp-phone" value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-cp-email">Email</Label>
                          <Input id="set-cp-email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-cp-website">Website</Label>
                          <Input id="set-cp-website" value={cWebsite} onChange={(e) => setCWebsite(e.target.value)} />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label>Authorized signature</Label>
                        <div className="flex items-center gap-3">
                          <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-md border border-border bg-accent/30">
                            {cSignature ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cSignature} alt="Signature" className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="text-xs text-muted-foreground">No signature</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => signInputRef.current?.click()}>
                              {cSignature ? "Change" : "Select image"}
                            </Button>
                            {cSignature && (
                              <Button type="button" size="sm" variant="ghost" onClick={() => setCSignature(null)}>
                                <IconX className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <input
                            ref={signInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => onPickImage(e.target.files?.[0], setCSignature)}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="set-cp-signatory">Signatory name</Label>
                        <Input
                          id="set-cp-signatory"
                          placeholder="Authorized Signatory"
                          value={cSignatory}
                          onChange={(e) => setCSignatory(e.target.value)}
                        />
                      </div>

                      <Button type="button" onClick={saveCompany} disabled={savingCompany} className="self-start">
                        {savingCompany ? "Saving..." : "Save profile"}
                      </Button>
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ComingSoon({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">Coming soon</p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

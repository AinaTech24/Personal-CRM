"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
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
  IconChevronDown,
  IconMoon,
  IconPower,
  IconShield,
  IconSliders,
  IconSun,
  IconTrash,
  IconUser,
  IconX,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 1_000_000;

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

const LANDING_PAGE_OPTIONS = [
  { value: "", label: "Dashboard" },
  { value: "/leads", label: "Leads" },
  { value: "/tasks", label: "Tasks" },
  { value: "/projects", label: "Projects" },
  { value: "/quotations", label: "Quotations" },
  { value: "/invoices", label: "Invoices" },
];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
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

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
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

/** A collapsible sidebar category. The height animation needs `auto`, so the
    items live in an inner div — animating height on the padded wrapper itself
    would jitter as the padding collapses. */
function NavGroup({
  title,
  items,
  isOpen,
  onToggle,
  section,
  onSelect,
}: {
  title: string;
  items: NavItem[];
  isOpen: boolean;
  onToggle: () => void;
  section: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        {title}
        <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
          <IconChevronDown className="h-3 w-3" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 pt-0.5">
              {items.map((item) => (
                <NavButton key={item.id} item={item} active={section === item.id} onSelect={onSelect} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface NotificationPref {
  category: string;
  label: string;
  description: string;
  inApp: boolean;
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
}

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
  const [savingPreferences, setSavingPreferences] = useState(false);

  const [openGroups, setOpenGroups] = useState({ personal: true, workspace: true });

  // Profile
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Preferences
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [defaultLandingPage, setDefaultLandingPage] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState<NotificationPref[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(false);

  // Security
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

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
          setTimezone(u.timezone ?? "Asia/Kolkata");
          setDefaultLandingPage(u.defaultLandingPage ?? "");
          setDensity(u.density === "compact" ? "compact" : "comfortable");
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

  // Notification preferences, loaded lazily.
  useEffect(() => {
    if (!open || section !== "notifications" || notifPrefs.length > 0) return;
    setLoadingNotif(true);
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((data) => setNotifPrefs(data.preferences ?? []))
      .catch(() => {})
      .finally(() => setLoadingNotif(false));
  }, [open, section, notifPrefs.length]);

  // Active sessions, loaded lazily.
  useEffect(() => {
    if (!open || section !== "security") return;
    setLoadingSessions(true);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions ?? []))
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, [open, section]);

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

  async function savePreferences() {
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, defaultLandingPage: defaultLandingPage || null, density }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save preferences", data.error);
      document.documentElement.dataset.density = density;
      toast.success("Preferences saved");
    } finally {
      setSavingPreferences(false);
    }
  }

  // Optimistic — the toggle flips instantly and rolls back if the save fails.
  async function toggleNotifPref(category: string, inApp: boolean) {
    setNotifPrefs((prev) => prev.map((p) => (p.category === category ? { ...p, inApp } : p)));
    const res = await fetch("/api/notification-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, inApp }),
    }).catch(() => null);
    if (!res?.ok) {
      setNotifPrefs((prev) => prev.map((p) => (p.category === category ? { ...p, inApp: !inApp } : p)));
      toast.error("Couldn't update notification setting");
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

  async function revokeSession(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return toast.error("Couldn't sign out that device");
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Signed out");
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeOthers() {
    setRevokingOthers(true);
    try {
      const res = await fetch("/api/sessions/revoke-others", { method: "POST" });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't sign out other devices");
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      toast.success(data.revoked > 0 ? `Signed out ${data.revoked} other device${data.revoked === 1 ? "" : "s"}` : "No other devices to sign out");
    } finally {
      setRevokingOthers(false);
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
            <NavGroup
              title="Personal"
              items={PERSONAL_ITEMS}
              isOpen={openGroups.personal}
              onToggle={() => setOpenGroups((prev) => ({ ...prev, personal: !prev.personal }))}
              section={section}
              onSelect={setSection}
            />
            {isAdmin && (
              <NavGroup
                title="Workspace"
                items={WORKSPACE_ITEMS}
                isOpen={openGroups.workspace}
                onToggle={() => setOpenGroups((prev) => ({ ...prev, workspace: !prev.workspace }))}
                section={section}
                onSelect={setSection}
              />
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

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-timezone">Timezone</Label>
                          <select
                            id="set-timezone"
                            className={selectClassName}
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                          >
                            {TIMEZONES.map((tz) => (
                              <option key={tz} value={tz}>
                                {tz}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-landing">Default landing page</Label>
                          <select
                            id="set-landing"
                            className={selectClassName}
                            value={defaultLandingPage}
                            onChange={(e) => setDefaultLandingPage(e.target.value)}
                          >
                            {LANDING_PAGE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-language">Language</Label>
                          <Tooltip label="More languages coming soon">
                            <select id="set-language" className={cn(selectClassName, "opacity-70")} value="en" disabled>
                              <option value="en">English</option>
                            </select>
                          </Tooltip>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-density">Density</Label>
                          <select
                            id="set-density"
                            className={selectClassName}
                            value={density}
                            onChange={(e) => setDensity(e.target.value as "comfortable" | "compact")}
                          >
                            <option value="comfortable">Comfortable</option>
                            <option value="compact">Compact</option>
                          </select>
                        </div>
                      </div>

                      <Button type="button" onClick={savePreferences} disabled={savingPreferences} className="self-start">
                        {savingPreferences ? "Saving..." : "Save preferences"}
                      </Button>
                    </>
                  )}

                  {section === "notifications" && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Notifications</h2>
                        <p className="text-sm text-muted-foreground">
                          Control which events notify you in-app.
                        </p>
                      </div>
                      {loadingNotif ? (
                        <div className="flex justify-center py-6">
                          <EightDotsRotate className="h-7 w-7" />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {notifPrefs.map((pref) => (
                            <div
                              key={pref.category}
                              className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                            >
                              <div>
                                <p className="text-sm font-medium">{pref.label}</p>
                                <p className="text-xs text-muted-foreground">{pref.description}</p>
                              </div>
                              <ToggleSwitch
                                checked={pref.inApp}
                                onChange={(v) => toggleNotifPref(pref.category, v)}
                                label={`Toggle ${pref.label} notifications`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground/70">
                        Email delivery, digest mode, and quiet hours are coming soon.
                      </p>
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

                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Active sessions</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={revokeOthers}
                            disabled={revokingOthers || sessions.length <= 1}
                          >
                            <IconPower className="h-3.5 w-3.5" />
                            {revokingOthers ? "Signing out..." : "Sign out everywhere else"}
                          </Button>
                        </div>
                        {loadingSessions ? (
                          <div className="flex justify-center py-4">
                            <EightDotsRotate className="h-6 w-6" />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {sessions.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                              >
                                <div>
                                  <p className="flex items-center gap-2 text-sm">
                                    {deviceLabel(s.userAgent)}
                                    {s.isCurrent && (
                                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                                        This device
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {s.ip ? `${s.ip} · ` : ""}Active {timeAgo(s.lastSeenAt)}
                                  </p>
                                </div>
                                {!s.isCurrent && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => revokeSession(s.id)}
                                    disabled={revokingId === s.id}
                                  >
                                    <IconTrash className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/70">
                        Two-factor authentication is coming soon.
                      </p>
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

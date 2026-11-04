"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonForm } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useToast } from "@/components/providers/toast-provider";
import { usePushNotifications } from "@/components/providers/use-push-notifications";
import { ThemeOptionRow } from "@/components/layout/theme-toggle";
import { birthYearRange } from "@/lib/birthdays";
import {
  IconBell,
  IconBuilding,
  IconBuildingCog,
  IconCalendar,
  IconChevronDown,
  IconExternalLink,
  IconListView,
  IconMail,
  IconPower,
  IconSettings,
  IconShield,
  IconSliders,
  IconTrash,
  IconUser,
  IconUserPlus,
  IconUsers,
  IconWallet,
  IconX,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 1_000_000;

/** Aina CRM runs on a single timezone — not a per-user choice, so it isn't editable. */
const APP_TIMEZONE = "Asia/Kolkata";

const LANGUAGE_OPTIONS = [{ value: "en", label: "English" }];

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DEPARTMENT_USER: "Department User",
};
function roleLabel(role: string, isDepartmentAdmin?: boolean) {
  if (role === "DEPARTMENT_USER" && isDepartmentAdmin) return "Department Admin";
  return ROLE_LABEL[role] ?? role;
}

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

/** Fallback shown only until /api/auth/me's user-specific landingPageOptions loads. */
const DEFAULT_LANDING_PAGE_OPTIONS = [{ value: "", label: "Dashboard" }];

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

/**
 * Turns push notifications on for this device.
 *
 * Deliberately per-device rather than per-account: the browser permission and
 * the push subscription both belong to the device, so someone can have their
 * phone buzz while their desk browser stays quiet.
 */
function PushToggle() {
  const { state, busy, error, enable, disable } = usePushNotifications();

  const detail: Record<typeof state, string> = {
    on: "This device will buzz when you get a message.",
    off: "Get a notification on this device when someone messages you.",
    denied: "Blocked in your browser settings — allow notifications for this site, then try again.",
    unconfigured: "Not set up on the server yet (the VAPID keys are missing).",
    unsupported:
      "This browser can't do push. On an iPhone, add the app to your home screen first, then turn it on from there.",
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <IconBell className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Push notifications on this device</p>
            <p className="text-xs text-muted-foreground">{busy ? "Working…" : detail[state]}</p>
          </div>
        </div>
        <ToggleSwitch
          checked={state === "on"}
          onChange={(v) => (v ? enable() : disable())}
          label="Toggle push notifications"
          disabled={busy || state === "unsupported" || state === "unconfigured" || state === "denied"}
        />
      </div>
      {/* The browser knows exactly why a subscription failed; hiding that made
          this undiagnosable from the UI alone. */}
      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Small reusable toggle switch, matching the one used on the SMTP settings page. */
type SectionId = "profile" | "preferences" | "notifications" | "security" | "company" | "department";

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

// "Workspace" is Company Admin/Super Admin only — company-wide config plus
// shortcuts into the full admin pages (Users, Permissions, etc.), which live
// as their own pages rather than being rebuilt inside this dialog.
const WORKSPACE_ITEMS: NavItem[] = [{ id: "company", label: "Workspace", icon: IconBuildingCog, adminOnly: true }];

// A Department Admin isn't a company Admin (isAdmin is false for them), but
// isn't a plain Department User either — they get their own lightweight
// Workspace tier instead of being treated as either extreme.
const DEPARTMENT_ITEMS: NavItem[] = [{ id: "department", label: "Department", icon: IconUsers }];

interface WorkspaceLink {
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_LINKS: WorkspaceLink[] = [
  { label: "Users & Invites", description: "Add, deactivate, or invite teammates", href: "/admin/users", icon: IconUserPlus },
  { label: "Permission Manager", description: "Grant module access per person", href: "/admin/permissions", icon: IconShield },
  { label: "Departments", description: "Create, rename, or remove departments", href: "/admin/departments", icon: IconBuilding },
  { label: "Email settings", description: "SMTP used for sign-in codes and invites", href: "/admin/email", icon: IconMail },
  { label: "App settings", description: "App URL and which modules are visible", href: "/admin/settings", icon: IconSettings },
  { label: "System logs", description: "Audit trail of admin actions", href: "/admin/logs", icon: IconListView },
];

// Shown to every Department Admin regardless of grants — the destination
// pages already scope to the caller's own department and 403/empty-state on
// their own if a company Admin hasn't actually granted that module.
const DEPARTMENT_LINKS: WorkspaceLink[] = [
  { label: "Permission Manager", description: "Grant module access to your department", href: "/admin/permissions", icon: IconShield },
  { label: "Leave approvals", description: "Review your department's leave requests", href: "/admin/leave", icon: IconCalendar },
  { label: "Expense approvals", description: "Review your department's expense claims", href: "/admin/expenses", icon: IconWallet },
];

/** A grid of shortcut tiles into full admin pages — this dialog stays for quick personal/workspace settings, not a rebuild of those pages. */
function WorkspaceLinkGrid({ links, onNavigate }: { links: WorkspaceLink[]; onNavigate: (href: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {links.map((l) => (
        <button
          key={l.href}
          type="button"
          onClick={() => onNavigate(l.href)}
          className="flex items-start gap-2.5 rounded-md border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <l.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-sm font-medium">
              {l.label}
              <IconExternalLink className="h-3 w-3 text-muted-foreground" />
            </p>
            <p className="text-xs text-muted-foreground">{l.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Buckets the flat Settings-category list into a few readable sections instead of one long uniform stack of 14 toggle rows. A category not covered by any bucket below still shows up, under "Other", instead of silently vanishing. */
const NOTIF_PREF_GROUPS: { title: string; categories: string[] }[] = [
  { title: "Work", categories: ["leads", "tasks", "projects", "meetings", "quotations", "forms", "consulting"] },
  { title: "Attendance & Leaves", categories: ["attendance", "leaves"] },
  { title: "Money", categories: ["expenses", "billing"] },
  { title: "People & Security", categories: ["social", "calls", "birthdays", "passwords"] },
];

function groupNotifPrefs(prefs: NotificationPref[]) {
  const byCategory = new Map(prefs.map((p) => [p.category, p]));
  const groups = NOTIF_PREF_GROUPS.map((g) => ({
    title: g.title,
    prefs: g.categories.map((c) => byCategory.get(c)).filter((p): p is NotificationPref => !!p),
  })).filter((g) => g.prefs.length > 0);
  const covered = new Set(NOTIF_PREF_GROUPS.flatMap((g) => g.categories));
  const rest = prefs.filter((p) => !covered.has(p.category));
  if (rest.length) groups.push({ title: "Other", prefs: rest });
  return groups;
}

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
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
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

interface PasskeyRow {
  id: string;
  name: string | null;
  deviceType: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function SettingsDialog({
  open,
  onOpenChange,
  isAdmin,
  isDepartmentAdmin = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  isDepartmentAdmin?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

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
  // "YYYY-MM-DD", or "" for none — same convention as DatePicker/the admin birthday editor.
  const [birthday, setBirthday] = useState("");
  const [designation, setDesignation] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);

  // Preferences
  const [defaultLandingPage, setDefaultLandingPage] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [landingPageOptions, setLandingPageOptions] = useState<{ value: string; label: string }[]>(
    DEFAULT_LANDING_PAGE_OPTIONS
  );

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState<NotificationPref[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("");
  const [quietHoursEnd, setQuietHoursEnd] = useState("");
  const [savingQuietHours, setSavingQuietHours] = useState(false);

  // Security
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const otherSessionCount = sessions.filter((s) => !s.isCurrent).length;
  const [notifyOnNewSignIn, setNotifyOnNewSignIn] = useState(true);

  // Department (Department Admins only)
  const [myDepartment, setMyDepartment] = useState<{ id: string; name: string; _count: { users: number } } | null>(null);
  const [loadingDepartment, setLoadingDepartment] = useState(false);

  // Passkeys
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [pendingPasskeyResponse, setPendingPasskeyResponse] = useState<RegistrationResponseJSON | null>(null);
  const [pendingPasskeyName, setPendingPasskeyName] = useState("");

  // Two-factor authentication (TOTP)
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpStage, setTotpStage] = useState<"collapsed" | "password" | "scan" | "codes">("collapsed");
  const [totpPassword, setTotpPassword] = useState("");
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [totpManualKey, setTotpManualKey] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[]>([]);
  const [totpBusy, setTotpBusy] = useState(false);
  const [showDisableTotp, setShowDisableTotp] = useState(false);
  const [disableTotpPassword, setDisableTotpPassword] = useState("");
  const [showRegenCodes, setShowRegenCodes] = useState(false);
  const [regenPassword, setRegenPassword] = useState("");
  const [regenBackupCodes, setRegenBackupCodes] = useState<string[] | null>(null);

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
    setCurrentPin("");
    setNewPin("");
    setTotpStage("collapsed");
    setTotpPassword("");
    setTotpCode("");
    setTotpQrCode(null);
    setTotpManualKey(null);
    setTotpBackupCodes([]);
    setShowDisableTotp(false);
    setDisableTotpPassword("");
    setShowRegenCodes(false);
    setRegenPassword("");
    setRegenBackupCodes(null);
    setPendingPasskeyResponse(null);
    setPendingPasskeyName("");
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
          setBirthday(u.birthday ? String(u.birthday).slice(0, 10) : "");
          setDesignation(u.designation ?? "");
          setDateOfJoining(u.dateOfJoining ? String(u.dateOfJoining).slice(0, 10) : "");
          setRole(u.role ?? "");
          setDepartmentId(u.departmentId ?? null);
          setDepartmentName(u.department?.name ?? null);
          setAvatarDataUrl(u.avatarDataUrl ?? null);
          setDefaultLandingPage(u.defaultLandingPage ?? "");
          setLandingPageOptions(
            Array.isArray(u.landingPageOptions) && u.landingPageOptions.length > 0
              ? u.landingPageOptions
              : DEFAULT_LANDING_PAGE_OPTIONS
          );
          setDensity(u.density === "compact" ? "compact" : "comfortable");
          setHasPin(!!u.hasPin);
          setTotpEnabled(!!u.totpEnabled);
          setNotifyOnNewSignIn(u.notifyOnNewSignIn ?? true);
          setQuietHoursStart(u.quietHoursStart ?? "");
          setQuietHoursEnd(u.quietHoursEnd ?? "");
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

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      // Leave the list as-is; the pane shows whatever loaded last.
    }
  }, []);

  // Active sessions, loaded lazily.
  useEffect(() => {
    if (!open || section !== "security") return;
    setLoadingSessions(true);
    loadSessions().finally(() => setLoadingSessions(false));
  }, [open, section, loadSessions]);

  const loadPasskeys = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/passkeys");
      const data = await res.json();
      setPasskeys(data.passkeys ?? []);
    } catch {
      // Leave the list as-is; the pane shows whatever loaded last.
    }
  }, []);

  // Passkeys, loaded lazily.
  useEffect(() => {
    if (!open || section !== "security") return;
    setLoadingPasskeys(true);
    loadPasskeys().finally(() => setLoadingPasskeys(false));
  }, [open, section, loadPasskeys]);

  // Own department (headcount etc.), loaded lazily — /api/departments lists
  // every department, not just the caller's own, so this just picks theirs
  // out of that list rather than needing a dedicated single-department route.
  useEffect(() => {
    if (!open || !isDepartmentAdmin || section !== "department" || myDepartment || !departmentId) return;
    setLoadingDepartment(true);
    fetch("/api/departments")
      .then((r) => r.json())
      .then((data) => {
        const list: { id: string; name: string; _count: { users: number } }[] = data.departments ?? [];
        setMyDepartment(list.find((d) => d.id === departmentId) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingDepartment(false));
  }, [open, isDepartmentAdmin, section, myDepartment, departmentId]);

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
        body: JSON.stringify({
          name,
          surname: surname || null,
          mobile: mobile || null,
          avatarDataUrl,
          birthday: birthday || null,
          ...(designation && { designation }),
          ...(dateOfJoining && { dateOfJoining }),
        }),
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
        body: JSON.stringify({ defaultLandingPage: defaultLandingPage || null, density }),
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

  async function saveQuietHours() {
    setSavingQuietHours(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quietHoursStart: quietHoursStart || null, quietHoursEnd: quietHoursEnd || null }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save quiet hours", data.error);
      toast.success(quietHoursStart ? "Quiet hours saved" : "Quiet hours turned off");
    } finally {
      setSavingQuietHours(false);
    }
  }

  function clearQuietHours() {
    setQuietHoursStart("");
    setQuietHoursEnd("");
  }

  // Optimistic, same pattern as toggleNotifPref — instant, rolls back on failure.
  async function toggleNotifyOnNewSignIn(v: boolean) {
    setNotifyOnNewSignIn(v);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyOnNewSignIn: v }),
    }).catch(() => null);
    if (!res?.ok) {
      setNotifyOnNewSignIn(!v);
      toast.error("Couldn't update sign-in alert setting");
    }
  }

  /** Workspace/Department shortcut tiles leave the dialog for a full admin page. */
  function goTo(href: string) {
    onOpenChange(false);
    router.push(href);
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

  async function savePin() {
    if (!/^\d{6}$/.test(newPin)) {
      toast.error("PIN must be exactly 6 digits");
      return;
    }
    if (hasPin && !currentPin) {
      toast.error("Enter your current PIN to set a new one");
      return;
    }
    if (!mobile) {
      toast.error("Add a mobile number first", "A PIN signs in with your mobile number.");
      return;
    }
    setSavingPin(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: hasPin ? currentPin : undefined, newPin }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't set PIN", data.error);
      toast.success(hasPin ? "PIN changed" : "PIN set");
      setHasPin(true);
      setCurrentPin("");
      setNewPin("");
    } finally {
      setSavingPin(false);
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
      // Refetch rather than filtering locally: the server decides which session
      // is current, and dropping every row that isn't flagged current here would
      // blank the list if that flag were ever wrong.
      await loadSessions();
      toast.success(`Signed out ${data.revoked} other device${data.revoked === 1 ? "" : "s"}`);
    } finally {
      setRevokingOthers(false);
    }
  }

  async function startAddPasskey() {
    setAddingPasskey(true);
    try {
      const optionsRes = await fetch("/api/profile/passkeys/register-options", { method: "POST" });
      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) return toast.error("Couldn't start passkey setup", optionsData.error);

      const { startRegistration } = await import("@simplewebauthn/browser");
      try {
        const response = await startRegistration({
          optionsJSON: optionsData.options as Parameters<typeof startRegistration>[0]["optionsJSON"],
        });
        setPendingPasskeyResponse(response);
        setPendingPasskeyName(deviceLabel(navigator.userAgent));
      } catch {
        // User cancelled the browser's passkey prompt — not a real error.
      }
    } finally {
      setAddingPasskey(false);
    }
  }

  async function savePendingPasskey() {
    if (!pendingPasskeyResponse) return;
    setAddingPasskey(true);
    try {
      const res = await fetch("/api/profile/passkeys/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: pendingPasskeyResponse, name: pendingPasskeyName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't add passkey", data.error);
      toast.success("Passkey added");
      setPendingPasskeyResponse(null);
      setPendingPasskeyName("");
      await loadPasskeys();
    } finally {
      setAddingPasskey(false);
    }
  }

  async function removePasskey(id: string) {
    setRemovingPasskeyId(id);
    try {
      const res = await fetch("/api/profile/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return toast.error("Couldn't remove passkey");
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
      toast.success("Passkey removed");
    } finally {
      setRemovingPasskeyId(null);
    }
  }

  function cancelTotpSetup() {
    setTotpStage("collapsed");
    setTotpPassword("");
    setTotpCode("");
    setTotpQrCode(null);
    setTotpManualKey(null);
  }

  async function startTotpSetup() {
    if (!totpPassword) return toast.error("Enter your password");
    setTotpBusy(true);
    try {
      const res = await fetch("/api/profile/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: totpPassword }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't start setup", data.error);
      setTotpQrCode(data.qrCodeDataUrl);
      setTotpManualKey(data.secret);
      setTotpStage("scan");
    } finally {
      setTotpBusy(false);
    }
  }

  async function confirmTotpSetup() {
    if (!/^\d{6}$/.test(totpCode)) return toast.error("Enter the 6-digit code");
    setTotpBusy(true);
    try {
      const res = await fetch("/api/profile/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't verify code", data.error);
      setTotpBackupCodes(data.backupCodes ?? []);
      setTotpStage("codes");
      setTotpEnabled(true);
    } finally {
      setTotpBusy(false);
    }
  }

  function finishTotpSetup() {
    setTotpStage("collapsed");
    setTotpPassword("");
    setTotpCode("");
    setTotpQrCode(null);
    setTotpManualKey(null);
    setTotpBackupCodes([]);
    toast.success("Two-factor authentication is on");
  }

  async function disableTotp() {
    if (!disableTotpPassword) return toast.error("Enter your password");
    setTotpBusy(true);
    try {
      const res = await fetch("/api/profile/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disableTotpPassword }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't disable", data.error);
      setTotpEnabled(false);
      setShowDisableTotp(false);
      setDisableTotpPassword("");
      toast.success("Two-factor authentication is off");
    } finally {
      setTotpBusy(false);
    }
  }

  async function regenerateBackupCodes() {
    if (!regenPassword) return toast.error("Enter your password");
    setTotpBusy(true);
    try {
      const res = await fetch("/api/profile/2fa/backup-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: regenPassword }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't regenerate codes", data.error);
      setRegenBackupCodes(data.backupCodes ?? []);
      setShowRegenCodes(false);
      setRegenPassword("");
    } finally {
      setTotpBusy(false);
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
          // Stacks on a phone: a 208px sidebar beside the content left barely
          // 180px for the form. dvh and the safe insets keep it clear of the
          // browser chrome and the home indicator.
          className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl h-[min(85dvh,calc(100dvh-var(--safe-top,0px)-var(--safe-bottom,0px)-2rem))] sm:flex-row"
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>

          {/* Phone: the sections become a scrollable strip across the top. */}
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card/40 px-2 py-2 pr-12 sm:hidden">
            {[...PERSONAL_ITEMS, ...(isAdmin ? WORKSPACE_ITEMS : isDepartmentAdmin ? DEPARTMENT_ITEMS : [])].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/5"
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>

          {/* Sidebar (tablet and up) */}
          <div className="hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card/40 p-3 sm:flex">
            <div className="flex items-center gap-2.5 px-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground">
                {avatarDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarDataUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IconUser className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name || "Settings"}</p>
                {role && (
                  <p className="truncate text-xs text-muted-foreground">
                    {roleLabel(role, isDepartmentAdmin)}
                    {departmentName ? ` · ${departmentName}` : ""}
                  </p>
                )}
              </div>
            </div>
            <NavGroup
              title="Personal"
              items={PERSONAL_ITEMS}
              isOpen={openGroups.personal}
              onToggle={() => setOpenGroups((prev) => ({ ...prev, personal: !prev.personal }))}
              section={section}
              onSelect={setSection}
            />
            {(isAdmin || isDepartmentAdmin) && (
              <NavGroup
                title="Workspace"
                items={isAdmin ? WORKSPACE_ITEMS : DEPARTMENT_ITEMS}
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

            <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+var(--safe-bottom,0px))] sm:p-6">
              {loading ? (
                <div className="w-full p-4">
                  <SkeletonForm fields={5} />
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
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-birthday">Date of birth</Label>
                          {birthday && !isAdmin ? (
                            <>
                              <Input
                                id="set-birthday"
                                readOnly
                                disabled
                                className="opacity-70"
                                value={new Date(`${birthday}T00:00:00`).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              />
                              <p className="text-xs text-muted-foreground">Set once — ask an admin to change it.</p>
                            </>
                          ) : (
                            <DatePicker
                              id="set-birthday"
                              value={birthday}
                              onChange={setBirthday}
                              placeholder="Add your birthday"
                              yearRange={birthYearRange()}
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-designation">Designation</Label>
                          {designation && !isAdmin ? (
                            <>
                              <Input id="set-designation" readOnly disabled className="opacity-70" value={designation} />
                              <p className="text-xs text-muted-foreground">Set once — ask an admin to change it.</p>
                            </>
                          ) : (
                            <Input
                              id="set-designation"
                              value={designation}
                              onChange={(e) => setDesignation(e.target.value)}
                              placeholder="e.g. Software Engineer"
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-doj">Date of joining</Label>
                          {dateOfJoining && !isAdmin ? (
                            <>
                              <Input
                                id="set-doj"
                                readOnly
                                disabled
                                className="opacity-70"
                                value={new Date(`${dateOfJoining}T00:00:00`).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              />
                              <p className="text-xs text-muted-foreground">Set once — ask an admin to change it.</p>
                            </>
                          ) : (
                            <DatePicker
                              id="set-doj"
                              value={dateOfJoining}
                              onChange={setDateOfJoining}
                              placeholder="Add your date of joining"
                              yearRange={{ from: new Date().getFullYear() - 15, to: new Date().getFullYear() }}
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Role</p>
                          <p className="text-sm font-medium">{roleLabel(role, isDepartmentAdmin)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Department</p>
                          <p className="text-sm font-medium">{departmentName ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Designation</p>
                          <p className="text-sm font-medium">{designation || "—"}</p>
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
                      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">Theme</p>
                          <p className="text-xs text-muted-foreground">
                            Light, dark, or match your device&apos;s setting.
                          </p>
                        </div>
                        <ThemeOptionRow />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label>Timezone</Label>
                          <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
                            {APP_TIMEZONE} (IST)
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-landing">Default landing page</Label>
                          <Dropdown
                            id="set-landing"
                            value={defaultLandingPage}
                            onChange={setDefaultLandingPage}
                            options={landingPageOptions}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-language">Language</Label>
                          <Dropdown id="set-language" value="en" onChange={() => {}} options={LANGUAGE_OPTIONS} disabled />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="set-density">Density</Label>
                          <Dropdown
                            id="set-density"
                            value={density}
                            onChange={(v) => setDensity(v as "comfortable" | "compact")}
                            options={DENSITY_OPTIONS}
                          />
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

                      <PushToggle />

                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">Quiet hours</p>
                          <p className="text-xs text-muted-foreground">
                            Mute push notifications during a daily window — the in-app list and bell still fill up as
                            normal, so nothing&apos;s missed, it just won&apos;t buzz.
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:w-72">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="quiet-start">From</Label>
                            <Input
                              id="quiet-start"
                              type="time"
                              value={quietHoursStart}
                              onChange={(e) => setQuietHoursStart(e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="quiet-end">To</Label>
                            <Input
                              id="quiet-end"
                              type="time"
                              value={quietHoursEnd}
                              onChange={(e) => setQuietHoursEnd(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" onClick={saveQuietHours} disabled={savingQuietHours}>
                            {savingQuietHours ? "Saving..." : "Save"}
                          </Button>
                          {(quietHoursStart || quietHoursEnd) && (
                            <Button type="button" size="sm" variant="ghost" onClick={clearQuietHours}>
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {loadingNotif ? (
                        <div className="w-full">
                          <SkeletonForm fields={5} />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {groupNotifPrefs(notifPrefs).map((group) => (
                            <div key={group.title} className="flex flex-col gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{group.title}</p>
                              {group.prefs.map((pref) => (
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
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground/70">Email delivery and a daily/weekly digest are coming soon.</p>
                    </>
                  )}

                  {section === "security" && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Security</h2>
                        <p className="text-sm text-muted-foreground">Manage your password and account security.</p>
                      </div>

                      <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                        <div className="flex items-center gap-2.5">
                          <IconMail className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Email me on a new sign-in</p>
                            <p className="text-xs text-muted-foreground">
                              A quick alert to {email || "your email"} whenever this account signs in somewhere new.
                            </p>
                          </div>
                        </div>
                        <ToggleSwitch
                          checked={notifyOnNewSignIn}
                          onChange={toggleNotifyOnNewSignIn}
                          label="Toggle new sign-in email alerts"
                        />
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
                        <div>
                          <p className="text-sm font-medium">{hasPin ? "Change PIN" : "Set a sign-in PIN"}</p>
                          <p className="text-xs text-muted-foreground">
                            An alternate way in with your mobile number instead of email and password.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {hasPin && (
                            <div className="flex flex-col gap-1.5">
                              <Label htmlFor="set-cur-pin">Current PIN</Label>
                              <Input
                                id="set-cur-pin"
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={currentPin}
                                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                                autoComplete="current-password"
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="set-new-pin">New PIN</Label>
                            <Input
                              id="set-new-pin"
                              type="password"
                              inputMode="numeric"
                              maxLength={6}
                              value={newPin}
                              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                              autoComplete="new-password"
                              placeholder="6 digits"
                            />
                          </div>
                        </div>
                        <Button type="button" size="sm" onClick={savePin} disabled={savingPin} className="self-start">
                          {savingPin ? "Saving..." : hasPin ? "Change PIN" : "Set PIN"}
                        </Button>
                      </div>

                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Active sessions</p>
                          {otherSessionCount > 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={revokeOthers}
                              disabled={revokingOthers}
                            >
                              <IconPower className="h-3.5 w-3.5" />
                              {revokingOthers
                                ? "Signing out..."
                                : `Sign out ${otherSessionCount} other device${otherSessionCount === 1 ? "" : "s"}`}
                            </Button>
                          ) : (
                            // A permanently greyed-out button reads as broken. When there's
                            // nothing to sign out, say so instead of showing a dead control.
                            !loadingSessions && (
                              <p className="text-xs text-muted-foreground">Only this device is signed in</p>
                            )
                          )}
                        </div>
                        {loadingSessions ? (
                          <div className="w-full">
                            <SkeletonForm fields={5} />
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
                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Passkeys</p>
                            <p className="text-xs text-muted-foreground">
                              Sign in with this device&apos;s fingerprint, face, or screen unlock instead of a password.
                            </p>
                          </div>
                          {!pendingPasskeyResponse && (
                            <Button type="button" size="sm" variant="outline" onClick={startAddPasskey} disabled={addingPasskey}>
                              {addingPasskey ? "Adding..." : "Add a passkey"}
                            </Button>
                          )}
                        </div>

                        {pendingPasskeyResponse && (
                          <div className="flex flex-col gap-2 rounded-md border border-border/70 p-2.5 sm:flex-row sm:items-end sm:gap-3">
                            <div className="flex flex-1 flex-col gap-1.5">
                              <Label htmlFor="passkey-name">Name this passkey</Label>
                              <Input
                                id="passkey-name"
                                value={pendingPasskeyName}
                                onChange={(e) => setPendingPasskeyName(e.target.value)}
                                placeholder="e.g. Work laptop"
                                maxLength={60}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={savePendingPasskey} disabled={addingPasskey}>
                                {addingPasskey ? "Saving..." : "Save"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setPendingPasskeyResponse(null);
                                  setPendingPasskeyName("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {loadingPasskeys ? (
                          <div className="w-full">
                            <SkeletonForm fields={2} />
                          </div>
                        ) : passkeys.length === 0 ? (
                          !pendingPasskeyResponse && (
                            <p className="text-xs text-muted-foreground">No passkeys added yet.</p>
                          )
                        ) : (
                          <div className="flex flex-col gap-2">
                            {passkeys.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                              >
                                <div>
                                  <p className="text-sm">{p.name || "Passkey"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Added {new Date(p.createdAt).toLocaleDateString()}
                                    {p.lastUsedAt ? ` · Last used ${timeAgo(p.lastUsedAt)}` : ""}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removePasskey(p.id)}
                                  disabled={removingPasskeyId === p.id}
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Two-factor authentication</p>
                            <p className="text-xs text-muted-foreground">
                              {totpEnabled
                                ? "On — password and PIN sign-in also ask for a code from your authenticator app."
                                : "Add a code from Google Authenticator, Microsoft Authenticator, or similar, as a second step at sign-in."}
                            </p>
                          </div>
                          {!totpEnabled && totpStage === "collapsed" && (
                            <Button type="button" size="sm" variant="outline" onClick={() => setTotpStage("password")}>
                              Enable
                            </Button>
                          )}
                        </div>

                        {totpStage === "password" && (
                          <div className="flex flex-col gap-2.5 rounded-md border border-border/70 p-2.5">
                            <div className="flex flex-col gap-1.5">
                              <Label htmlFor="totp-password">Confirm your password</Label>
                              <Input
                                id="totp-password"
                                type="password"
                                value={totpPassword}
                                onChange={(e) => setTotpPassword(e.target.value)}
                                autoComplete="current-password"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={startTotpSetup} disabled={totpBusy}>
                                {totpBusy ? "Starting..." : "Continue"}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={cancelTotpSetup}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {totpStage === "scan" && (
                          <div className="flex flex-col gap-3 rounded-md border border-border/70 p-2.5">
                            <p className="text-xs text-muted-foreground">
                              Scan this QR code with your authenticator app, or enter the key manually.
                            </p>
                            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                              {totpQrCode && (
                                // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not an optimizable remote image
                                <img
                                  src={totpQrCode}
                                  alt="Two-factor authentication QR code"
                                  className="h-40 w-40 rounded-md border border-border"
                                />
                              )}
                              <div className="flex flex-1 flex-col gap-2">
                                {totpManualKey && (
                                  <p className="break-all rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">{totpManualKey}</p>
                                )}
                                <div className="flex flex-col gap-1.5">
                                  <Label htmlFor="totp-code">6-digit code</Label>
                                  <Input
                                    id="totp-code"
                                    inputMode="numeric"
                                    maxLength={6}
                                    className="tracking-[0.3em]"
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button type="button" size="sm" onClick={confirmTotpSetup} disabled={totpBusy}>
                                    {totpBusy ? "Verifying..." : "Verify & enable"}
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" onClick={cancelTotpSetup}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {totpStage === "codes" && (
                          <div className="flex flex-col gap-2.5 rounded-md border border-border/70 p-2.5">
                            <p className="text-xs text-muted-foreground">
                              Save these backup codes somewhere safe. Each works once to sign in if you lose your
                              authenticator app. They won&apos;t be shown again.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 rounded-md bg-muted p-2.5 font-mono text-sm">
                              {totpBackupCodes.map((c) => (
                                <span key={c}>{c}</span>
                              ))}
                            </div>
                            <Button type="button" size="sm" onClick={finishTotpSetup} className="self-start">
                              Done
                            </Button>
                          </div>
                        )}

                        {totpEnabled && totpStage === "collapsed" && (
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setShowRegenCodes((v) => !v)}>
                              Regenerate backup codes
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setShowDisableTotp((v) => !v)}>
                              Disable
                            </Button>
                          </div>
                        )}

                        {showRegenCodes && !regenBackupCodes && (
                          <div className="flex flex-col gap-2.5 rounded-md border border-border/70 p-2.5">
                            <div className="flex flex-col gap-1.5">
                              <Label htmlFor="regen-password">Confirm your password</Label>
                              <Input
                                id="regen-password"
                                type="password"
                                value={regenPassword}
                                onChange={(e) => setRegenPassword(e.target.value)}
                                autoComplete="current-password"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={regenerateBackupCodes} disabled={totpBusy}>
                                {totpBusy ? "Generating..." : "Regenerate"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setShowRegenCodes(false);
                                  setRegenPassword("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {regenBackupCodes && (
                          <div className="flex flex-col gap-2.5 rounded-md border border-border/70 p-2.5">
                            <p className="text-xs text-muted-foreground">
                              Your old backup codes no longer work. Save these new ones — they won&apos;t be shown
                              again.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 rounded-md bg-muted p-2.5 font-mono text-sm">
                              {regenBackupCodes.map((c) => (
                                <span key={c}>{c}</span>
                              ))}
                            </div>
                            <Button type="button" size="sm" onClick={() => setRegenBackupCodes(null)} className="self-start">
                              Done
                            </Button>
                          </div>
                        )}

                        {showDisableTotp && (
                          <div className="flex flex-col gap-2.5 rounded-md border border-border/70 p-2.5">
                            <div className="flex flex-col gap-1.5">
                              <Label htmlFor="disable-totp-password">Confirm your password</Label>
                              <Input
                                id="disable-totp-password"
                                type="password"
                                value={disableTotpPassword}
                                onChange={(e) => setDisableTotpPassword(e.target.value)}
                                autoComplete="current-password"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" variant="destructive" onClick={disableTotp} disabled={totpBusy}>
                                {totpBusy ? "Disabling..." : "Disable 2FA"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setShowDisableTotp(false);
                                  setDisableTotpPassword("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {section === "company" && isAdmin && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Workspace</h2>
                        <p className="text-sm text-muted-foreground">Company-wide configuration and shortcuts.</p>
                      </div>

                      <WorkspaceLinkGrid links={ADMIN_LINKS} onNavigate={goTo} />

                      <div className="flex flex-col gap-1.5 border-t border-border pt-5">
                        <h3 className="text-sm font-semibold">Company profile</h3>
                        <p className="text-xs text-muted-foreground">
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

                  {section === "department" && isDepartmentAdmin && (
                    <>
                      <div>
                        <h2 className="text-base font-semibold">Department</h2>
                        <p className="text-sm text-muted-foreground">Quick access to what you manage as a Department Admin.</p>
                      </div>

                      <div className="rounded-md border border-border p-3">
                        {loadingDepartment ? (
                          <SkeletonForm fields={1} />
                        ) : myDepartment ? (
                          <div>
                            <p className="text-sm font-medium">{myDepartment.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {myDepartment._count.users} {myDepartment._count.users === 1 ? "person" : "people"}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Couldn&apos;t load your department.</p>
                        )}
                      </div>

                      <WorkspaceLinkGrid links={DEPARTMENT_LINKS} onNavigate={goTo} />

                      <p className="text-xs text-muted-foreground/70">
                        Leave and Expense approvals only show anything if a company Admin has granted you that module
                        in Permission Manager.
                      </p>
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

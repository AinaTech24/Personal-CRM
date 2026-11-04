"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconBuildingCog, IconLogOut, IconPencil, IconSettings, IconTrash, IconUser } from "@/components/icons";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

const MAX_STATUS_LENGTH = 100;

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DEPARTMENT_USER: "Department User",
};

/** Department Admin is a flag on top of the DEPARTMENT_USER role (see User.isDepartmentAdmin), not its own role value — label it distinctly, same precedence everywhere else in the app checks it: Super Admin, then Admin, then Department Admin, then plain Department User. */
function roleLabel(role: string | null, isDepartmentAdmin: boolean): string | null {
  if (!role) return null;
  if (role === "DEPARTMENT_USER" && isDepartmentAdmin) return "Department Admin";
  return ROLE_LABEL[role] ?? role;
}

export function UserMenu({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isDepartmentAdmin, setIsDepartmentAdmin] = useState(false);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [designation, setDesignation] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusEditing, setStatusEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const statusInputRef = useRef<HTMLInputElement>(null);

  // Load the current user's avatar + role/department/designation/status for the menu.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setAvatar(d.user?.avatarDataUrl ?? null);
        setRole(d.user?.role ?? null);
        setIsDepartmentAdmin(!!d.user?.isDepartmentAdmin);
        setDepartmentName(d.user?.department?.name ?? null);
        setDesignation(d.user?.designation ?? null);
        setStatus(d.user?.status ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (statusEditing) statusInputRef.current?.select();
  }, [statusEditing]);

  async function onLogout() {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      // Don't send them to /login on failure: the cookie would still be live, so
      // they'd be bounced straight back and look logged in again for no reason.
      if (!res.ok) return toast.error("Couldn't log out", "Please try again.");
      toast.success("Signed out", "You've been signed out on this device.");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Couldn't log out", "Check your connection and try again.");
    }
  }

  function refreshAvatar() {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setAvatar(d.user?.avatarDataUrl ?? null);
        setRole(d.user?.role ?? null);
        setIsDepartmentAdmin(!!d.user?.isDepartmentAdmin);
        setDepartmentName(d.user?.department?.name ?? null);
        setDesignation(d.user?.designation ?? null);
        setStatus(d.user?.status ?? null);
      })
      .catch(() => {});
  }

  function startEditingStatus() {
    setStatusDraft(status ?? "");
    setStatusEditing(true);
  }

  async function saveStatus(value: string | null) {
    const trimmed = value?.trim() || null;
    if (trimmed === status) {
      setStatusEditing(false);
      return;
    }
    setSavingStatus(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: trimmed }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't update status", d.error);
      setStatus(trimmed);
      setStatusEditing(false);
    } catch {
      toast.error("Couldn't update status", "Check your connection and try again.");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <Tooltip label="Account" side="bottom">
          <DropdownMenu.Trigger asChild>
            <button
              aria-label="Account menu"
              className={cn(
                // Same Radix focus-restoration quirk as the theme toggle —
                // closing the menu refocuses this trigger even after a plain
                // mouse click, lighting up the global focus ring for it.
                "flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border outline-none focus-visible:outline-none",
                avatar ? "bg-transparent" : "bg-primary text-primary-foreground"
              )}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="Profile" className="h-full w-full rounded-full object-contain" />
              ) : (
                <IconUser className="h-5 w-5" />
              )}
            </button>
          </DropdownMenu.Trigger>
        </Tooltip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 w-64 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex items-center gap-3 px-3.5 py-3.5">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border",
                  avatar ? "bg-transparent" : "bg-primary text-primary-foreground"
                )}
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IconUser className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            </div>
            {(role || departmentName || designation) && (
              <div className="flex flex-col gap-1 px-3.5 pb-3.5">
                {role && (
                  <Badge className="w-fit px-1.5 py-0 text-[10px] uppercase tracking-wide">
                    {roleLabel(role, isDepartmentAdmin)}
                  </Badge>
                )}
                {(designation || departmentName) && (
                  <p className="text-xs text-muted-foreground">
                    {designation}
                    {designation && departmentName ? " · " : ""}
                    {departmentName}
                  </p>
                )}
              </div>
            )}
            <div className="px-3.5 pb-3.5">
              {statusEditing ? (
                <input
                  ref={statusInputRef}
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  onBlur={() => saveStatus(statusDraft)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveStatus(statusDraft);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setStatusEditing(false);
                    }
                  }}
                  disabled={savingStatus}
                  maxLength={MAX_STATUS_LENGTH}
                  placeholder="Set a status…"
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              ) : status ? (
                <div className="group/status flex items-center gap-1 rounded-md px-0.5">
                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{status}</p>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/status:opacity-100">
                    <Tooltip label="Edit status" side="bottom">
                      <button
                        type="button"
                        aria-label="Edit status"
                        onClick={startEditingStatus}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                      >
                        <IconPencil className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Remove status" side="bottom">
                      <button
                        type="button"
                        aria-label="Remove status"
                        onClick={() => saveStatus(null)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startEditingStatus}
                  className="text-xs text-muted-foreground outline-none hover:text-foreground hover:underline"
                >
                  + Set a status
                </button>
              )}
            </div>
            <DropdownMenu.Separator className="h-px bg-border" />
            <div className="p-1.5">
              <DropdownMenu.Item
                onSelect={() => setSettingsOpen(true)}
                className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none hover:bg-primary/5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <IconSettings className="h-4 w-4" />
                </span>
                Settings
              </DropdownMenu.Item>
              {isAdmin && (
                <DropdownMenu.Item
                  onSelect={() => router.push("/admin/settings")}
                  className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none hover:bg-primary/5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <IconBuildingCog className="h-4 w-4" />
                  </span>
                  Application
                </DropdownMenu.Item>
              )}
            </div>
            <DropdownMenu.Separator className="h-px bg-border" />
            <div className="p-1.5">
              <DropdownMenu.Item
                onSelect={() => setLogoutOpen(true)}
                className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none hover:bg-destructive/5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-destructive/10 group-hover:text-destructive">
                  <IconLogOut className="h-4 w-4" />
                </span>
                Log out
              </DropdownMenu.Item>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} isAdmin={isAdmin} onSaved={refreshAvatar} />

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Log out?"
        description={`You'll be signed out of ${email} on this device and returned to the sign-in screen.`}
        confirmLabel="Log out"
        loadingLabel="Logging out..."
        onConfirm={onLogout}
      />
    </>
  );
}

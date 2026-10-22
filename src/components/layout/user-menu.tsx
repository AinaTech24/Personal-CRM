"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconBuildingCog, IconLogOut, IconSettings, IconUser } from "@/components/icons";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DEPARTMENT_USER: "Department User",
};

export function UserMenu({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [designation, setDesignation] = useState<string | null>(null);

  // Load the current user's avatar + role/department/designation for the menu.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setAvatar(d.user?.avatarDataUrl ?? null);
        setRole(d.user?.role ?? null);
        setDepartmentName(d.user?.department?.name ?? null);
        setDesignation(d.user?.designation ?? null);
      })
      .catch(() => {});
  }, []);

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
        setDepartmentName(d.user?.department?.name ?? null);
        setDesignation(d.user?.designation ?? null);
      })
      .catch(() => {});
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
                    {ROLE_LABEL[role] ?? role}
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

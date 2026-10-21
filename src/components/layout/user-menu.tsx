"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconLogOut, IconSettings, IconUser } from "@/components/icons";
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
                "flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border",
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
            className="z-50 w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
          >
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{email}</p>
              {(role || departmentName || designation) && (
                <div className="mt-2 flex flex-col gap-1">
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
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={() => setSettingsOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5"
            >
              <IconSettings className="h-3.5 w-3.5" />
              Settings
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => setLogoutOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-primary/5"
            >
              <IconLogOut className="h-3.5 w-3.5" />
              Log out
            </DropdownMenu.Item>
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

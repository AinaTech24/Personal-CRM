import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { CommandPalette } from "@/components/layout/command-palette";

export function Topbar({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end gap-1.5 border-b border-border bg-background px-5">
      <CommandPalette />
      <ThemeToggle />
      <NotificationBell />
      <UserMenu name={name} email={email} isAdmin={isAdmin} />
    </header>
  );
}

import Image from "next/image";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { CommandPalette } from "@/components/layout/command-palette";
import { IconMenu } from "@/components/icons";

export function Topbar({
  name,
  email,
  isAdmin,
  onOpenMenu,
}: {
  name: string;
  email: string;
  isAdmin: boolean;
  onOpenMenu?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-background px-3 sm:px-5">
      {/* On mobile the sidebar lives in a drawer, opened from here. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <IconMenu className="h-5 w-5" />
      </button>
      <Image src="/logo.png" alt="Aina CRM" width={72} height={30} priority unoptimized className="h-6 w-auto md:hidden" />

      <div className="ml-auto flex items-center gap-1.5">
        <CommandPalette />
        <ThemeToggle />
        <NotificationBell />
        <UserMenu name={name} email={email} isAdmin={isAdmin} />
      </div>
    </header>
  );
}

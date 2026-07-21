"use client";

import { cn } from "@/lib/utils";

/**
 * A read-only person field (e.g. "Assigned by") that shows the photo next to
 * the name, matching how people appear in the user dropdowns.
 */
export function UserField({
  name,
  avatarDataUrl,
  id,
  className,
}: {
  name: string;
  avatarDataUrl?: string | null;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm text-muted-foreground",
        className
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
        {avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          (name.trim()[0] ?? "?").toUpperCase()
        )}
      </span>
      <span className="truncate">{name}</span>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavGroup {
  label: string;
  items: { table: string; label: string; code: string }[];
}

/** The Command Centre's own module list: a side column on desktop, a picker on phones. */
export function ModuleNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = pathname.split("/")[2] ?? "";
  const all = groups.flatMap((g) => g.items);
  return (
    <>
      <select
        aria-label="Command Centre module"
        value={current}
        onChange={(e) => router.push(e.target.value ? `/consulting/${e.target.value}` : "/consulting")}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm lg:hidden"
      >
        <option value="">Overview</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((i) => (
              <option key={i.table} value={i.table}>
                {i.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <nav className="hidden flex-col gap-4 lg:flex" aria-label="Command Centre modules">
        <Link
          href="/consulting"
          className={cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-primary/5", current === "" && "bg-primary/10 text-primary")}
        >
          Overview
        </Link>
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
            {g.items.map((i) => (
              <Link
                key={i.table}
                href={`/consulting/${i.table}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-primary/5",
                  current === i.table && "bg-primary/10 font-medium text-primary"
                )}
              >
                <span className="truncate">{i.label}</span>
                <span className="text-[10px] text-muted-foreground">{i.code}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <span className="sr-only">{all.length} modules</span>
    </>
  );
}

"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface MultiUserSelectUser {
  id: string;
  name: string;
  email?: string;
}

/**
 * A scrollable checkbox list for picking several people at once — e.g. a
 * task/project/meeting's assignees. Originally the meeting attendee picker's
 * own inline markup; pulled out once Tasks and Projects needed the exact
 * same thing for their own multi-assignee pickers.
 */
export function MultiUserSelect({
  users,
  selectedIds,
  onChange,
  disabled = false,
  emptyLabel = "No users to add.",
  className,
}: {
  users: MultiUserSelectUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const selected = new Set(selectedIds);

  function toggle(id: string) {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <div className={cn("max-h-52 max-w-sm overflow-y-auto rounded-md border border-border", className)}>
      {users.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        users.map((u) => (
          <label
            key={u.id}
            className={cn(
              "flex items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0",
              !disabled && "cursor-pointer hover:bg-primary/5"
            )}
          >
            <Checkbox checked={selected.has(u.id)} onChange={() => toggle(u.id)} aria-label={`Toggle ${u.name}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm">{u.name}</span>
              {u.email && <span className="block truncate text-xs text-muted-foreground">{u.email}</span>}
            </span>
          </label>
        ))
      )}
    </div>
  );
}

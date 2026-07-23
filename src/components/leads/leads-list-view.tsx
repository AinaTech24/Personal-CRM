"use client";

import { Badge } from "@/components/ui/badge";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { LEAD_STATUSES, MEETING_STATUS_OPTIONS, type LeadSummary } from "@/components/leads/types";
import { cn } from "@/lib/utils";

const PRIORITY_VARIANT = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
} as const;

function statusLabel(status: string) {
  return LEAD_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function meetingStatusLabel(status: string | null) {
  if (!status) return "—";
  return MEETING_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function LeadsListView({
  leads,
  onSelect,
  selectedIds,
  onToggleSelect,
  rowActions,
}: {
  leads: LeadSummary[];
  onSelect: (lead: LeadSummary) => void;
  selectedIds?: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Per-row actions menu; omit to hide the actions column. */
  rowActions?: (lead: LeadSummary) => RowAction[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border focus:outline-none">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="w-10 px-4 py-2.5" />
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Company</th>
            <th className="px-4 py-2.5 font-medium">Product</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Priority</th>
            <th className="px-4 py-2.5 font-medium">Meeting</th>
            <th className="px-4 py-2.5 font-medium">Assigned to</th>
            {rowActions && <th className="w-10 px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const selected = selectedIds?.has(lead.id) ?? false;
            return (
              <tr
                key={lead.id}
                onClick={() => onSelect(lead)}
                className={cn(
                  "group cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5",
                  selected && "bg-accent/40"
                )}
              >
                <td className="w-10 px-4 py-2.5">
                  <HoverCheckbox
                    checked={selected}
                    reveal="fade"
                    onChange={() => onToggleSelect(lead.id)}
                    aria-label={`Select ${lead.name}`}
                  />
                </td>
                <td className="px-4 py-2.5 font-medium">{lead.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{lead.company ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{lead.product ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{statusLabel(lead.status)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={PRIORITY_VARIANT[lead.priority]}>{lead.priority}</Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{meetingStatusLabel(lead.meetingStatus)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {lead.assignedTo ? lead.assignedTo.name : "Unassigned"}
                </td>
                {rowActions && (
                  <td className="px-4 py-2.5">
                    <span className="flex justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <RowActionsMenu actions={rowActions(lead)} label={`Actions for ${lead.name}`} />
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
          {leads.length === 0 && (
            <tr>
              <td colSpan={rowActions ? 9 : 8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No leads found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

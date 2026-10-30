"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { userOptionLabel } from "@/lib/user-display";
import { useDragAutoScroll } from "@/hooks/use-drag-auto-scroll";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilterMenu, type FilterFacet } from "@/components/ui/filter-menu";
import { filterValueToParam, UNASSIGNED, type FilterValue } from "@/lib/filter-utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonBoard } from "@/components/ui/skeleton";
import { HoverCheckbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/ui/selection-bar";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { HorizontalScrollbar } from "@/components/ui/horizontal-scrollbar";
import { RecencyBadge } from "@/components/ui/recency-badge";
import { IconPencil, IconTrash, IconBell, IconCopy } from "@/components/icons";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";
import { LeadDetailDialog } from "@/components/leads/lead-detail-dialog";
import { LeadsListView } from "@/components/leads/leads-list-view";
import { GlobalSearchBar } from "@/components/layout/global-search-bar";
import { useSearch } from "@/components/providers/search-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import {
  getLeadStatusOptions,
  MEETING_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  type AssignableUser,
  type LeadStatus,
  type LeadSummary,
} from "@/components/leads/types";
import { cn } from "@/lib/utils";

/** How many leads a single fetch loads — both the initial page and each "Load more". */
const PAGE_SIZE = 50;

interface Department {
  id: string;
  name: string;
}

interface CurrentUser {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER";
  socialMedia?: { hasAccess: boolean; isLead: boolean };
  modulePermissions?: string[];
}

type ViewMode = "pipeline" | "list";

const VIEW_OPTIONS = [
  { value: "pipeline", label: "Pipeline view" },
  { value: "list", label: "List view" },
];

const PRIORITY_VARIANT = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
} as const;

/** Builds the Leads list query string — shared by the initial/filtered fetch and "Load more", so both always agree on what's currently being searched for. */
function leadsSearchParams(opts: {
  scope?: string;
  filters: { assignee: FilterValue; status: FilterValue; priority: FilterValue; meeting: FilterValue };
  q: string;
  take: number;
  skip: number;
}) {
  const params = new URLSearchParams();
  if (opts.scope) params.set("scope", opts.scope);
  const assignee = filterValueToParam(opts.filters.assignee);
  if (assignee) params.set("assignee", assignee);
  const status = filterValueToParam(opts.filters.status);
  if (status) params.set("status", status);
  const priority = filterValueToParam(opts.filters.priority);
  if (priority) params.set("priority", priority);
  const meeting = filterValueToParam(opts.filters.meeting);
  if (meeting) params.set("meeting", meeting);
  if (opts.q) params.set("q", opts.q);
  params.set("take", String(opts.take));
  if (opts.skip) params.set("skip", String(opts.skip));
  return params.toString();
}

export function LeadsBoard({ scope }: { scope?: "social-media" | "crm" | `team:${string}` } = {}) {
  const router = useRouter();
  const toast = useToast();
  const { query } = useSearch();
  const { socket } = useSocket();
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);
  const [view, setView] = useState<ViewMode>("pipeline");
  const [filters, setFilters] = useState<{
    assignee: FilterValue;
    status: FilterValue;
    priority: FilterValue;
    meeting: FilterValue;
  }>({ assignee: null, status: null, priority: null, meeting: null });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const { containerRef: scrollContainerRef, onDragOver: handleBoardDragOver, stop: stopAutoScroll } =
    useDragAutoScroll<HTMLDivElement>();

  // Debounced so free-text search (typed into the shared header search bar)
  // doesn't fire a request per keystroke.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // The one reactive fetch: re-runs (resetting to the first page) whenever
  // the scope, a filter, or the search query changes — search/filtering now
  // happens server-side, so this is also what makes "Load more" safe: a
  // later page can never contain something an earlier page's filter should
  // have excluded. `take` lets a live-update/post-mutation refresh ask for
  // as many as were already loaded, instead of collapsing back to page one.
  const loadLeads = useCallback(
    async (take: number = PAGE_SIZE) => {
      setLoading(true);
      try {
        const qs = leadsSearchParams({ scope, filters, q, take: Math.max(take, PAGE_SIZE), skip: 0 });
        const res = await fetch(`/api/leads?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setLeads(data.leads ?? []);
          setTotal(data.total ?? 0);
          setHasMore(!!data.hasMore);
          setForbidden(false);
        } else if (scope && res.status === 403) {
          setForbidden(true);
        } else {
          toast.error("Couldn't load leads", data.error);
        }
      } catch {
        toast.error("Couldn't load leads", "Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [scope, filters, q] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function loadMoreLeads() {
    setLoadingMore(true);
    try {
      const qs = leadsSearchParams({ scope, filters, q, take: PAGE_SIZE, skip: leads.length });
      const res = await fetch(`/api/leads?${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load more leads", data.error);
      setLeads((prev) => [...prev, ...(data.leads ?? [])]);
      setTotal(data.total ?? 0);
      setHasMore(!!data.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  // A live update or a mutation (duplicate, bulk delete/reassign, an edit)
  // re-fetches in place — preserving however many leads were already loaded
  // (via "Load more"), rather than collapsing the list back to page one.
  function refreshLeads() {
    return loadLeads(leads.length);
  }

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Assignable users, departments, and the current user don't depend on any
  // filter — loaded once, not re-fetched every time a filter changes.
  useEffect(() => {
    (async () => {
      try {
        const [usersRes, meRes] = await Promise.all([fetch("/api/users/assignable"), fetch("/api/auth/me")]);
        const [usersData, meData] = await Promise.all([usersRes.json().catch(() => ({})), meRes.json().catch(() => ({}))]);
        if (usersRes.ok) setAssignableUsers(usersData.users);
        if (meRes.ok) setCurrentUser(meData.user);

        const isAdminUser = meData.user?.role === "SUPER_ADMIN" || meData.user?.role === "ADMIN";
        if (isAdminUser) {
          const deptRes = await fetch("/api/departments");
          const deptData = await deptRes.json().catch(() => ({}));
          if (deptRes.ok) setDepartments(deptData.departments);
        }
      } catch {
        // The leads fetch itself already surfaces a connection-error toast.
      }
    })();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onLeadChange = () => refreshLeads();
    socket.on("lead_created", onLeadChange);
    socket.on("lead_updated", onLeadChange);
    socket.on("lead_deleted", onLeadChange);
    return () => {
      socket.off("lead_created", onLeadChange);
      socket.off("lead_updated", onLeadChange);
      socket.off("lead_deleted", onLeadChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, leads.length]);

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";
  // A Social Media team member (regular or lead) who isn't also a company
  // admin gets that team's own stage pipeline on this same Leads module —
  // and so does an admin viewing it here specifically via the Team console
  // (scope="social-media"), since every lead in view uses that pipeline.
  const isSocialMediaOnly = scope === "social-media" || (!isAdmin && !!currentUser?.socialMedia?.hasAccess);
  const statusOptions = useMemo(() => getLeadStatusOptions(isSocialMediaOnly), [isSocialMediaOnly]);

  // The Social Media Team console gets multi-select within each facet (pick
  // several statuses/priorities/assignees at once); everywhere else stays
  // the original single-select behavior.
  const multiSelectFilters = !!scope;

  const filterFacets: FilterFacet[] = [
    {
      key: "assignee",
      label: "Assigned to",
      allLabel: "Anyone",
      multiple: multiSelectFilters,
      value: filters.assignee,
      onChange: (v) => setFilters((f) => ({ ...f, assignee: v })),
      options: [
        { value: UNASSIGNED, label: "Unassigned" },
        ...assignableUsers.map((u) => ({
          value: u.id,
          label: userOptionLabel(u),
          avatarDataUrl: u.avatarDataUrl,
          showAvatar: true,
        })),
      ],
    },
    {
      key: "status",
      label: "Status",
      multiple: multiSelectFilters,
      value: filters.status,
      onChange: (v) => setFilters((f) => ({ ...f, status: v })),
      options: statusOptions,
    },
    {
      key: "priority",
      label: "Priority",
      multiple: multiSelectFilters,
      value: filters.priority,
      onChange: (v) => setFilters((f) => ({ ...f, priority: v })),
      options: PRIORITY_OPTIONS,
    },
    {
      key: "meeting",
      label: "Meeting",
      multiple: multiSelectFilters,
      value: filters.meeting,
      onChange: (v) => setFilters((f) => ({ ...f, meeting: v })),
      options: MEETING_STATUS_OPTIONS,
    },
  ];

  async function moveLead(leadId: string, status: LeadStatus) {
    const current = leads.find((l) => l.id === leadId);
    if (!current || current.status === status) return;

    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));

    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: current.status } : l)));
      return;
    }

    // Social Media's "Approval" (WON) auto-creates the matching client —
    // jump straight to its folder instead of leaving the lead card behind.
    const data = await res.json().catch(() => null);
    if (data?.convertedClientId) {
      toast.success("Lead approved", "Converted to a client — opening its folder now.");
      router.push(`/social-media/${data.convertedClientId}`);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllIds(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectedIds(new Set());
  }

  function handleLeadClick(lead: LeadSummary) {
    if (selectedIds.size > 0) {
      toggleSelected(lead.id);
    } else {
      setSelectedLead(lead);
    }
  }

  async function handleBulkDelete() {
    const res = await fetch("/api/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't delete", data.error);
      return;
    }
    exitSelectionMode();
    await refreshLeads();
  }

  async function handleBulkReassign() {
    if (!reassignTo) return;
    setReassigning(true);
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), assignedToId: reassignTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't reassign", data.error);
        return;
      }
      toast.success(`Reassigned ${data.updated} lead${data.updated === 1 ? "" : "s"}`, data.skipped ? `${data.skipped} skipped — no edit access` : undefined);
      setReassignOpen(false);
      setReassignTo("");
      exitSelectionMode();
      await refreshLeads();
    } finally {
      setReassigning(false);
    }
  }

  // A Leads module grant manages/deletes every lead, same as an admin.
  const hasLeadsGrant = !!currentUser?.modulePermissions?.includes("LEADS");
  const fullLeadAccess = isAdmin || hasLeadsGrant;
  // Edit is open to the creator and the assignee; deletion to the creator or an
  // admin — matching the API. This only decides what the menu offers.
  const canManageLead = (l: LeadSummary) =>
    fullLeadAccess || l.createdBy.id === currentUser?.id || l.assignedTo?.id === currentUser?.id;
  const canDeleteLead = (l: LeadSummary) => fullLeadAccess || l.createdBy.id === currentUser?.id;

  async function remindLead(lead: LeadSummary) {
    const res = await fetch(`/api/leads/${lead.id}/remind`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't send the reminder", data.error);
    toast.success("Reminder sent", lead.name);
  }

  async function duplicateLead(lead: LeadSummary) {
    const res = await fetch(`/api/leads/${lead.id}/duplicate`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't duplicate the lead", data.error);
    toast.success("Lead duplicated");
    await refreshLeads();
  }

  function leadActions(lead: LeadSummary): RowAction[] {
    const actions: RowAction[] = [];
    if (canManageLead(lead)) {
      actions.push({ key: "edit", label: "Edit", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => setSelectedLead(lead) });
      actions.push({ key: "duplicate", label: "Duplicate", icon: <IconCopy className="h-3.5 w-3.5" />, onSelect: () => duplicateLead(lead) });
    }
    if (fullLeadAccess && (lead.assignedTo?.id ?? lead.createdBy.id) !== currentUser?.id) {
      actions.push({ key: "remind", label: "Send reminder", icon: <IconBell className="h-3.5 w-3.5" />, onSelect: () => remindLead(lead) });
    }
    if (canDeleteLead(lead)) {
      actions.push({
        key: "delete",
        label: "Delete",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        destructive: true,
        onSelect: () => setDeleteTarget(lead),
      });
    }
    return actions;
  }

  async function deleteLead(id: string) {
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't delete lead", data.error);
      return;
    }
    await refreshLeads();
  }

  // "Select all" covers whatever's currently loaded, not necessarily every
  // lead matching the filters — same convention as Gmail et al: paginated
  // lists select the loaded page, not silently everything that matches.
  const allLeadsSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  if (forbidden) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-1 py-16 text-center">
        <p className="text-sm font-medium">You don&apos;t have access to this team&apos;s Leads</p>
        <p className="text-sm text-muted-foreground">Ask your team lead or a company admin for access.</p>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Leads</h1>
          <HelpDialog title="Leads — help">
            <HelpSection heading="What this page is for">
              <p>Track prospective clients from first contact through to a won or lost deal, in a Kanban board you can drag between stages.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>See and manage every lead across every department, and can bulk reassign, export, or delete leads.</p>
            </HelpSection>
            <HelpSection heading="Department Admins & Permission grants">
              <p>A Department Admin sees only what they&apos;re explicitly granted (Permissions → Leads). A grant without &quot;All departments&quot; turned on covers that person&apos;s own department; with it on, it covers every department, same as an Admin.</p>
            </HelpSection>
            <HelpSection heading="CRM Team leads">
              <p>A CRM Team lead additionally sees every lead created by or assigned to anyone on their team, regardless of department.</p>
            </HelpSection>
            <HelpSection heading="Everyone else">
              <p>You see leads you created or are assigned to, plus any lead that isn&apos;t tied to a specific department.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearchBar placeholder="Search leads…" />
          <AnimatePresence initial={false}>
            {selectedIds.size > 0 ? (
              <SelectionBar
                key="selection"
                count={selectedIds.size}
                allSelected={allLeadsSelected}
                onSelectAll={() => toggleSelectAllIds(leads.map((l) => l.id))}
                onCancel={exitSelectionMode}
                onDelete={() => setConfirmOpen(true)}
                extraActions={
                  <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)}>
                    Reassign
                  </Button>
                }
              />
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-2"
              >
                <FilterMenu facets={filterFacets} />
                <Dropdown
                  size="sm"
                  value={view}
                  onChange={(v) => setView(v as ViewMode)}
                  options={VIEW_OPTIONS}
                  className="w-40"
                />
                <NewLeadDialog
                  isAdmin={!!isAdmin}
                  assignableUsers={assignableUsers}
                  departments={departments}
                  onCreated={refreshLeads}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {loading && <SkeletonBoard columns={4} />}

      {!loading && view === "list" && (
        <LeadsListView
          leads={leads}
          statusOptions={statusOptions}
          onSelect={handleLeadClick}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
          rowActions={selectedIds.size === 0 ? leadActions : undefined}
        />
      )}

      {!loading && view === "pipeline" && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div
          ref={scrollContainerRef}
          // Wheel scroll is left to the browser's default: vertical wheel
          // scrolls whichever column it's over (each has its own overflow-y),
          // and this row itself only carries horizontal overflow. Reaching
          // sideways is the HorizontalScrollbar below, not the wheel.
          className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden focus:outline-none"
          onDragOver={handleBoardDragOver}
        >
          {statusOptions.map((col) => {
            const columnLeads = leads.filter((l) => l.status === col.value);
            const isDragOver = dragOverStatus === col.value;
            const allColumnSelected = columnLeads.length > 0 && columnLeads.every((l) => selectedIds.has(l.id));
            return (
              <div
                key={col.value}
                className={cn(
                  "flex min-h-0 w-72 shrink-0 flex-col gap-2 rounded-lg p-1.5 transition-colors",
                  isDragOver && "bg-accent/60"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStatus(col.value);
                }}
                onDragLeave={() => setDragOverStatus((s) => (s === col.value ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const leadId = e.dataTransfer.getData("text/plain");
                  setDragOverStatus(null);
                  setDraggingId(null);
                  stopAutoScroll();
                  if (leadId) moveLead(leadId, col.value);
                }}
              >
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedIds.size > 0 && columnLeads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleSelectAllIds(columnLeads.map((l) => l.id))}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {allColumnSelected ? "Clear" : "All"}
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground">{columnLeads.length}</span>
                  </div>
                </div>
                {/* The column scrolls its own cards; the board's wheel handler
                    only takes over sideways once this reaches an edge. */}
                <div data-col-scroll className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                  {columnLeads.map((lead) => (
                    <motion.div
                      key={lead.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Card
                        draggable={selectedIds.size === 0}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", lead.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(lead.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStatus(null);
                          stopAutoScroll();
                        }}
                        className={cn(
                          "group relative select-none p-3 transition-colors hover:border-primary/40",
                          selectedIds.size === 0 && "cursor-grab active:cursor-grabbing",
                          draggingId === lead.id && "opacity-30",
                          selectedIds.has(lead.id) && "border-primary/60 bg-accent/40"
                        )}
                        onClick={() => handleLeadClick(lead)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start">
                            {/* fade, not width: a width reveal shrinks the space
                                left for the name on hover, which can push it
                                onto a third line and grow the card under the
                                cursor. Fade keeps the box's width constant. */}
                            <HoverCheckbox
                              checked={selectedIds.has(lead.id)}
                              reveal="fade"
                              onChange={() => toggleSelected(lead.id)}
                              aria-label={`Select ${lead.name}`}
                              wrapperClassName="mt-0.5 w-4.5 mr-2"
                            />
                            <p className="line-clamp-2 text-sm font-medium">{lead.name}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge variant={PRIORITY_VARIANT[lead.priority]}>{lead.priority}</Badge>
                            {selectedIds.size === 0 && (
                              <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                <RowActionsMenu actions={leadActions(lead)} label={`Actions for ${lead.name}`} />
                              </span>
                            )}
                          </div>
                        </div>
                        {lead.company && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{lead.company}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{lead.assignedTo ? lead.assignedTo.name : "Unassigned"}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {lead._count.notes > 0 && `${lead._count.notes} note${lead._count.notes === 1 ? "" : "s"}`}
                            <RecencyBadge createdAt={lead.createdAt} />
                          </span>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                  {columnLeads.length === 0 && (
                    <p className="px-1 text-xs text-muted-foreground/60">No leads</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <HorizontalScrollbar containerRef={scrollContainerRef} className="mx-1.5" />
        </div>
      )}

      {!loading && leads.length > 0 && (
        <div className="flex shrink-0 items-center justify-center gap-3 py-1">
          <span className="text-xs text-muted-foreground">
            Showing {leads.length} of {total} lead{total === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <Button type="button" variant="outline" size="sm" onClick={loadMoreLeads} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      )}

      <LeadDetailDialog
        leadId={selectedLead?.id ?? null}
        initialSummary={selectedLead}
        assignableUsers={assignableUsers}
        statusOptions={statusOptions}
        onClose={() => setSelectedLead(null)}
        onChanged={refreshLeads}
        onDeleted={() => {
          setSelectedLead(null);
          refreshLeads();
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selectedIds.size} lead${selectedIds.size === 1 ? "" : "s"}?`}
        description="This moves the selected lead(s) to Trash, where they'll stay recoverable for 30 days before being permanently deleted."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
      />

      <Dialog open={reassignOpen} onOpenChange={(v) => !reassigning && setReassignOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Only leads you have edit access to will actually move.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Dropdown
              value={reassignTo}
              onChange={setReassignTo}
              placeholder="Choose a user"
              options={assignableUsers.map((u) => ({
                value: u.id,
                label: userOptionLabel(u),
                avatarDataUrl: u.avatarDataUrl,
                showAvatar: true,
              }))}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={reassigning} onClick={() => setReassignOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!reassignTo || reassigning} onClick={handleBulkReassign}>
              {reassigning ? "Reassigning..." : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This moves the lead to Trash, where it'll stay recoverable for 30 days before being permanently deleted."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) await deleteLead(deleteTarget.id);
        }}
      />
    </div>
  );
}

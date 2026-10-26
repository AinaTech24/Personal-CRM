"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonForm } from "@/components/ui/skeleton";
import { SummaryCards, type AttendanceSummaryData } from "@/components/attendance/summary-cards";
import { IconChevronLeft } from "@/components/icons";
import { cn } from "@/lib/utils";

interface OverviewUser {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  mobile: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  avatarDataUrl: string | null;
  department: { id: string; name: string } | null;
}

interface Overview {
  user: OverviewUser;
  leads: { id: string; name: string; company: string | null; status: string; priority: string; createdAt: string }[];
  tasks: { id: string; title: string; status: string; priority: string; dueDate: string | null; createdAt: string }[];
  projects: { id: string; name: string; status: string; progress: number; createdAt: string }[];
  meetings: { id: string; title: string; startsAt: string; status: string }[];
  quotations: { id: string; quotationNumber: string; clientName: string; status: string; total: number; createdAt: string }[];
  invoices: { id: string; invoiceNumber: string; clientName: string; status: string; total: number; invoiceDate: string }[];
  attendance: {
    year: number;
    summary: AttendanceSummaryData;
    records: { date: string; status: string | null; approvalStatus: string; checkIn: string | null; checkOut: string | null; workedMinutes: number | null }[];
  };
}

type TabKey = "profile" | "leads" | "tasks" | "projects" | "meetings" | "quotations" | "invoices" | "attendance";

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");
const pretty = (s: string | null) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "—");
const fmtDate = (s: string | null) => (s ? format(parseISO(s), "MMM d, yyyy") : "—");
const fmtDateTime = (s: string | null) => (s ? format(parseISO(s), "MMM d, yyyy · h:mm a") : "—");
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function UserDetailView({ userId }: { userId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>("profile");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/overview`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center min-h-[55vh] flex-1 items-center">
        <SkeletonForm fields={6} />
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">User not found.</CardContent>
        </Card>
      </div>
    );
  }

  const u = data.user;
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "profile", label: "Profile" },
    { key: "leads", label: "Leads", count: data.leads.length },
    { key: "tasks", label: "Tasks", count: data.tasks.length },
    { key: "projects", label: "Projects", count: data.projects.length },
    { key: "meetings", label: "Meetings", count: data.meetings.length },
    { key: "quotations", label: "Quotes", count: data.quotations.length },
    { key: "invoices", label: "Invoices", count: data.invoices.length },
    { key: "attendance", label: "Attendance", count: data.attendance.records.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <BackLink />

      {/* Header */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {u.avatarDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarDataUrl} alt={fullName(u)} className="h-full w-full object-cover" />
            ) : (
              fullName(u).slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{fullName(u)}</h1>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  u.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                )}
              >
                {u.isActive ? "Active" : "Blocked"}
              </span>
            </div>
            <p className="truncate text-sm text-muted-foreground">{u.email}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pretty(u.role)}
              {u.department ? ` · ${u.department.name}` : ""} · Joined {fmtDate(u.createdAt)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-xs tabular-nums text-muted-foreground">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "profile" && <ProfileTab user={u} />}

      {tab === "leads" && (
        <DataTable
          rows={data.leads}
          empty="No leads assigned."
          columns={[
            { label: "Name", render: (l) => l.name },
            { label: "Company", render: (l) => l.company || "—" },
            { label: "Status", render: (l) => <Pill>{pretty(l.status)}</Pill> },
            { label: "Priority", render: (l) => pretty(l.priority) },
            { label: "Created", render: (l) => fmtDate(l.createdAt) },
          ]}
        />
      )}

      {tab === "tasks" && (
        <DataTable
          rows={data.tasks}
          empty="No tasks assigned."
          columns={[
            { label: "Title", render: (t) => t.title },
            { label: "Status", render: (t) => <Pill>{pretty(t.status)}</Pill> },
            { label: "Priority", render: (t) => pretty(t.priority) },
            { label: "Due", render: (t) => fmtDate(t.dueDate) },
          ]}
        />
      )}

      {tab === "projects" && (
        <DataTable
          rows={data.projects}
          empty="Not a member of any projects."
          columns={[
            { label: "Project", render: (p) => p.name },
            { label: "Status", render: (p) => <Pill>{pretty(p.status)}</Pill> },
            { label: "Progress", render: (p) => `${p.progress}%` },
            { label: "Created", render: (p) => fmtDate(p.createdAt) },
          ]}
        />
      )}

      {tab === "meetings" && (
        <DataTable
          rows={data.meetings}
          empty="No meetings."
          columns={[
            { label: "Title", render: (m) => m.title },
            { label: "When", render: (m) => fmtDateTime(m.startsAt) },
            { label: "Status", render: (m) => <Pill>{pretty(m.status)}</Pill> },
          ]}
        />
      )}

      {tab === "quotations" && (
        <DataTable
          rows={data.quotations}
          empty="No quotations created."
          columns={[
            { label: "Number", render: (q) => q.quotationNumber },
            { label: "Client", render: (q) => q.clientName },
            { label: "Status", render: (q) => <Pill>{pretty(q.status)}</Pill> },
            { label: "Total", render: (q) => money(q.total) },
            { label: "Created", render: (q) => fmtDate(q.createdAt) },
          ]}
        />
      )}

      {tab === "invoices" && (
        <DataTable
          rows={data.invoices}
          empty="No invoices created."
          columns={[
            { label: "Number", render: (i) => i.invoiceNumber },
            { label: "Client", render: (i) => i.clientName },
            { label: "Status", render: (i) => <Pill>{pretty(i.status)}</Pill> },
            { label: "Total", render: (i) => money(i.total) },
            { label: "Date", render: (i) => fmtDate(i.invoiceDate) },
          ]}
        />
      )}

      {tab === "attendance" && (
        <div className="flex flex-col gap-4">
          <SummaryCards summary={data.attendance.summary} />
          <DataTable
            rows={data.attendance.records}
            empty={`No attendance recorded in ${data.attendance.year}.`}
            columns={[
              { label: "Date", render: (a) => fmtDate(a.date) },
              { label: "Status", render: (a) => <Pill>{pretty(a.status)}</Pill> },
              { label: "Check In", render: (a) => (a.checkIn ? format(parseISO(a.checkIn), "h:mm a") : "—") },
              { label: "Check Out", render: (a) => (a.checkOut ? format(parseISO(a.checkOut), "h:mm a") : "—") },
              { label: "Approval", render: (a) => pretty(a.approvalStatus) },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/users" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <IconChevronLeft className="h-4 w-4" />
      Back to Users
    </Link>
  );
}

function ProfileTab({ user: u }: { user: OverviewUser }) {
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Full name", value: fullName(u) || "—" },
    { label: "Email", value: u.email },
    { label: "Mobile", value: u.mobile || "—" },
    { label: "Role", value: pretty(u.role) },
    { label: "Department", value: u.department?.name ?? "—" },
    { label: "Status", value: u.isActive ? "Active" : "Blocked" },
    { label: "Joined", value: fmtDate(u.createdAt) },
  ];
  return (
    <Card>
      <CardContent className="divide-y divide-border/60 p-0">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="text-right font-medium">{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{children}</span>;
}

function DataTable<T>({
  rows,
  columns,
  empty,
}: {
  rows: T[];
  columns: { label: string; render: (row: T) => ReactNode }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">{empty}</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {columns.map((c) => (
                  <th key={c.label} className="px-5 py-2.5 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={(row as { id?: string }).id ?? i} className="border-b border-border/50 last:border-0">
                  {columns.map((c) => (
                    <td key={c.label} className="whitespace-nowrap px-5 py-2.5">
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

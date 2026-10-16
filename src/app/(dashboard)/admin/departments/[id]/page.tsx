"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import { IconSend, IconChevronLeft } from "@/components/icons";

const ROLE_OPTIONS = [
  { value: "DEPARTMENT_USER", label: "Department User" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role.replace(/_/g, " ");
}

interface Member {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  avatarDataUrl: string | null;
  role: string;
  isDepartmentAdmin: boolean;
  isActive: boolean;
}

interface DepartmentDetail {
  id: string;
  name: string;
  users: Member[];
}

export default function DepartmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [department, setDepartment] = useState<DepartmentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("DEPARTMENT_USER");
  const [makeDeptAdmin, setMakeDeptAdmin] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    const [deptRes, meRes] = await Promise.all([
      fetch(`/api/departments/${params.id}`),
      fetch("/api/auth/me"),
    ]);
    const deptData = await deptRes.json();
    if (!deptRes.ok) {
      setLoadError(deptData.error ?? "Couldn't load this department");
      return;
    }
    setDepartment(deptData.department);
    if (meRes.ok) {
      const me = (await meRes.json()).user;
      setIsAdmin(me?.role === "SUPER_ADMIN" || me?.role === "ADMIN");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function openInvite() {
    setEmail("");
    setRole("DEPARTMENT_USER");
    setMakeDeptAdmin(false);
    setInviteError(null);
    setInviteOpen(true);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setSending(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          departmentId: params.id,
          inviteeIsDepartmentAdmin: makeDeptAdmin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(data.error ?? "Something went wrong");
        return;
      }
      toast.success("Invite sent", email);
      setInviteOpen(false);
      load();
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" className="w-fit" onClick={() => router.push("/admin/departments")}>
          Back to departments
        </Button>
      </div>
    );
  }

  if (!department) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/departments")} aria-label="Back to departments">
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{department.name}</h1>
            <p className="text-sm text-muted-foreground">
              {department.users.length} member{department.users.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Button onClick={openInvite}>
          <IconSend className="mr-2 h-4 w-4" />
          Invite
        </Button>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {department.users.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No members yet — invite someone to get started.</p>
          )}
          {department.users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-4">
              <UserAvatar name={u.name} avatarDataUrl={u.avatarDataUrl} className="h-9 w-9 text-sm" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">
                  {[u.name, u.surname].filter(Boolean).join(" ")}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {!u.isActive && <Badge variant="destructive">Blocked</Badge>}
                {u.isDepartmentAdmin && <Badge variant="success">Dept. Admin</Badge>}
                <Badge variant="outline">{roleLabel(u.role)}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={(v) => !sending && setInviteOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to {department.name}</DialogTitle>
            <DialogDescription>They&apos;ll get an email with a link to join.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form onSubmit={sendInvite} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {isAdmin && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-role">Role</Label>
                    <Dropdown id="invite-role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={makeDeptAdmin} onChange={setMakeDeptAdmin} aria-label="Make Department Admin" />
                    <span>
                      <span className="font-medium">Make Department Admin</span>
                      <span className="block text-xs text-muted-foreground">
                        Can manage this department&apos;s permissions and invite more members.
                      </span>
                    </span>
                  </label>
                </>
              )}
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={sending} onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={sending}>
                  {sending ? "Sending..." : "Send invite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

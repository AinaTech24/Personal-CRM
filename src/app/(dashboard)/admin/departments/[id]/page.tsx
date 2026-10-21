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
import { Tooltip } from "@/components/ui/tooltip";
import { PageLoader } from "@/components/ui/page-loader";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import { IconSend, IconChevronLeft, IconInfo, IconShield, IconKey, IconDownload } from "@/components/icons";
import { ManagePermissionsDialog } from "@/components/permissions/manage-permissions-dialog";

const ROLE_OPTIONS = [
  { value: "DEPARTMENT_USER", label: "Department User" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role.replace(/_/g, " ");
}

function fullName(u: { name: string; surname?: string | null }) {
  return [u.name, u.surname].filter(Boolean).join(" ");
}

interface Member {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  mobile: string | null;
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
  const [meId, setMeId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("DEPARTMENT_USER");
  const [makeDeptAdmin, setMakeDeptAdmin] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [detailsUser, setDetailsUser] = useState<Member | null>(null);

  const [permsUser, setPermsUser] = useState<Member | null>(null);

  const [resetUser, setResetUser] = useState<Member | null>(null);
  const [resetSending, setResetSending] = useState(false);

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
      setMeId(me?.id ?? null);
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

  async function confirmReset() {
    if (!resetUser) return;
    setResetSending(true);
    try {
      const res = await fetch(`/api/users/${resetUser.id}/send-password-reset`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't send reset code", data.error);
        return;
      }
      toast.success("Sign-in code sent", resetUser.email);
      setResetUser(null);
    } finally {
      setResetSending(false);
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
    return <PageLoader />;
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
        <div className="flex items-center gap-1.5">
          <Tooltip label="Export CSV" side="bottom">
            <a href={`/api/departments/${params.id}/export`}>
              <Button size="icon" variant="outline" aria-label="Export CSV">
                <IconDownload className="h-4 w-4" />
              </Button>
            </a>
          </Tooltip>
          <Button onClick={openInvite}>
            <IconSend className="mr-2 h-4 w-4" />
            Invite
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {department.users.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No members yet — invite someone to get started.</p>
          )}
          {department.users.map((u) => {
            const isSelf = u.id === meId;
            return (
              <div key={u.id} className="flex items-center gap-3 p-4">
                <UserAvatar name={u.name} avatarDataUrl={u.avatarDataUrl} className="h-9 w-9 text-sm" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{fullName(u)}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!u.isActive && <Badge variant="destructive">Blocked</Badge>}
                  {u.isDepartmentAdmin && <Badge variant="success">Dept. Admin</Badge>}
                  <Badge variant="outline">{roleLabel(u.role)}</Badge>
                </div>
                {!isSelf && (
                  <div className="flex items-center gap-0.5 border-l border-border pl-2">
                    <Tooltip label="View details" side="bottom">
                      <button
                        type="button"
                        onClick={() => setDetailsUser(u)}
                        aria-label={`View details for ${fullName(u)}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                      >
                        <IconInfo className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Manage permissions" side="bottom">
                      <button
                        type="button"
                        onClick={() => setPermsUser(u)}
                        aria-label={`Manage permissions for ${fullName(u)}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                      >
                        <IconShield className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Reset password" side="bottom">
                      <button
                        type="button"
                        onClick={() => setResetUser(u)}
                        aria-label={`Reset password for ${fullName(u)}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                      >
                        <IconKey className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            );
          })}
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

      <Dialog open={!!detailsUser} onOpenChange={(v) => !v && setDetailsUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailsUser && fullName(detailsUser)}</DialogTitle>
          </DialogHeader>
          {detailsUser && (
            <DialogBody>
              <div className="flex items-center gap-3 pb-2">
                <UserAvatar name={detailsUser.name} avatarDataUrl={detailsUser.avatarDataUrl} className="h-11 w-11 text-base" />
                <div>
                  <p className="text-sm font-medium">{fullName(detailsUser)}</p>
                  <p className="text-xs text-muted-foreground">{department.name}</p>
                </div>
              </div>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{detailsUser.email}</dd>
                <dt className="text-muted-foreground">Mobile</dt>
                <dd>{detailsUser.mobile ?? "—"}</dd>
                <dt className="text-muted-foreground">Role</dt>
                <dd>{roleLabel(detailsUser.role)}</dd>
                <dt className="text-muted-foreground">Dept. Admin</dt>
                <dd>{detailsUser.isDepartmentAdmin ? "Yes" : "No"}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{detailsUser.isActive ? "Active" : "Blocked"}</dd>
              </dl>
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailsUser(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManagePermissionsDialog user={permsUser} onOpenChange={(open) => !open && setPermsUser(null)} />

      <Dialog open={!!resetUser} onOpenChange={(v) => !resetSending && !v && setResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a sign-in code?</DialogTitle>
            <DialogDescription>
              {resetUser && `Emails a sign-in code to ${resetUser.email} so they can get back in without their password.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={resetSending} onClick={() => setResetUser(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmReset} disabled={resetSending}>
              {resetSending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

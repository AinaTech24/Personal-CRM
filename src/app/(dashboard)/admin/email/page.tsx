"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonForm } from "@/components/ui/skeleton";
import { IconEye, IconEyeOff } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
  allowExternalInvites: boolean;
}

export default function EmailSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("Aina CRM");
  const [allowExternalInvites, setAllowExternalInvites] = useState(false);

  useEffect(() => {
    setLoading(true);
    setPassword("");
    fetch("/api/smtp-settings")
      .then((r) => r.json())
      .then((data) => {
        const s: SmtpSettings = data.settings;
        setHost(s.host);
        setPort(s.port);
        setSecure(s.secure);
        setUsername(s.username);
        setHasPassword(s.hasPassword);
        setFromEmail(s.fromEmail);
        setFromName(s.fromName);
        setAllowExternalInvites(s.allowExternalInvites);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/smtp-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, secure, username, password, fromEmail, fromName, allowExternalInvites }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't save SMTP settings", data.error);
        return;
      }
      setHasPassword(data.settings.hasPassword);
      setPassword("");
      toast.success("SMTP settings saved");
    } finally {
      setSaving(false);
    }
  }

  // Revealing shows the REAL, stored password (decrypted server-side) — not
  // just toggling the input's own type — since the field starts out empty
  // whenever one is already saved (see "Leave blank to keep the existing
  // one" above). Once typing has started, there's nothing to fetch: just
  // flip visibility on what the admin is already entering.
  async function toggleShowPassword() {
    if (showPassword || password || !hasPassword) {
      setShowPassword((v) => !v);
      return;
    }
    setRevealing(true);
    try {
      const res = await fetch("/api/smtp-settings/reveal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Couldn't reveal password", data.error);
        return;
      }
      setPassword(data.password);
      setShowPassword(true);
    } finally {
      setRevealing(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/smtp-settings/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error("SMTP connection failed", data.error);
        return;
      }
      toast.success("SMTP connection successful");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Email Settings</h1>
      </div>

      <Card className="w-full">
        <CardContent className="p-6">
          {loading ? (
            <div className="min-h-48 w-full">
              <SkeletonForm fields={5} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Row 1: Host + Username + Password + Port */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_110px]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="smtp-host">Host</Label>
                  <Input id="smtp-host" placeholder="smtp.gmail.com" value={host} onChange={(e) => setHost(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="smtp-user">Username</Label>
                  <Input id="smtp-user" placeholder="name@ainatech.in" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="smtp-pass">Password</Label>
                  <div className="relative">
                    <Input
                      id="smtp-pass"
                      type={showPassword ? "text" : "password"}
                      className="pr-9"
                      placeholder={hasPassword ? "•••••••• (unchanged)" : "App password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={toggleShowPassword}
                      disabled={revealing}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={port}
                    onChange={(e) => {
                      const p = Number(e.target.value);
                      setPort(p);
                      setSecure(p === 465);
                    }}
                  />
                </div>
              </div>
              {hasPassword && <p className="-mt-2 text-xs text-muted-foreground">Leave the password blank to keep the existing one.</p>}

              {/* Custom TLS/SSL toggle */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Use TLS/SSL</p>
                  <p className="text-xs text-muted-foreground">
                    Implicit TLS — for port 465. Leave this off for port 587/25 (they use STARTTLS instead).
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={secure}
                  onClick={() => setSecure((v) => !v)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                    secure ? "bg-primary" : "bg-input"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                      secure ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
              {secure && port !== 465 && (
                <p className="-mt-2 text-xs text-amber-500">
                  Port {port} with TLS/SSL on will likely fail to connect — that combination needs port 465. Either
                  switch the port to 465, or turn this toggle off to use STARTTLS on port {port}.
                </p>
              )}
              {!secure && port === 465 && (
                <p className="-mt-2 text-xs text-amber-500">
                  Port 465 normally needs TLS/SSL turned on (implicit TLS) — connections without it usually fail.
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="smtp-fname">From name</Label>
                  <Input id="smtp-fname" value={fromName} onChange={(e) => setFromName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="smtp-femail">From email</Label>
                  <Input id="smtp-femail" placeholder="no-reply@ainatech.in" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
                </div>
              </div>

              {/* Invitation policy */}
              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-medium">Allow public email invites</p>
                  <p className="text-xs text-muted-foreground">
                    Also let invites go to Gmail, Outlook, iCloud, and Yahoo addresses. When off, only @ainatech.in
                    can be invited.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowExternalInvites}
                  onClick={() => setAllowExternalInvites((v) => !v)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                    allowExternalInvites ? "bg-primary" : "bg-input"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                      allowExternalInvites ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={test} disabled={testing}>
                  {testing ? "Testing..." : "Test connection"}
                </Button>
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

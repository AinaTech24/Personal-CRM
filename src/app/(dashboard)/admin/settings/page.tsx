"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonForm } from "@/components/ui/skeleton";
import { IconInfo } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { TOGGLEABLE_MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";

export default function AdminSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appUrl, setAppUrl] = useState("");
  const [isFromEnv, setIsFromEnv] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [savingModules, setSavingModules] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/app-settings").then((r) => r.json()).catch(() => null),
      fetch("/api/module-visibility").then((r) => r.json()).catch(() => null),
    ])
      .then(([app, mods]) => {
        if (app?.settings) {
          setAppUrl(app.settings.appUrl ?? "");
          setIsFromEnv(!!app.settings.isFromEnv);
        }
        if (Array.isArray(mods?.hiddenModules)) setHiddenModules(mods.hiddenModules);
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleModule(key: string) {
    const next = hiddenModules.includes(key) ? hiddenModules.filter((k) => k !== key) : [...hiddenModules, key];
    setHiddenModules(next);
    setSavingModules(true);
    try {
      const res = await fetch("/api/module-visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenModules: next }),
      });
      if (!res.ok) {
        setHiddenModules(hiddenModules); // revert on failure
        toast.error("Couldn't update modules");
      }
    } finally {
      setSavingModules(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/app-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appUrl: appUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save settings", data.error);
      setIsFromEnv(!appUrl.trim());
      toast.success("Settings saved");
    } catch {
      toast.error("Couldn't save settings", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Application</h1>
        <p className="text-sm text-muted-foreground">
          Server settings you can change here instead of editing files on the server.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          {loading ? (
            <div className="w-full">
              <SkeletonForm fields={5} />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-url">Application URL</Label>
                <Input
                  id="app-url"
                  placeholder="https://crm.ainatech.in"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The address people use to reach this CRM. It builds the links in outbound
                  email, so if it&apos;s wrong, invites still send but their links lead nowhere.
                  {isFromEnv && appUrl
                    ? " Currently taken from the APP_URL environment variable — saving stores it here instead."
                    : ""}
                  {!appUrl ? " Leave blank to fall back to the APP_URL environment variable." : ""}
                </p>
              </div>

              <div>
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </Button>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                  Managed on the server
                </p>
                <p className="text-sm text-muted-foreground">
                  The database connection and the session signing secret stay in the server&apos;s
                  environment and can&apos;t be edited here. Neither is a policy choice: the
                  database URL is what the app needs to reach this table in the first place, and
                  the signing secret is read while checking every request, before any database
                  connection exists. Changing either means editing the server&apos;s environment
                  and restarting.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sidebar modules visible to regular users */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-1">
            <h2 className="text-base font-semibold">Sidebar modules</h2>
            <p className="text-sm text-muted-foreground">
              Choose which modules regular users can see in the sidebar. Admins always see everything.
            </p>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <IconInfo className="h-4 w-4 shrink-0 translate-y-0.5 text-muted-foreground/80" />
            <p>
              Hiding Leads, Tasks, Projects, Meetings, or My Attendance here only changes the default — anyone
              individually granted that module in{" "}
              <Link href="/admin/permissions" className="text-primary hover:underline">
                Permission Manager
              </Link>{" "}
              still sees it regardless of this toggle, so it doesn&apos;t silently undo a grant someone was
              given on purpose. Clients works the other way round: hiding it here blocks an individual grant
              or CRM Team access from showing it, but a Social Media Team member still keeps their own
              Clients link either way — same as Quotations staying hidden from them, and Calls staying shown
              to CRM, regardless of this list.
            </p>
          </div>
          {loading ? (
            <div className="w-full">
              <SkeletonForm fields={5} />
            </div>
          ) : (
            <div className="mt-3 flex flex-col divide-y divide-border/60">
              {TOGGLEABLE_MODULES.map((m) => {
                const enabled = !hiddenModules.includes(m.key);
                return (
                  <div key={m.key} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-sm">{m.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`Toggle ${m.label} for users`}
                      disabled={savingModules}
                      onClick={() => toggleModule(m.key)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
                        enabled ? "bg-primary" : "bg-input"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                          enabled ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

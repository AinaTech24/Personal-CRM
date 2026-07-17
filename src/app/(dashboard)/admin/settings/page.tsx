"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EightDotsRotate } from "@/components/ui/loader";
import { useToast } from "@/components/providers/toast-provider";

export default function AdminSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appUrl, setAppUrl] = useState("");
  const [isFromEnv, setIsFromEnv] = useState(false);

  useEffect(() => {
    fetch("/api/app-settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.settings) return;
        setAppUrl(data.settings.appUrl ?? "");
        setIsFromEnv(!!data.settings.isFromEnv);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
            <div className="flex justify-center py-8">
              <EightDotsRotate className="h-8 w-8" />
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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";

const DISMISSED_KEY = "aina-onboarding-profile-dismissed";

/**
 * Nudges anyone missing their designation or date of joining to add it —
 * both are compulsory going forward, but existing accounts predate the
 * fields. Dismissible per browser tab session (closing it, or the app
 * reloading in a new tab/session, brings it back) rather than an unclosable
 * block, so a gap in HR data entry can't lock someone out of the app.
 */
export function OnboardingProfileGate() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [designation, setDesignation] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Private browsing / storage blocked — treat as not dismissed.
    }
    if (dismissed) return;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const u = data.user;
        if (u && (!u.designation || !u.dateOfJoining)) {
          setDesignation(u.designation ?? "");
          setDateOfJoining(u.dateOfJoining ? String(u.dateOfJoining).slice(0, 10) : "");
          setOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Ignore — worst case it asks again next page load this tab.
    }
    setOpen(false);
  }

  async function save() {
    if (!designation.trim() || !dateOfJoining) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation: designation.trim(), dateOfJoining }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save", data.error);
      toast.success("Profile completed");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const ready = designation.trim().length > 0 && !!dateOfJoining;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>Your designation and date of joining are missing — add them to finish setting up your profile.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-designation">Designation</Label>
            <Input
              id="onboarding-designation"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Software Engineer"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-doj">Date of joining</Label>
            <DatePicker
              id="onboarding-doj"
              value={dateOfJoining}
              onChange={setDateOfJoining}
              placeholder="Pick a date"
              clearable={false}
              yearRange={{ from: new Date().getFullYear() - 15, to: new Date().getFullYear() }}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss} disabled={saving}>
            Remind me later
          </Button>
          <Button type="button" onClick={save} disabled={!ready || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

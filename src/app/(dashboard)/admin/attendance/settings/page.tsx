"use client";

import Link from "next/link";
import { IconChevronLeft } from "@/components/icons";
import { AttendanceSettingsPanel } from "@/components/attendance/attendance-settings-panel";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";

export default function AttendanceSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/attendance" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconChevronLeft className="h-4 w-4" />
          Attendance
        </Link>
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Attendance settings</h1>
          <HelpDialog title="Attendance settings — help">
            <HelpSection heading="What this page is for">
              <p>Set the shift window, grace period, and half-day/late thresholds the system uses to automatically classify every check-in — present, late, half-day, or absent.</p>
            </HelpSection>
            <HelpSection heading="Who can see this">
              <p>Admins and Super Admins only — these settings apply company-wide.</p>
            </HelpSection>
          </HelpDialog>
        </div>
      </div>

      <AttendanceSettingsPanel />
    </div>
  );
}

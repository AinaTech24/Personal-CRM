"use client";

import Link from "next/link";
import { IconChevronLeft } from "@/components/icons";
import { AttendanceSettingsPanel } from "@/components/attendance/attendance-settings-panel";

export default function AttendanceSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/attendance" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconChevronLeft className="h-4 w-4" />
          Attendance
        </Link>
        <h1 className="text-xl font-semibold">Attendance settings</h1>
        <p className="text-sm text-muted-foreground">Thresholds and policy used to classify every check-in automatically.</p>
      </div>

      <AttendanceSettingsPanel />
    </div>
  );
}

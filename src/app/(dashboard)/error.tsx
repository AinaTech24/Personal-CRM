"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for every page under the dashboard shell.
 * Without this, an uncaught render error anywhere in the app (a bad prop, a
 * null dereference) falls through to Next's generic crash screen, with no
 * way back except a manual URL edit. This catches it, keeps the sidebar/shell
 * context implied (same layout tree), and gives a recovery path that doesn't
 * depend on whatever broke: `retry()` first (re-fetches and re-renders the
 * segment), a plain link to the dashboard home as the fallback if the crash
 * just fires again.
 *
 * Doesn't catch errors thrown by `(dashboard)/layout.tsx` itself (e.g. the
 * permission lookups it awaits) — error.js never wraps the layout in its own
 * segment, only what's nested under it. Those bubble to the root `error.tsx`.
 */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <span className="text-base font-bold leading-none">!</span>
          </span>
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This page hit an unexpected error. Try again, or head back to the dashboard.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => retry()}>
              Try again
            </Button>
            <Link href="/" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

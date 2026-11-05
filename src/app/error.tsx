"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Root-level error boundary. Catches errors that `(dashboard)/error.tsx`
 * can't — error.js never wraps the layout.js in its own segment, so a crash
 * inside `(dashboard)/layout.tsx` (its permission/membership lookups) bubbles
 * up past that boundary to this one — plus any route with no boundary of its
 * own (/login, /invite/[token], /respond/[token]). `retry()` first, a plain
 * link to "/" as the fallback if the crash just fires again; that link still
 * works even for a signed-out user, since it redirects to /login server-side.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <span className="text-base font-bold leading-none">!</span>
          </span>
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This page hit an unexpected error. Try again, or start over from the beginning.
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

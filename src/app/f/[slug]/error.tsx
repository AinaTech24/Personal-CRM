"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for the public Forms pages (/f/[slug] and
 * /f/[slug]/thank-you) — catches a client-side crash here and shows a
 * friendly message instead of Next's generic "This page couldn't load"
 * screen, with a way out that doesn't depend on whatever broke: a plain
 * link straight to the form, which works even if `reset()` can't recover
 * (e.g. the crash fires again on first render).
 */
export default function PublicFormError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  // pathname is "/f/<slug>" or "/f/<slug>/thank-you" — the direct link
  // always goes to the form itself, not wherever the crash happened.
  const slug = pathname?.split("/")[2] ?? "";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div>
            <h1 className="text-lg font-semibold">This form couldn&apos;t load</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Something went wrong loading this page. Try again, or open it directly.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => reset()}>
              Try again
            </Button>
            {slug && (
              <a
                href={`/f/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open in a new tab
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

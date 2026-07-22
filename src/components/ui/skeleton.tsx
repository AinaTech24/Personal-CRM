import { cn } from "@/lib/utils";

/**
 * Placeholder blocks shown while content loads.
 *
 * Preferred over a spinner: a spinner says "something is happening", a
 * skeleton says "a table of about this shape is coming", so the page doesn't
 * jump when it arrives. Shapes are deliberately approximate — matching the real
 * layout exactly means updating them every time the layout changes.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Rows of a table, including its header. */
export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="flex gap-3 border-b border-border pb-2">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-3 py-1.5">
          {Array.from({ length: columns }, (_, c) => (
            // Varying widths so it reads as content rather than a grid.
            <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "max-w-[38%]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A list of records with an avatar and two lines, like the conversation list. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/50 px-3 py-3 last:border-0">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Label/field pairs, for a form or a detail panel. */
export function SkeletonForm({ fields = 5 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Alternating message bubbles, for a chat thread. */
export function SkeletonThread({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => {
        const mine = i % 3 === 0;
        return (
          <div key={i} className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
            {!mine && <Skeleton className="h-7 w-7 shrink-0 rounded-full" />}
            <Skeleton
              className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-1/2" : "w-1/3")}
            />
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { IconChevronRight, IconCheck } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The workflow stepper shared by Content and Ads — done/current/next/undo,
 * and (while editing) a cancelled item's whole sequence offered back as
 * "restore to here" options. `sequence` excludes CANCELLED; that's handled
 * separately via `isCancelled`.
 *
 * `onTransition` is optional — omit it (and leave `isEditing` false) for a
 * read-only rendering, e.g. the Social Media pipeline's per-client dropdown,
 * which shows the same stepper purely as a status display with nothing to
 * click.
 */
export function StageStepper({
  sequence,
  currentStage,
  isCancelled,
  isEditing,
  labelFor,
  onTransition,
}: {
  sequence: string[];
  currentStage: string;
  isCancelled: boolean;
  isEditing: boolean;
  labelFor: (stage: string) => string;
  onTransition?: (stage: string) => void;
}) {
  const currentIdx = sequence.indexOf(currentStage);
  const upcoming = !isCancelled && currentIdx !== -1 && currentIdx < sequence.length - 1 ? sequence[currentIdx + 1] : null;

  if (isCancelled) {
    if (!isEditing || !onTransition) return <Badge variant="destructive">Cancelled</Badge>;
    return (
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
        <Badge variant="destructive">Cancelled</Badge>
        {sequence.map((stage) => (
          <div key={stage} className="flex items-center gap-1">
            <IconChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            <Tooltip label="Restore to here">
              <button
                type="button"
                onClick={() => onTransition(stage)}
                className="rounded-full border border-dashed border-amber-500 px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
              >
                {labelFor(stage)}
              </button>
            </Tooltip>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {sequence.map((stage, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isNext = onTransition && stage === upcoming;
        return (
          <div key={stage} className="flex items-center gap-1">
            {idx > 0 && <IconChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />}
            {isNext ? (
              <Tooltip label="Click to move here">
                <button
                  type="button"
                  onClick={() => onTransition(stage)}
                  className="rounded-full border border-dashed border-primary px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  {labelFor(stage)}
                </button>
              </Tooltip>
            ) : isDone && isEditing && onTransition ? (
              <Tooltip label="Undo to here">
                <button
                  type="button"
                  onClick={() => onTransition(stage)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-amber-500 px-2.5 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
                >
                  <IconCheck className="h-3 w-3 shrink-0" />
                  {labelFor(stage)}
                </button>
              </Tooltip>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground/50"
                )}
              >
                {isDone && <IconCheck className="h-3 w-3 shrink-0" />}
                {labelFor(stage)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

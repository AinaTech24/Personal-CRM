"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { format, isAfter, isBefore, isSameDay, parseISO } from "date-fns";
import { IconCalendar, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";
import { CalendarMonth, type DayState } from "@/components/ui/calendar";

interface DateRangePickerProps {
  /** "YYYY-MM-DD" or "". */
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

const KEY = "yyyy-MM-dd";
const toKey = (d: Date) => format(d, KEY);
const parse = (s: string) => (s ? parseISO(s) : null);

/**
 * A single date-range picker: click a start, then an end, and the days between
 * (plus both endpoints) highlight. Speaks the "YYYY-MM-DD" keys the attendance
 * filters use, and shares the app's one calendar grid via CalendarMonth.
 */
export function DateRangePicker({ from, to, onChange, placeholder = "Pick a range", className, id }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const start = parse(from);
  const end = parse(to);
  const [viewMonth, setViewMonth] = useState(start ?? new Date());
  // While choosing the end, hovering previews the range.
  const [hover, setHover] = useState<Date | null>(null);

  function pick(day: Date) {
    if (!start || (start && end)) {
      // Start a fresh range.
      onChange(toKey(day), "");
      return;
    }
    // Close the range; order the two clicks.
    if (isBefore(day, start)) {
      onChange(toKey(day), toKey(start));
    } else {
      onChange(toKey(start), toKey(day));
    }
    setHover(null);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("", "");
  }

  // The [lo, hi] currently shown: the committed range, or start + hovered day
  // while the end is still being chosen.
  const previewEnd = end ?? (start && hover ? hover : null);
  let lo: Date | null = null;
  let hi: Date | null = null;
  if (start && previewEnd) {
    [lo, hi] = isAfter(previewEnd, start) ? [start, previewEnd] : [previewEnd, start];
  }

  function dayState(day: Date): DayState {
    const isStart = start ? isSameDay(day, start) : false;
    const isEnd = end ? isSameDay(day, end) : false;
    if (!lo || !hi || isSameDay(lo, hi)) {
      return { selected: isStart || isEnd };
    }
    const within = !isBefore(day, lo) && !isAfter(day, hi);
    return {
      selected: isSameDay(day, lo) || isSameDay(day, hi),
      inRange: within,
      bandLeft: isSameDay(day, lo),
      bandRight: isSameDay(day, hi),
    };
  }

  const label = start
    ? end
      ? `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`
      : `${format(start, "MMM d, yyyy")} – …`
    : placeholder;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className
          )}
        >
          <IconCalendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate text-left", !start && "text-muted-foreground")}>{label}</span>
          {start && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear range"
              onClick={clear}
              className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
            >
              <IconX className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <CalendarMonth
            viewMonth={viewMonth}
            onViewMonthChange={setViewMonth}
            onPick={pick}
            onHover={setHover}
            dayState={dayState}
          />
          <p className="mt-2 border-t border-border pt-2 text-center text-[11px] text-muted-foreground">
            {start && !end ? "Pick the end date" : "Pick a start and end date"}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

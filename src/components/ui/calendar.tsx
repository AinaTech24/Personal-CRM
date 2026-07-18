"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Visual state for a single day cell, computed by the caller. */
export interface DayState {
  /** Solid highlight — a single selection or a range endpoint. */
  selected?: boolean;
  /** Light band — the day sits inside the selected range. */
  inRange?: boolean;
  /** Round the left edge of the band (range start). */
  bandLeft?: boolean;
  /** Round the right edge of the band (range end). */
  bandRight?: boolean;
}

/**
 * The shared month grid used by every calendar in the app (single-date and
 * range pickers). Caller supplies per-day visual state so one grid renders
 * both plain selection and range highlighting identically.
 */
export function CalendarMonth({
  viewMonth,
  onViewMonthChange,
  onPick,
  onHover,
  dayState,
}: {
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  onPick: (day: Date) => void;
  onHover?: (day: Date | null) => void;
  dayState: (day: Date) => DayState;
}) {
  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <>
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={() => onViewMonthChange(subMonths(viewMonth, 1))}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-medium">{format(viewMonth, "MMMM yyyy")}</span>
        <button
          type="button"
          onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
        >
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center" onMouseLeave={() => onHover?.(null)}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] font-medium text-muted-foreground">
            {w}
          </span>
        ))}
        {days.map((day) => {
          const st = dayState(day);
          const inMonth = isSameMonth(day, viewMonth);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                st.inRange && "bg-primary/10",
                st.bandLeft && "rounded-l-full",
                st.bandRight && "rounded-r-full"
              )}
            >
              <button
                type="button"
                onClick={() => onPick(day)}
                onMouseEnter={() => onHover?.(day)}
                className={cn(
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors hover:bg-accent",
                  !inMonth && "text-muted-foreground/40",
                  st.selected && "bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {format(day, "d")}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

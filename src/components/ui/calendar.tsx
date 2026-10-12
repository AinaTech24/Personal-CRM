"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), "MMMM"));
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
  yearRange,
}: {
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  onPick: (day: Date) => void;
  onHover?: (day: Date | null) => void;
  dayState: (day: Date) => DayState;
  /**
   * When set, the heading becomes month and year dropdowns so a distant year
   * (a date of birth) is one pick away instead of dozens of month clicks.
   */
  yearRange?: { from: number; to: number };
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
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-primary/5"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
        </button>
        {yearRange ? (
          <div className="flex items-center gap-1">
            <select
              aria-label="Month"
              value={viewMonth.getMonth()}
              onChange={(e) => onViewMonthChange(new Date(viewMonth.getFullYear(), Number(e.target.value), 1))}
              className="h-6 rounded border border-input bg-popover px-1 text-xs font-medium text-popover-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={viewMonth.getFullYear()}
              onChange={(e) => onViewMonthChange(new Date(Number(e.target.value), viewMonth.getMonth(), 1))}
              className="h-6 rounded border border-input bg-popover px-1 text-xs font-medium text-popover-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {Array.from({ length: yearRange.to - yearRange.from + 1 }, (_, i) => yearRange.to - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="text-xs font-medium">{format(viewMonth, "MMMM yyyy")}</span>
        )}
        <button
          type="button"
          onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-primary/5"
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
          const today = isToday(day);
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
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors hover:bg-primary/5",
                  !inMonth && "text-muted-foreground/40",
                  // Today is ringed rather than filled, so it stays visible under
                  // a selection (solid primary) without competing with it. The
                  // ring is dropped once the day is actually selected.
                  today && !st.selected && "font-semibold text-primary ring-1 ring-inset ring-primary/50",
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

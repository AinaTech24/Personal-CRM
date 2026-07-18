"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  addMonths,
  subMonths,
} from "date-fns";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface DatePickerProps {
  /** "YYYY-MM-DD" or "" for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  id?: string;
}

/** Date-only picker (no time). Emits and accepts "YYYY-MM-DD", matching the attendance date keys. */
export function DatePicker({ value, onChange, placeholder = "Pick a date", clearable = true, className, id }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : null;
  const [viewMonth, setViewMonth] = useState(selected ?? new Date());

  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setViewMonth(selected ?? new Date());
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? format(selected, "d MMM yyyy") : placeholder}
          </span>
          <span className="flex items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear date"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="rounded-sm text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-3.5 w-3.5" />
              </span>
            )}
            <IconCalendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setViewMonth((m) => subMonths(m, 1))} className="rounded-md p-1 hover:bg-accent" aria-label="Previous month">
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{format(viewMonth, "MMMM yyyy")}</span>
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} className="rounded-md p-1 hover:bg-accent" aria-label="Next month">
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = selected && isSameDay(day, selected);
              const inMonth = isSameMonth(day, viewMonth);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(format(day, "yyyy-MM-dd"));
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-sm transition-colors",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                    !inMonth && "text-muted-foreground/40",
                    !isSelected && isToday && "ring-1 ring-primary/50"
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

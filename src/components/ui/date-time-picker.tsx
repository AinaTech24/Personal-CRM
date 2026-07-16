"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  setHours,
  setMinutes,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({ value, onChange, placeholder = "Pick a date", className }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value ?? new Date());

  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const hour = value ? value.getHours() : 9;
  const minute = value ? value.getMinutes() : 0;

  function pickDay(day: Date) {
    const withTime = setMinutes(setHours(day, hour), minute);
    onChange(withTime);
    setOpen(false);
  }

  function setHour(h: number) {
    const base = value ?? new Date();
    onChange(setHours(base, ((h % 24) + 24) % 24));
  }

  function setMinute(m: number) {
    const base = value ?? new Date();
    onChange(setMinutes(base, ((m % 60) + 60) % 60));
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className
          )}
        >
          <IconCalendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? format(value, "MMM d, yyyy · h:mm a") : placeholder}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
            >
              <IconChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-medium">{format(viewMonth, "MMMM yyyy")}</span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
            >
              <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[10px] font-medium text-muted-foreground">
                {w}
              </span>
            ))}
            {days.map((day) => {
              const selected = value && isSameDay(day, value);
              const inMonth = isSameMonth(day, viewMonth);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={cn(
                    "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors hover:bg-accent",
                    !inMonth && "text-muted-foreground/40",
                    selected && "bg-primary text-primary-foreground hover:bg-primary"
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-border pt-3">
            <TimeStepper label="HH" value={hour} onChange={setHour} max={23} />
            <span className="text-sm text-muted-foreground">:</span>
            <TimeStepper label="MM" value={minute} onChange={setMinute} max={59} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function TimeStepper({
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(value + 1 > max ? 0 : value + 1)}
        className="flex h-5 w-8 items-center justify-center rounded text-xs text-muted-foreground hover:bg-accent"
      >
        +
      </button>
      <span className="w-8 text-center text-sm tabular-nums">{String(value).padStart(2, "0")}</span>
      <button
        type="button"
        onClick={() => onChange(value - 1 < 0 ? max : value - 1)}
        className="flex h-5 w-8 items-center justify-center rounded text-xs text-muted-foreground hover:bg-accent"
      >
        −
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { format, isSameDay, setHours, setMinutes } from "date-fns";
import { IconCalendar, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";
import { CalendarMonth } from "@/components/ui/calendar";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder?: string;
  className?: string;
  /** Hide the time strip and show a date-only trigger. Defaults to true (date + time). */
  showTime?: boolean;
  /** Show an X to clear the value. Requires onClear. */
  clearable?: boolean;
  onClear?: () => void;
  id?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  showTime = true,
  clearable = false,
  onClear,
  id,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value ?? new Date());

  const hour = value ? value.getHours() : 9;
  const minute = value ? value.getMinutes() : 0;

  function pickDay(day: Date) {
    const withTime = setMinutes(setHours(day, showTime ? hour : 0), showTime ? minute : 0);
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
          id={id}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className
          )}
        >
          <IconCalendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate text-left", !value && "text-muted-foreground")}>
            {value ? format(value, showTime ? "MMM d, yyyy · h:mm a" : "MMM d, yyyy") : placeholder}
          </span>
          {clearable && value && onClear && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
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
            onPick={pickDay}
            dayState={(day) => ({ selected: !!value && isSameDay(day, value) })}
          />
          {showTime && (
            <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-border pt-3">
              <TimeStepper label="HH" value={hour} onChange={setHour} max={23} />
              <span className="text-sm text-muted-foreground">:</span>
              <TimeStepper label="MM" value={minute} onChange={setMinute} max={59} />
            </div>
          )}
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

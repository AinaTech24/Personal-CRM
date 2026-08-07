"use client";

import { useEffect, useRef, useState } from "react";
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

  const hour24 = value ? value.getHours() : 9;
  const minute = value ? value.getMinutes() : 0;
  const meridiem: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  // 12-hour clock: midnight (0) and noon (12) both read as 12.
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  function pickDay(day: Date) {
    const withTime = setMinutes(setHours(day, showTime ? hour24 : 0), showTime ? minute : 0);
    onChange(withTime);
    setOpen(false);
  }

  /** Set the hour from a 1–12 value, keeping the current AM/PM. */
  function setHour12(h: number) {
    const h12 = ((h - 1 + 12) % 12) + 1; // wrap into 1..12
    const h24 = (h12 % 12) + (meridiem === "PM" ? 12 : 0);
    onChange(setHours(value ?? new Date(), h24));
  }

  /** Flip AM/PM without changing the displayed hour. */
  function setMeridiem(m: "AM" | "PM") {
    if (m === meridiem) return;
    const h24 = (hour12 % 12) + (m === "PM" ? 12 : 0);
    onChange(setHours(value ?? new Date(), h24));
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
              <TimeStepper label="HH" value={hour12} onChange={setHour12} min={1} max={12} />
              <span className="text-sm text-muted-foreground">:</span>
              <TimeStepper label="MM" value={minute} onChange={setMinute} max={59} />
              {/* AM/PM stacked so the picker stays a 12-hour clock; the trigger
                  already renders the time as "h:mm a". */}
              <div className="ml-1.5 flex flex-col gap-0.5">
                {(["AM", "PM"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={meridiem === m}
                    onClick={() => setMeridiem(m)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                      meridiem === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/5"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * One half of the HH:MM control.
 *
 * The number is typable, not just steppable — reaching :45 by clicking "+"
 * forty-five times is not a time picker. The steppers stay for nudging.
 *
 * While focused the field holds its own draft string so a half-typed "1" on the
 * way to "17" isn't reformatted to "01" under the cursor.
 */
function TimeStepper({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = draft ?? String(value).padStart(2, "0");

  function commit(text: string) {
    const n = Number.parseInt(text, 10);
    if (Number.isNaN(n)) return;
    onChange(Math.min(Math.max(n, min), max));
  }

  // Wired as a native listener rather than JSX onWheel: React always attaches
  // wheel handlers as passive, so e.preventDefault() inside one is silently a
  // no-op — without this, scrolling the number would also scroll whatever's
  // behind the popover (nothing here clips/contains that scroll).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const next = e.deltaY < 0 ? (value + 1 > max ? min : value + 1) : value - 1 < min ? max : value - 1;
      onChange(next);
      setDraft(String(next).padStart(2, "0"));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [value, min, max, onChange]);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value + 1 > max ? min : value + 1)}
        className="flex h-5 w-9 items-center justify-center rounded text-xs text-muted-foreground hover:bg-primary/5"
      >
        +
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={shown}
        // Focus selects everything so typing overwrites rather than appends.
        onFocus={(e) => {
          setDraft(String(value).padStart(2, "0"));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setDraft(digits);
          if (digits) commit(digits);
        }}
        onBlur={() => {
          if (draft !== null && draft !== "") commit(draft);
          setDraft(null); // fall back to the canonical, zero-padded value
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = value + 1 > max ? min : value + 1;
            onChange(next);
            setDraft(String(next).padStart(2, "0"));
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = value - 1 < min ? max : value - 1;
            onChange(next);
            setDraft(String(next).padStart(2, "0"));
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-9 rounded border border-transparent bg-transparent text-center text-sm tabular-nums outline-none hover:border-border focus:border-ring focus:bg-background"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(value - 1 < min ? max : value - 1)}
        className="flex h-5 w-9 items-center justify-center rounded text-xs text-muted-foreground hover:bg-primary/5"
      >
        −
      </button>
    </div>
  );
}

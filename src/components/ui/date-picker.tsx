"use client";

import { format, parseISO } from "date-fns";
import { DateTimePicker } from "@/components/ui/date-time-picker";

interface DatePickerProps {
  /** "YYYY-MM-DD" or "" for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  id?: string;
  /** Month/year dropdowns in the calendar, for far-off dates such as a date of birth. */
  yearRange?: { from: number; to: number };
}

/**
 * Date-only picker that speaks "YYYY-MM-DD" (the attendance date-key format).
 * It's a thin adapter over DateTimePicker with the time strip hidden, so the
 * whole app shares one calendar UI rather than two.
 */
export function DatePicker({ value, onChange, placeholder = "Pick a date", clearable = true, className, id, yearRange }: DatePickerProps) {
  return (
    <DateTimePicker
      id={id}
      showTime={false}
      yearRange={yearRange}
      clearable={clearable}
      placeholder={placeholder}
      className={className}
      value={value ? parseISO(value) : null}
      onChange={(d) => onChange(format(d, "yyyy-MM-dd"))}
      onClear={() => onChange("")}
    />
  );
}

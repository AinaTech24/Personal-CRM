"use client";

import * as React from "react";

interface FieldError {
  msg: string;
  top: number;
  left: number;
}

/**
 * Shared logic that replaces a form control's native validation bubble with a
 * themed tooltip. Suppresses the browser popup on `invalid`, keeps the native
 * submit-blocking behaviour, and clears the message as soon as the user edits.
 */
export function useFieldValidation<T extends HTMLInputElement | HTMLTextAreaElement>({
  onInvalid,
  onChange,
  onBlur,
  forwardedRef,
}: {
  onInvalid?: React.FormEventHandler<T>;
  onChange?: React.ChangeEventHandler<T>;
  onBlur?: React.FocusEventHandler<T>;
  forwardedRef?: React.Ref<T>;
}) {
  const [error, setError] = React.useState<FieldError | null>(null);

  const setRef = React.useCallback(
    (node: T | null) => {
      const r = forwardedRef;
      if (typeof r === "function") r(node);
      // Assigning a forwarded ref's `.current` is a standard ref-forwarding pattern.
      // eslint-disable-next-line react-hooks/immutability
      else if (r) (r as React.MutableRefObject<T | null>).current = node;
    },
    [forwardedRef]
  );

  function positionFrom(el: T): FieldError {
    const r = el.getBoundingClientRect();
    return { msg: el.validationMessage || "Please fill out this field.", top: r.bottom + 6, left: r.left + Math.min(24, r.width / 2) };
  }

  const handleInvalid: React.FormEventHandler<T> = (e) => {
    e.preventDefault(); // suppress the native bubble
    setError(positionFrom(e.currentTarget));
    onInvalid?.(e);
  };

  const handleChange: React.ChangeEventHandler<T> = (e) => {
    if (error) setError(null);
    onChange?.(e);
  };

  const handleBlur: React.FocusEventHandler<T> = (e) => {
    setError(null);
    onBlur?.(e);
  };

  // Auto-dismiss so a stale, scroll-detached tooltip never lingers.
  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return { error, setRef, handleInvalid, handleChange, handleBlur };
}

/** The floating message itself; render inside a portal at document.body. */
export function ValidationTooltip({ msg, top, left }: FieldError) {
  return (
    <span
      role="alert"
      style={{ position: "fixed", top, left, zIndex: 100 }}
      className="pointer-events-none flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive px-2.5 py-1.5 text-xs font-medium text-destructive-foreground shadow-lg"
    >
      <span
        aria-hidden
        className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t border-destructive/40 bg-destructive"
      />
      {msg}
    </span>
  );
}

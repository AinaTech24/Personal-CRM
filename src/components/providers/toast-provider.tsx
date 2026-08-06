"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconX } from "@/components/icons";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  onClick?: () => void;
  /** Leading visual — a sender's photo, say, in place of the variant icon. */
  avatarDataUrl?: string | null;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Makes the toast clickable; runs, then dismisses it. */
  onClick?: () => void;
  avatarDataUrl?: string | null;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

const VARIANT_STYLES: Record<ToastVariant, { ring: string; icon: React.ReactNode; accent: string }> = {
  success: {
    ring: "border-emerald-500/40",
    accent: "bg-emerald-500/15 text-emerald-500",
    icon: <IconCheck className="h-4 w-4" />,
  },
  error: {
    ring: "border-destructive/50",
    accent: "bg-destructive/15 text-destructive",
    icon: <IconX className="h-4 w-4" />,
  },
  warning: {
    ring: "border-amber-500/40",
    accent: "bg-amber-500/15 text-amber-500",
    icon: <span className="text-sm font-bold leading-none">!</span>,
  },
  info: {
    ring: "border-primary/40",
    accent: "bg-primary/15 text-primary",
    icon: <span className="text-sm font-bold leading-none">i</span>,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `toast-${++counter.current}`;
      const item: ToastItem = { id, variant: "info", ...input };
      // Newest first (front of the stack).
      setToasts((prev) => [item, ...prev].slice(0, 6));
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api: ToastContextValue = {
    toast,
    success: (title, description) => toast({ title, description, variant: "success" }),
    error: (title, description) => toast({ title, description, variant: "error" }),
    warning: (title, description) => toast({ title, description, variant: "warning" }),
    info: (title, description) => toast({ title, description, variant: "info" }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        Stacked deck, top-center. Newest in front; older ones peek behind.
        Offset by --safe-top (see globals.css), not a bare `top-4` — in a
        PWA running standalone with an edge-to-edge status bar, a bare
        offset from the viewport's true top lands the toast right under the
        clock/signal/wifi icons instead of below them.
      */}
      <div className="pointer-events-none fixed left-1/2 top-[calc(1rem+var(--safe-top,0px))] z-[200] flex w-[380px] max-w-[92vw] -translate-x-1/2 justify-center">
        <div className="relative w-full">
          <AnimatePresence initial={false}>
            {toasts.map((t, index) => {
              const style = VARIANT_STYLES[t.variant];
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: -24, scale: 0.9 }}
                  animate={{
                    opacity: index < MAX_VISIBLE ? 1 : 0,
                    y: index * 12,
                    scale: 1 - index * 0.05,
                  }}
                  exit={{ opacity: 0, y: -24, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  style={{ zIndex: 100 - index }}
                  onClick={
                    t.onClick
                      ? () => {
                          t.onClick?.();
                          dismiss(t.id);
                        }
                      : undefined
                  }
                  className={cn(
                    "pointer-events-auto absolute left-0 right-0 top-0 flex gap-3 rounded-lg border bg-popover px-3.5 py-3 text-popover-foreground shadow-lg",
                    t.description ? "items-start" : "items-center",
                    t.onClick && "cursor-pointer transition-colors hover:bg-primary/5",
                    style.ring
                  )}
                >
                  {t.avatarDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.avatarDataUrl}
                      alt=""
                      className={cn("h-6 w-6 shrink-0 rounded-full object-cover", t.description && "mt-0.5")}
                    />
                  ) : (
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        t.description && "mt-0.5",
                        style.accent
                      )}
                    >
                      {style.icon}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug">{t.title}</p>
                    {t.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      // Otherwise this bubbles into the toast's own click and
                      // navigates instead of just closing it.
                      e.stopPropagation();
                      dismiss(t.id);
                    }}
                    aria-label="Dismiss"
                    className={cn(
                      "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
                      t.description && "mt-0.5"
                    )}
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe no-op fallback if used outside the provider.
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    };
  }
  return ctx;
}

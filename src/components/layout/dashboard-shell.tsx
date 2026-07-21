"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "aina-sidebar-collapsed";

/**
 * Dashboard chrome. The sidebar/main split is a CSS grid whose first column
 * width animates via grid-template-columns — reliable, unlike transitioning a
 * flex item's width. The collapsed preference is persisted.
 */
export function DashboardShell({
  isAdmin,
  name,
  email,
  children,
}: {
  isAdmin: boolean;
  name: string;
  email: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Animate only after mount so the initial restore is instant, not a slide-in.
  const [animate, setAnimate] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    const id = setTimeout(() => setAnimate(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div
      className={cn(
        // dvh, not vh: on Android Chrome and mobile Safari 100vh is the viewport
        // with the address bar hidden, so the shell overflowed and — being
        // overflow-hidden — pushed the bottom of the page off-screen.
        "grid h-[100dvh] w-full grid-cols-[1fr] overflow-hidden",
        collapsed ? "md:grid-cols-[4rem_1fr]" : "md:grid-cols-[15rem_1fr]",
        animate && "md:[transition:grid-template-columns_300ms_ease-in-out]"
      )}
    >
      <Sidebar isAdmin={isAdmin} collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-col overflow-hidden">
        <Topbar name={name} email={email} isAdmin={isAdmin} onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+var(--safe-bottom,0px))] sm:p-6 sm:pb-[calc(1.5rem+var(--safe-bottom,0px))]">
          {children}
        </main>
      </div>

      {/* Mobile drawer. Driven by CSS transitions rather than mount/unmount so a
          half-finished animation can never leave an invisible backdrop over the app. */}
      <div
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
        style={{ opacity: mobileOpen ? 1 : 0, pointerEvents: mobileOpen ? "auto" : "none" }}
        className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden"
      />
      <div
        style={{ transform: mobileOpen ? "translateX(0)" : "translateX(-100%)" }}
        className="fixed inset-y-0 left-0 z-50 w-64 shadow-2xl transition-transform duration-300 ease-out md:hidden"
      >
        <Sidebar
          isAdmin={isAdmin}
          collapsed={false}
          onToggle={() => setMobileOpen(false)}
          mobile
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
    </div>
  );
}

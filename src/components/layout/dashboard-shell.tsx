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

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    const id = setTimeout(() => setAnimate(true), 80);
    return () => clearTimeout(id);
  }, []);

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
        "grid h-screen w-full grid-cols-[1fr] overflow-hidden",
        collapsed ? "md:grid-cols-[4rem_1fr]" : "md:grid-cols-[15rem_1fr]",
        animate && "md:[transition:grid-template-columns_300ms_ease-in-out]"
      )}
    >
      <Sidebar isAdmin={isAdmin} collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-col overflow-hidden">
        <Topbar name={name} email={email} isAdmin={isAdmin} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

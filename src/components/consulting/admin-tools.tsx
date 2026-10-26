"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";

/** Admin one-clicks: install the kit's starter content, run the scheduled automations now. */
export function AdminTools({ starterInstalled }: { starterInstalled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function call(key: string, url: string, done: (data: Record<string, unknown>) => string) {
    setBusy(key);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "That didn't work");
      else {
        toast.success(done(data));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {!starterInstalled && (
        <Button
          size="sm"
          disabled={!!busy}
          onClick={() =>
            call("setup", "/api/v1/setup", (d) => {
              const created = Array.isArray(d.created) ? (d.created as string[]) : [];
              return created.length ? `Installed ${created.join(", ")}` : "Already installed";
            })
          }
        >
          {busy === "setup" ? "Installing…" : "Install AINA diagnostic template"}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!!busy}
        onClick={() => call("run", "/api/v1/automations/run", (d) => `Automations ran — ${Number(d.processed ?? 0)} event(s) processed`)}
      >
        {busy === "run" ? "Running…" : "Run automations now"}
      </Button>
    </div>
  );
}

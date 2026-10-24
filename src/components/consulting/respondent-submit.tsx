"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";

/** The respondent's "I'm done" — submits through their link. */
export function RespondentSubmit({ url }: { url: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Submit your answers? Your consultant will review them; you won't be able to change them after this.")) return;
        setBusy(true);
        try {
          const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "submit" }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const missing = Array.isArray(data.details) && data.details.length ? ` (${data.details.length} required question${data.details.length === 1 ? "" : "s"} left)` : "";
            toast.error(`${data.error ?? "Couldn't submit"}${missing}`);
          } else router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Submitting…" : "Submit answers"}
    </Button>
  );
}

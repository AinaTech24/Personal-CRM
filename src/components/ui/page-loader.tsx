import { Diamond } from "@/components/loading-ui/diamond";
import { cn } from "@/lib/utils";

/** A Diamond loader centered in its container — the whole viewport by default, or a shorter box (e.g. inside a tab panel) via `className`. */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[60vh] w-full items-center justify-center", className)}>
      <Diamond className="size-10 text-primary" />
    </div>
  );
}

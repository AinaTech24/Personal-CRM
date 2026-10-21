import { Diamond } from "@/components/loading-ui/diamond";

/** Shown by Next.js while a route outside the dashboard shell (/login, /invite/[token], …) is loading. */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <Diamond className="size-10 text-primary" />
    </div>
  );
}

import { cn } from "@/lib/utils";

/** Small round avatar bubble — photo if there is one, else an initial. */
export function UserAvatar({
  name,
  avatarDataUrl,
  className,
}: {
  name: string;
  avatarDataUrl?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[9px] font-semibold text-primary",
        className
      )}
    >
      {avatarDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarDataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        (name.trim()[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}

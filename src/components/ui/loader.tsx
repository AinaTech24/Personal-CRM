import { cn } from "@/lib/utils";

export function EightDotsRotate(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>
      <g>
        <circle cx="3" cy="12" r="2" fill="#A82C29" />
        <circle cx="21" cy="12" r="2" fill="#A82C29" />
        <circle cx="12" cy="21" r="2" fill="#A82C29" />
        <circle cx="12" cy="3" r="2" fill="#A82C29" />
        <circle cx="5.64" cy="5.64" r="2" fill="#A82C29" />
        <circle cx="18.36" cy="18.36" r="2" fill="#A82C29" />
        <circle cx="5.64" cy="18.36" r="2" fill="#A82C29" />
        <circle cx="18.36" cy="5.64" r="2" fill="#A82C29" />
        <animateTransform
          attributeName="transform"
          dur="1.5s"
          repeatCount="indefinite"
          type="rotate"
          values="0 12 12;360 12 12"
        />
      </g>
    </svg>
  );
}

/** Centered page-level loading state — use in place of the module boards' loading text. */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-1 items-center justify-center py-24", className)}>
      <EightDotsRotate className="h-9 w-9" />
    </div>
  );
}

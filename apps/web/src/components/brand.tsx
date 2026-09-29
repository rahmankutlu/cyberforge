import { cn } from "@cyberforge/ui";

/**
 * CyberForge mark: an "F" drawn as a small connected-node graph. Deliberately abstract: no
 * skulls, hooded figures or padlocks.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-6 text-primary", className)}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="5.5" strokeOpacity="0.45" />
      <path d="M8 7v10M8 7h8M8 12h5" />
      <g fill="currentColor" stroke="none">
        <circle cx="8" cy="7" r="1.6" />
        <circle cx="8" cy="12" r="1.6" />
        <circle cx="8" cy="17" r="1.6" />
        <circle cx="16" cy="7" r="1.6" />
        <circle cx="13" cy="12" r="1.6" />
      </g>
    </svg>
  );
}

export function BrandWordmark({
  className,
  tagline = false,
}: {
  className?: string;
  tagline?: boolean;
}) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="text-[15px] tracking-tight">
        <span className="font-normal text-foreground/85">Cyber</span>
        <span className="font-semibold text-foreground">Forge</span>
      </span>
      {tagline ? (
        <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Open Cybersecurity Lab
        </span>
      ) : null}
    </span>
  );
}

export function Brand({ tagline = false, className }: { tagline?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <BrandWordmark tagline={tagline} />
    </span>
  );
}

import { cn } from "@/lib/utils";

/**
 * AI Workspace mark: a solid ring in the accent (the dealt "ring" mark). Flat, no gradient.
 * `animated` is kept for API compatibility; the mark itself does not move.
 */
export function LogoMark({ size = 28, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0 text-accent", className)} role="img" aria-label="AI Workspace">
      <path fill="currentColor" fillRule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 5.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z" />
    </svg>
  );
}

export function Logo({ size = 22, className, wordmark = true }: { size?: number; animated?: boolean; className?: string; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {wordmark && <span className="text-[16px] font-semibold tracking-[-0.02em] text-fg">AI Workspace</span>}
    </span>
  );
}

import { motion } from "motion/react";
import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-hover text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-line bg-sunken px-1 font-mono text-2xs text-subtle">{children}</kbd>;
}

export function Progress({ value, tone = "accent", className, label }: { value: number; tone?: "accent" | "success" | "warning" | "danger" | "muted"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger", muted: "bg-subtle" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className={cn("h-1 w-full overflow-hidden rounded-full bg-hover", className)}>
      <motion.div className={cn("h-full origin-left rounded-full", color)} initial={{ scaleX: 0 }} animate={{ scaleX: pct / 100 }} transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function ActivityDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2", className)} aria-hidden>
      <span className="absolute inset-0 animate-pulse-dot rounded-full bg-accent" />
    </span>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-subtle [&_svg]:size-4">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Не вдалося завантажити", message, onRetry, className }: { title?: string; message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-danger-soft text-danger">
        <AlertTriangle className="size-4" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {onRetry && (
        <Button className="mt-4" variant="outline" size="sm" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
          Спробувати ще раз
        </Button>
      )}
    </div>
  );
}

/** Inline banner for non-blocking states (e.g. AI not configured). */
export function Notice({ tone = "warning", children, action }: { tone?: "warning" | "danger" | "accent"; children: ReactNode; action?: ReactNode }) {
  const t = { warning: "border-warning/30 bg-warning-soft", danger: "border-danger/30 bg-danger-soft", accent: "border-accent/30 bg-accent-soft" }[tone];
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 text-sm", t)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

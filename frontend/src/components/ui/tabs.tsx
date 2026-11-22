import * as T from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dur, t } from "@/lib/motion";

export interface TabDef {
  value: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/** Underline tabs with a shared-layout indicator. Content is rendered by the caller. */
export function Tabs({ value, onChange, tabs, className }: { value: string; onChange: (v: string) => void; tabs: TabDef[]; className?: string }) {
  const layoutId = useId();
  return (
    <T.Root value={value} onValueChange={onChange}>
      <T.List className={cn("relative -mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]", className)} aria-label="Розділи">
        {tabs.map((tab) => (
          <T.Trigger
            key={tab.value}
            value={tab.value}
            className="relative flex h-9 shrink-0 items-center gap-1.5 px-2 text-sm text-muted transition-colors duration-150 hover:text-fg data-[state=active]:text-fg [&_svg]:size-3.5"
          >
            {tab.icon}
            {tab.label}
            {tab.count ? <span className="tabular text-2xs text-subtle">{tab.count}</span> : null}
            {value === tab.value && <motion.span layoutId={layoutId} transition={t(dur.dropdown)} className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-fg" />}
          </T.Trigger>
        ))}
      </T.List>
    </T.Root>
  );
}

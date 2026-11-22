import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { Kbd } from "./feedback";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <T.Provider delayDuration={350} skipDelayDuration={150}>
    {children}
  </T.Provider>
);

export function Tooltip({ content, shortcut, children, side = "top" }: { content: ReactNode; shortcut?: string; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-md border border-line bg-elevated px-2 py-1 text-xs text-fg shadow-[var(--shadow-pop)] pop"
        >
          {content}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

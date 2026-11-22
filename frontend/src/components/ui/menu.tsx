import * as M from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={4} collisionPadding={12} className={cn("pop z-50 min-w-44 rounded-lg border border-line bg-elevated p-1 shadow-[var(--shadow-pop)]", className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ icon, children, onSelect, destructive, shortcut, disabled }: { icon?: ReactNode; children: ReactNode; onSelect?: () => void; destructive?: boolean; shortcut?: string; disabled?: boolean }) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover [&_svg]:size-3.5 [&_svg]:text-subtle",
        destructive && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-2xs text-subtle">{shortcut}</span>}
    </M.Item>
  );
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className="px-2 py-1 text-2xs font-medium text-subtle">{children}</M.Label>;

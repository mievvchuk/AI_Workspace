import * as D from "@radix-ui/react-dialog";
import * as P from "@radix-ui/react-popover";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./button";

const overlay = "ov fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const DIALOG_WIDTH = { sm: "sm:max-w-[420px]", md: "sm:max-w-[500px]", lg: "sm:max-w-[680px]" };

/**
 * Flexible layout instead of top/left/translate math: a full-screen flex container centres the
 * dialog, its height is capped to the viewport minus a gutter, and only the body scrolls, so the
 * header and the action buttons are always visible on any screen (short laptops, zoomed browsers).
 * Below `sm` it becomes a bottom sheet.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, className, size = "md" }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-[clamp(12px,4vh,40px)]">
          <D.Content
            className={cn(
              "pointer-events-auto flex w-full flex-col border border-line bg-elevated shadow-[var(--shadow-pop)]",
              "max-h-[calc(100dvh-24px)] rounded-t-2xl sheet safe-bottom",
              "sm:dlg sm:max-h-full sm:rounded-2xl",
              DIALOG_WIDTH[size],
              className,
            )}
          >
          <div className="flex shrink-0 items-start gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <D.Title className="text-base font-medium">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild>
              <IconButton label="Закрити" size="sm" tooltip={false}>
                <X />
              </IconButton>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </D.Content>
        </div>
      </D.Portal>
    </D.Root>
  );
}

export function Drawer({ open, onOpenChange, side = "left", children, title, className }: { open: boolean; onOpenChange: (o: boolean) => void; side?: "left" | "right"; children: ReactNode; title: string; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 z-50 flex w-[min(86vw,320px)] flex-col bg-bg shadow-[var(--shadow-pop)]",
            side === "left" ? "left-0 drawer-l border-r border-line" : "right-0 drawer-r w-[min(92vw,400px)] border-l border-line",
            className,
          )}
        >
          <D.Title className="sr-only">{title}</D.Title>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Видалити",
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Скасувати
          </Button>
          <Button variant={destructive ? "danger" : "primary"} loading={busy} onClick={run}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}

export function Popover({ trigger, children, align = "start", side = "bottom", className, open, onOpenChange }: { trigger: ReactNode; children: ReactNode; align?: "start" | "center" | "end"; side?: "top" | "bottom"; className?: string; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn("pop z-50 rounded-lg border border-line bg-elevated p-1 shadow-[var(--shadow-pop)]", className)}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

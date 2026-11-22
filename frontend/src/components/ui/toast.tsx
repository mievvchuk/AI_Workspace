import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { create } from "zustand";
import { t, dur } from "@/lib/motion";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, "id">) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (item) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-3), { ...item, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), item.kind === "error" ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToasts.getState().push({ kind: "success", title, description }),
  error: (title: string, description?: string) => useToasts.getState().push({ kind: "error", title, description }),
  info: (title: string, description?: string) => useToasts.getState().push({ kind: "info", title, description }),
};

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const colors = { success: "text-success", error: "text-danger", info: "text-accent" };

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 safe-bottom empty:p-0 sm:items-end">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const Icon = icons[item.kind];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98, transition: t(0.14) }}
              transition={t(dur.dialog)}
              role={item.kind === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-elevated px-3 py-2.5 shadow-[var(--shadow-pop)]"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", colors[item.kind])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && <p className="mt-0.5 text-sm text-muted">{item.description}</p>}
              </div>
              <button aria-label="Закрити" onClick={() => dismiss(item.id)} className="rounded p-0.5 text-subtle hover:text-fg">
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

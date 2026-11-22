import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, ChevronRight, Circle, CircleDashed, FileSearch, Loader2, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRequestLog } from "@/lib/queries";
import { currentStep, logFromEvents, type ProcessLog, type Step } from "@/lib/sse";
import { collapse, dur, t } from "@/lib/motion";
import { cn, formatDuration } from "@/lib/utils";
import { ActivityDot } from "@/components/ui/feedback";

/** Shown when the server has been silent for this long during a live request. */
const SILENCE_MS = 6000;

const META_LABELS: Record<string, string> = {
  subject: "Предмет",
  project: "Проєкт",
  lab: "Лабораторна",
  file: "Файл",
  files: "Файли",
  sources: "Джерела",
  documents: "Документів",
  fragments: "Фрагментів",
  history_messages: "Повідомлень в історії",
  model: "Модель",
  effort: "Effort",
  provider: "Провайдер",
  first_token_ms: "Перший токен",
  prompt_tokens: "Токени запиту",
  completion_tokens: "Токени відповіді",
  reasoning_chars: "Обсяг міркувань, симв.",
  questions: "Запитань",
  format: "Формат",
  difficulty: "Складність",
  answered: "Відповідей",
  total: "Усього",
  code: "Код помилки",
  truncated: "Обмеження",
};

function useElapsed(startIso: string | null, running: boolean, fallbackMs: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);
  if (!running) return fallbackMs;
  return startIso ? Math.max(0, now - new Date(startIso).getTime()) : null;
}

function StatusIcon({ status, className }: { status: Step["status"] | ProcessLog["status"]; className?: string }) {
  const base = cn("size-3.5 shrink-0", className);
  switch (status) {
    case "running":
      return <Loader2 className={cn(base, "animate-spin text-accent")} />;
    case "completed":
      return <Check className={cn(base, "text-success")} strokeWidth={2.5} />;
    case "failed":
      return <X className={cn(base, "text-danger")} strokeWidth={2.5} />;
    case "cancelled":
      return <Ban className={cn(base, "text-subtle")} />;
    case "pending":
      return <Circle className={cn(base, "text-subtle")} />;
    default:
      return <CircleDashed className={cn(base, "text-subtle")} />;
  }
}

function MetaValue({ value }: { value: Step["metadata"][string] }) {
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-subtle">—</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v) => (
          <span key={v} className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-sm border border-line bg-surface px-1.5 text-2xs">
            <FileSearch className="size-3 shrink-0 text-subtle" />
            <span className="truncate">{v}</span>
          </span>
        ))}
      </span>
    );
  }
  return <span className="tabular">{String(value)}</span>;
}

function StepRow({ step }: { step: Step }) {
  const meta = Object.entries(step.metadata).filter(([k, v]) => k !== "first_token_ms" && v !== null && v !== "");
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={t(dur.dropdown)} className="group/step relative flex gap-2.5 pb-3 last:pb-0">
      <span className="absolute top-5 bottom-0 left-[6.5px] w-px bg-line group-last/step:hidden" aria-hidden />
      <span className="mt-[3px] flex size-3.5 items-center justify-center">
        <StatusIcon status={step.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm", step.status === "running" ? "text-fg" : "text-fg/90", step.status === "failed" && "text-danger")}>{step.title}</span>
          {step.duration_ms != null && step.status !== "running" && <span className="tabular ml-auto shrink-0 text-2xs text-subtle">{formatDuration(step.duration_ms)}</span>}
        </div>
        {step.description && <p className="text-xs text-muted">{step.description}</p>}
        {meta.length > 0 && (
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-2xs">
            {meta.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-subtle">{META_LABELS[k] ?? k}</dt>
                <dd className="min-w-0 text-muted">
                  <MetaValue value={v} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </motion.li>
  );
}

interface PanelProps {
  log: ProcessLog;
  live?: boolean;
  lastFrameAt?: number;
  defaultOpen?: boolean;
  /** collapse the log automatically once the request finishes (any terminal state) */
  collapseOnDone?: boolean;
  onStop?: () => void;
  stopping?: boolean;
  className?: string;
}

/**
 * AI Processing Panel: compact status line that expands into the real operation log.
 * Every row comes from a backend event; nothing here is simulated.
 */
export function AIProcessingPanel({ log, live = false, lastFrameAt, defaultOpen = false, collapseOnDone = false, onStop, stopping, className }: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    // On failure the headline itself carries the error, so the log can fold away too.
    if (!collapseOnDone || !["completed", "failed", "cancelled"].includes(log.status)) return;
    const id = setTimeout(() => setOpen(false), 700);
    return () => clearTimeout(id);
  }, [collapseOnDone, log.status]);
  const running = live && (log.status === "running" || log.status === "idle");
  const elapsed = useElapsed(log.startedAt, running, log.durationMs);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    if (!running || !lastFrameAt) {
      setSilent(false);
      return;
    }
    const check = () => setSilent(Date.now() - lastFrameAt > SILENCE_MS);
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [running, lastFrameAt]);

  const step = currentStep(log);
  let headline: string;
  if (log.status === "idle") headline = "Надсилання запиту…";
  else if (running) headline = silent ? "Очікування відповіді сервера…" : `${step?.title ?? "Обробка"}…`;
  else if (log.status === "completed") headline = "Опрацьовано";
  else if (log.status === "cancelled") headline = "Запит скасовано";
  else headline = log.error ?? "Помилка";

  const done = log.steps.filter((s) => s.status === "completed").length;

  return (
    <div className={cn("w-full max-w-full overflow-hidden rounded-lg border border-line bg-surface", running && "border-accent/25", className)}>
      <div className="flex h-9 items-center gap-1 pr-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 text-left transition-colors duration-150 hover:bg-hover/60"
        >
          {running ? <ActivityDot /> : <StatusIcon status={log.status} />}
          {/* keyed re-mount = small enter transition per stage; no exit wait, so fast stage changes never blank the line */}
          <motion.span
            key={headline}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={t(0.16)}
            className={cn("min-w-0 truncate text-sm", running ? "text-fg" : "text-muted", log.status === "failed" && "text-danger")}
          >
            {headline}
          </motion.span>
          <span className="tabular ml-auto shrink-0 text-2xs text-subtle">
            {log.steps.length > 0 && <span className="mr-2 hidden sm:inline">{done}/{log.steps.length}</span>}
            {formatDuration(elapsed)}
          </span>
          <ChevronRight className={cn("size-3.5 shrink-0 text-subtle transition-transform duration-200", open && "rotate-90")} />
        </button>
        {running && onStop && (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-fg disabled:opacity-50"
          >
            {stopping ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3 fill-current" />}
            Стоп
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="log" variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden">
            <div className="border-t border-line px-3 pt-3 pb-2.5">
              {log.steps.length === 0 ? (
                <p className="text-sm text-muted">{running ? "Очікуємо перші події від сервера…" : "Подій не записано"}</p>
              ) : (
                <ol>
                  <AnimatePresence initial={false}>
                    {log.steps.map((s) => (
                      <StepRow key={s.stage} step={s} />
                    ))}
                  </AnimatePresence>
                </ol>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Lazy, persisted log for a finished request: fetched only when the user opens it. */
export function PersistedProcess({ requestId, className }: { requestId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useRequestLog(requestId, open);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-subtle transition-colors hover:bg-hover hover:text-fg", className)}>
        <ChevronRight className="size-3" />
        Процес роботи AI
      </button>
    );
  }
  if (isLoading) return <div className={cn("flex h-9 items-center gap-2 px-1 text-xs text-subtle", className)}><Loader2 className="size-3 animate-spin" />Завантаження журналу…</div>;
  if (isError || !data) return <p className={cn("px-1 text-xs text-subtle", className)}>Журнал недоступний (видалено за терміном зберігання)</p>;
  return <AIProcessingPanel log={logFromEvents(data.events)} defaultOpen />;
}

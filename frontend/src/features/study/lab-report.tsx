import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Clock, Info } from "lucide-react";
import { useState } from "react";
import type { LabAnalysis } from "@/lib/types";
import { collapse, fadeUp, stagger } from "@/lib/motion";
import { cn, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/feedback";
import { Tooltip } from "@/components/ui/tooltip";

function level(v: number) {
  if (v <= 3) return { label: "низька", tone: "bg-success" };
  if (v <= 6) return { label: "середня", tone: "bg-warning" };
  return { label: "висока", tone: "bg-danger" };
}

function DifficultyBar({ label, value }: { label: string; value: number }) {
  const l = level(value);
  return (
    <div className="grid grid-cols-[minmax(84px,120px)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex h-1.5 gap-0.5" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={1} aria-valuemax={10}>
        {Array.from({ length: 10 }, (_, i) => (
          <motion.span key={i} initial={{ scaleY: 0.3, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ delay: 0.15 + i * 0.025, duration: 0.2 }} className={cn("flex-1 rounded-[2px]", i < value ? l.tone : "bg-hover")} />
        ))}
      </div>
      <span className="tabular text-right text-sm whitespace-nowrap"><span className="font-medium">{value}</span><span className="text-subtle">/10<span className="hidden sm:inline"> · {l.label}</span></span></span>
    </div>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium text-subtle">{title}</h4>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i} className="flex gap-2 text-sm"><span className="mt-[9px] size-1 shrink-0 rounded-full bg-subtle" />{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-subtle">{empty}</p>
      )}
    </div>
  );
}

export function LabReport({ analysis, analyzedAt }: { analysis: LabAnalysis; analyzedAt: string | null }) {
  const [showQuestions, setShowQuestions] = useState(false);
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Звіт аналізу</h3>
        <Tooltip content="Показники згенеровані моделлю на основі опису та матеріалів, це не об'єктивне вимірювання">
          <span><Badge tone="accent"><Info className="size-3" />AI-оцінка</Badge></span>
        </Tooltip>
        {analyzedAt && <span className="text-2xs text-subtle">{relativeTime(analyzedAt)}</span>}
      </motion.div>

      <motion.div variants={fadeUp} className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2.5">
          <DifficultyBar label="Виконання" value={analysis.execution_difficulty} />
          <DifficultyBar label="Теорія" value={analysis.theory_difficulty} />
          <DifficultyBar label="Захист" value={analysis.defense_difficulty} />
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-sunken px-4 py-3 sm:flex-col sm:items-start sm:justify-center sm:gap-0.5">
          <Clock className="size-4 text-subtle sm:mb-1" />
          <span className="tabular text-xl font-medium">~{analysis.estimated_hours} год</span>
          <span className="text-2xs text-subtle">орієнтовний час</span>
        </div>
      </motion.div>

      {analysis.summary && <motion.p variants={fadeUp} className="max-w-[68ch] text-read leading-7 text-fg/90">{analysis.summary}</motion.p>}

      <motion.div variants={fadeUp}>
        <h4 className="mb-1.5 text-xs font-medium text-subtle">Необхідні знання</h4>
        <div className="flex flex-wrap gap-1.5">
          {analysis.required_knowledge.map((k) => <span key={k} className="rounded-md border border-line bg-surface px-2 py-0.5 text-sm">{k}</span>)}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid gap-5 sm:grid-cols-2">
        <ListBlock title="Можливі прогалини" items={analysis.gaps} empty="Модель не виявила явних прогалин" />
        <ListBlock title="Рекомендації" items={analysis.recommendations} empty="—" />
      </motion.div>

      {analysis.defense_questions.length > 0 && (
        <motion.div variants={fadeUp} className="rounded-lg border border-line">
          <button type="button" onClick={() => setShowQuestions((s) => !s)} aria-expanded={showQuestions} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-hover/50">
            <ChevronRight className={cn("size-3.5 text-subtle transition-transform duration-200", showQuestions && "rotate-90")} />
            Ймовірні запитання на захисті
            <span className="ml-auto text-2xs text-subtle">{analysis.defense_questions.length}</span>
          </button>
          <AnimatePresence initial={false}>
            {showQuestions && (
              <motion.div variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden">
                <ol className="space-y-2 border-t border-line px-3 py-3">
                  {analysis.defense_questions.map((q, i) => (
                    <li key={q} className="flex gap-2.5 text-sm"><span className="tabular w-4 shrink-0 text-subtle">{i + 1}.</span>{q}</li>
                  ))}
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}

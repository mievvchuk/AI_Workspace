import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronRight, ClipboardCheck, Lightbulb, RotateCcw, Target, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useDiagnostic, useSubjects, useUsage } from "@/lib/queries";
import type { Diagnostic, Question } from "@/lib/types";
import { collapse, dur, fadeUp, stagger, t } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState, Notice, Progress, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { AIProcessingPanel } from "@/components/ai/process-panel";
import { useAITask } from "@/features/ai/use-ai-task";
import { CountUp } from "@/components/ui/count-up";

const DIFF_LABEL: Record<string, string> = { easy: "легке", medium: "середнє", hard: "складне", adaptive: "адаптивне" };

/* ---------------- setup ---------------- */

export function DiagnosticSetup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const subjects = useSubjects();
  const { data: usage } = useUsage();
  const [subjectId, setSubjectId] = useState(params.get("subject") ?? "");
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [count, setCount] = useState("5");
  const [format, setFormat] = useState<Diagnostic["format"]>("mixed");
  const [difficulty, setDifficulty] = useState<Diagnostic["difficulty"]>("adaptive");
  const task = useAITask<{ diagnostic_id: string }>();

  useEffect(() => {
    if (!topic && subjectId) setTopic(subjects.data?.find((s) => s.id === subjectId)?.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill once when subjects load
  }, [subjects.data, subjectId]);

  const start = async () => {
    const res = await task.run("/diagnostics", { subject_id: subjectId || null, topic: topic.trim(), question_count: Number(count), format, difficulty });
    queryClient.invalidateQueries({ queryKey: ["diagnostics"] });
    if (res?.diagnostic_id) navigate(`/study/diagnostics/${res.diagnostic_id}`, { replace: true });
  };
  // Once started, the form collapses into a one-line summary so the live progress stays in view
  // on short screens (laptops ~630px tall) instead of being pushed below the fold.
  const started = task.running || task.log.status !== "idle";
  const subject = subjects.data?.find((s) => s.id === subjectId);
  const FORMAT_LABEL = { choice: "Тест", open: "Відкриті", mixed: "Змішаний" } as const;

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-1.5"><Link to="/study" className="text-muted hover:text-fg">Навчання</Link><span className="text-subtle">/</span>Нова діагностика</span>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="mx-auto max-w-[560px] space-y-5 px-4 py-6 sm:px-6 sm:py-8">
          <div>
            <h1 className="text-[28px] leading-[34px] font-medium tracking-[-0.025em]">Діагностика знань</h1>
            {!started && <p className="mt-1 text-sm text-muted">AI згенерує запитання з урахуванням матеріалів предмета, оцінить відповіді й сформує звіт.</p>}
          </div>
          {usage && !usage.ai_configured && <Notice>AI-провайдер не налаштовано — діагностика недоступна.</Notice>}
          {started ? (
            <motion.div key="run" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={t(dur.dialog)} className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg stock px-3.5 py-2.5">
                <ClipboardCheck className="size-4 shrink-0 text-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{topic}</p>
                  <p className="truncate text-xs text-muted">
                    {subject ? `${subject.name} · ` : ""}
                    {count} запитань · {FORMAT_LABEL[format]} · {DIFF_LABEL[difficulty]}
                  </p>
                </div>
              </div>
              <AIProcessingPanel log={task.log} live={task.running} lastFrameAt={task.lastFrameAt} defaultOpen collapseOnDone onStop={task.stop} stopping={task.stopping} />
              {task.requestError && <Notice tone="danger">{task.requestError}</Notice>}
              {!task.running && (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={start} disabled={!topic.trim()}>Спробувати знову</Button>
                  <Button variant="ghost" onClick={task.reset}>Змінити параметри</Button>
                </div>
              )}
              {task.running && <p className="text-xs text-subtle">Сучасні моделі спершу міркують, тому генерація може тривати до хвилини. Можна перейти на іншу сторінку — але тоді запит буде скасовано.</p>}
            </motion.div>
          ) : (
          <>
          <fieldset className="space-y-4">
            <Field label="Предмет" optional>
              {(id) => (
                <Select id={id} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">Без предмета — лише тема</option>
                  {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Тема або технологія">{(id) => <Input id={id} value={topic} maxLength={200} placeholder="Наприклад, Декоратори в Python" onChange={(e) => setTopic(e.target.value)} />}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Кількість запитань</span>
                <div><Segmented label="Кількість" value={count} onChange={setCount} options={["5", "10", "15"].map((v) => ({ value: v, label: v }))} /></div>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Формат</span>
                <div><Segmented label="Формат" value={format} onChange={setFormat} options={[{ value: "choice", label: "Тест" }, { value: "open", label: "Відкриті" }, { value: "mixed", label: "Змішаний" }]} /></div>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Складність</span>
              <div><Segmented label="Складність" value={difficulty} onChange={setDifficulty} options={(["easy", "medium", "hard", "adaptive"] as const).map((v) => ({ value: v, label: DIFF_LABEL[v] }))} /></div>
            </div>
          </fieldset>
          <Button variant="primary" size="lg" className="w-full" disabled={!topic.trim() || (usage && !usage.ai_configured)} onClick={start}>
            Почати діагностику
          </Button>
          </>
          )}
        </motion.div>
      </div>
    </>
  );
}

/* ---------------- run ---------------- */

function Reveal({ q }: { q: Question }) {
  const correct = (q.score ?? 0) >= 0.7;
  const partial = !correct && (q.score ?? 0) > 0;
  return (
    <motion.div variants={collapse} initial="closed" animate="open" className="overflow-hidden">
      <div className={cn("mt-4 rounded-lg border px-3.5 py-3", correct ? "border-success/30 bg-success-soft" : partial ? "border-warning/30 bg-warning-soft" : "border-danger/30 bg-danger-soft")}>
        <div className="flex items-center gap-2 text-sm font-medium">
          {correct ? <Check className="size-4 text-success" /> : <X className={cn("size-4", partial ? "text-warning" : "text-danger")} />}
          {q.kind === "open" ? `Оцінка: ${Math.round((q.score ?? 0) * 100)}%` : correct ? "Правильно" : "Неправильно"}
          {q.kind === "open" && <Badge tone="accent" className="ml-auto">AI-оцінка</Badge>}
        </div>
        {q.feedback && q.kind === "open" && <p className="mt-1.5 text-sm">{q.feedback}</p>}
        {q.explanation && <p className="mt-1.5 text-sm text-fg/80"><span className="text-muted">Пояснення: </span>{q.explanation}</p>}
      </div>
    </motion.div>
  );
}

function QuestionCard({ diag, q, onNext, isLast }: { diag: Diagnostic; q: Question; onNext: () => void; isLast: boolean }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const grading = useAITask<{ question_id: string }>();
  const answered = !!q.answered_at;

  const submitChoice = useMutation({
    mutationFn: () => api.post<Question>(`/diagnostics/${diag.id}/questions/${q.id}/answer`, { answer: String(choice) }),
    onSuccess: (updated) => queryClient.setQueryData<Diagnostic>(qk.diagnostic(diag.id), (d) => d && { ...d, questions: d.questions.map((x) => (x.id === updated.id ? updated : x)) }),
  });
  const submitOpen = async () => {
    await grading.run(`/diagnostics/${diag.id}/questions/${q.id}/grade`, { answer: text.trim() });
    await queryClient.invalidateQueries({ queryKey: qk.diagnostic(diag.id) });
  };
  const busy = submitChoice.isPending || grading.running;

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={t(dur.page)}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        {q.topic && <Badge>{q.topic}</Badge>}
        <Badge tone="neutral">{DIFF_LABEL[q.difficulty] ?? q.difficulty}</Badge>
        <span>{q.kind === "choice" ? "Оберіть одну відповідь" : "Відкрита відповідь"}</span>
      </div>
      <h2 className="text-lg leading-7 font-medium">{q.prompt}</h2>

      {q.kind === "choice" && q.options && (
        <div role="radiogroup" aria-label="Варіанти відповіді" className="mt-5 space-y-2">
          {q.options.map((opt, i) => {
            const isCorrect = answered && q.correct_index === i;
            const isWrongPick = answered && Number(q.user_answer) === i && q.correct_index !== i;
            const selected = answered ? Number(q.user_answer) === i : choice === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={answered || busy}
                onClick={() => setChoice(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-[border-color,background-color] duration-150",
                  !answered && (selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-hover"),
                  isCorrect && "border-success/50 bg-success-soft",
                  isWrongPick && "border-danger/50 bg-danger-soft",
                  answered && !isCorrect && !isWrongPick && "border-line opacity-60",
                )}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-2xs font-medium", selected ? "border-accent text-accent" : "border-line-hover text-subtle", isCorrect && "border-success text-success", isWrongPick && "border-danger text-danger")}>
                  {isCorrect ? <Check className="size-3" /> : isWrongPick ? <X className="size-3" /> : String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {q.kind === "open" && (
        <div className="mt-5 space-y-3">
          {answered ? (
            <div className="rounded-lg border border-line bg-sunken px-3.5 py-2.5 text-sm whitespace-pre-wrap">{q.user_answer}</div>
          ) : (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={8000} disabled={busy} placeholder="Ваша відповідь…" aria-label="Відповідь" />
          )}
          {(grading.running || grading.log.status === "failed") && <AIProcessingPanel log={grading.log} live={grading.running} lastFrameAt={grading.lastFrameAt} defaultOpen />}
          {grading.requestError && <Notice tone="danger">{grading.requestError}</Notice>}
        </div>
      )}

      {submitChoice.isError && <p role="alert" className="mt-3 text-sm text-danger">{errorMessage(submitChoice.error)}</p>}
      {answered && <Reveal q={q} />}

      <div className="mt-6 flex justify-end">
        {answered ? (
          <Button variant="primary" onClick={onNext} icon={<ArrowRight className="size-3.5" />}>{isLast ? "До підсумку" : "Наступне запитання"}</Button>
        ) : q.kind === "choice" ? (
          <Button variant="primary" disabled={choice === null} loading={submitChoice.isPending} onClick={() => !submitChoice.isPending && submitChoice.mutate()}>Підтвердити</Button>
        ) : (
          <Button variant="primary" disabled={!text.trim()} loading={grading.running} onClick={submitOpen}>Надіслати на оцінювання</Button>
        )}
      </div>
    </motion.div>
  );
}

function Results({ diag }: { diag: Diagnostic }) {
  const s = diag.summary;
  const [open, setOpen] = useState(false);
  const score = Math.round(diag.score ?? 0);
  const tone = score >= 75 ? "text-success" : score >= 50 ? "text-warning" : "text-danger";
  const blocks = s
    ? ([
        ["Сильні сторони", s.strengths, TrendingUp],
        ["Прогалини", s.gaps, Target],
        ["Теми для повторення", s.review_topics, RotateCcw],
      ] as const)
    : [];
  return (
    <motion.div variants={stagger(0.12)} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={fadeUp} className="flex items-end gap-5">
        <div>
          <p className="text-xs text-muted">Підсумкова оцінка</p>
          <p className={cn("tabular text-[44px] leading-none font-medium tracking-tight", tone)}><CountUp value={score} />%</p>
        </div>
        <div className="flex-1 pb-1.5">
          <Progress value={score} tone={score >= 75 ? "success" : score >= 50 ? "warning" : "danger"} className="h-1.5" label="Підсумкова оцінка" />
          <p className="mt-1.5 text-2xs text-subtle">{diag.questions.filter((q) => (q.score ?? 0) >= 0.7).length} з {diag.questions.length} відповідей зараховано · відкриті відповіді оцінені AI</p>
        </div>
      </motion.div>
      {s?.next_step && (
        <motion.div variants={fadeUp} className="flex gap-3 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" />
          <div><p className="text-xs font-medium text-accent">Рекомендований наступний крок</p><p className="mt-0.5 text-sm">{s.next_step}</p></div>
        </motion.div>
      )}
      <motion.div variants={fadeUp} className="grid gap-6 sm:grid-cols-3">
        {blocks.map(([title, items, Icon]) => (
          <div key={title}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-subtle"><Icon className="size-3.5" />{title}</h3>
            <ul className="space-y-1.5">{items.length ? items.map((i) => <li key={i} className="text-sm">{i}</li>) : <li className="text-sm text-subtle">—</li>}</ul>
          </div>
        ))}
      </motion.div>
      <motion.div variants={fadeUp} className="rounded-lg border border-line">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-hover/50">
          <ChevronRight className={cn("size-3.5 text-subtle transition-transform", open && "rotate-90")} /> Відповіді по запитаннях
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div variants={collapse} initial="closed" animate="open" exit="closed" className="overflow-hidden">
              <ol className="divide-y divide-line border-t border-line">
                {diag.questions.map((q) => (
                  <li key={q.id} className="flex gap-3 px-3.5 py-2.5 text-sm">
                    <span className="tabular w-5 shrink-0 text-subtle">{q.idx + 1}.</span>
                    <span className="flex-1">{q.prompt}</span>
                    <span className={cn("tabular shrink-0 font-medium", (q.score ?? 0) >= 0.7 ? "text-success" : (q.score ?? 0) > 0 ? "text-warning" : "text-danger")}>{Math.round((q.score ?? 0) * 100)}%</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export function DiagnosticRun() {
  const { diagnosticId = "" } = useParams();
  const diag = useDiagnostic(diagnosticId);
  const finish = useAITask();
  const d = diag.data;
  const firstOpen = useMemo(() => d?.questions.findIndex((q) => !q.answered_at) ?? -1, [d]);
  // Pin the shown question: answering must not auto-advance before the user has read the feedback.
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    if (index === null && d) setIndex(firstOpen === -1 ? d.questions.length : firstOpen);
  }, [d, firstOpen, index]);
  const current = index ?? (firstOpen === -1 ? (d?.questions.length ?? 0) : firstOpen);
  const answered = d?.questions.filter((q) => q.answered_at).length ?? 0;

  const runFinish = async () => {
    await finish.run(`/diagnostics/${diagnosticId}/finish`);
    await queryClient.invalidateQueries({ queryKey: qk.diagnostic(diagnosticId) });
    queryClient.invalidateQueries({ queryKey: ["diagnostics"] });
    queryClient.invalidateQueries({ queryKey: qk.dashboard });
  };

  const header = <PageHeader title={<span className="flex items-center gap-1.5"><Link to="/study" className="text-muted hover:text-fg">Навчання</Link><span className="text-subtle">/</span><span className="truncate">{d?.topic ?? "Діагностика"}</span></span>} />;
  if (diag.isError) return <>{header}<ErrorState className="m-auto" message={errorMessage(diag.error)} onRetry={() => diag.refetch()} /></>;
  if (!d) return <>{header}<div className="mx-auto w-full max-w-[640px] space-y-3 px-6 py-10"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div></>;

  const q = d.questions[current];
  return (
    <>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
          {d.status !== "completed" && (
            <div className="mb-8">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5"><ClipboardCheck className="size-3.5" />{d.topic}</span>
                <span className="tabular">{Math.min(current + 1, d.questions.length)} / {d.questions.length}</span>
              </div>
              <Progress value={(answered / Math.max(d.questions.length, 1)) * 100} label="Прогрес діагностики" />
            </div>
          )}
          {d.status === "failed" && <ErrorState title="Не вдалося згенерувати запитання" message="Спробуйте створити діагностику ще раз." />}
          {d.status === "completed" && (
            <>
              <p className="flex items-center gap-1.5 text-sm text-muted"><ClipboardCheck className="size-4" />Діагностика знань</p>
              <h1 className="mt-1 mb-8 text-[28px] leading-[34px] font-medium tracking-[-0.025em]">{d.topic}</h1>
              <Results diag={d} />
            </>
          )}
          {d.status === "active" && (
            <>
              {q ? (
                <QuestionCard key={q.id} diag={d} q={q} isLast={current === d.questions.length - 1} onNext={() => setIndex(current + 1)} />
              ) : (
                <motion.div key="finish" variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
                  <h2 className="text-2xl font-medium tracking-[-0.02em]">Усі запитання пройдено</h2>
                  <p className="text-sm text-muted">AI проаналізує відповіді та сформує звіт: сильні сторони, прогалини й наступний крок.</p>
                  {(finish.running || finish.log.status === "failed") && <AIProcessingPanel log={finish.log} live={finish.running} lastFrameAt={finish.lastFrameAt} defaultOpen />}
                  {finish.requestError && <Notice tone="danger">{finish.requestError}</Notice>}
                  <Button variant="primary" loading={finish.running} onClick={runFinish}>Сформувати підсумок</Button>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, FlaskConical, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useLabs, useOwnerFiles } from "@/lib/queries";
import type { Lab } from "@/lib/types";
import { dur, t } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { AIProcessingPanel, PersistedProcess } from "@/components/ai/process-panel";
import { useAITask } from "@/features/ai/use-ai-task";
import { LabReport } from "./lab-report";

const STATUS_LABEL = { todo: "Не розпочато", in_progress: "В роботі", done: "Здано" } as const;
const STATUS_TONE = { todo: "neutral", in_progress: "accent", done: "success" } as const;

function LabDialog({ subjectId, open, onOpenChange }: { subjectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileId, setFileId] = useState("");
  const files = useOwnerFiles("subject", subjectId);
  const [, setParams] = useSearchParams();
  const create = useMutation({
    mutationFn: () => api.post<Lab>(`/subjects/${subjectId}/labs`, { title: title.trim(), description, file_id: fileId || null }),
    onSuccess: (lab) => {
      queryClient.setQueryData<Lab[]>(qk.labs(subjectId), (old) => [...(old ?? []), lab]);
      queryClient.invalidateQueries({ queryKey: qk.subjects });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      setTitle(""); setDescription(""); setFileId("");
      onOpenChange(false);
      setParams({ tab: "labs", lab: lab.id }, { replace: true });
    },
  });
  const ready = files.data?.filter((f) => f.status === "ready") ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)} title="Нова лабораторна"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Скасувати</Button><Button variant="primary" loading={create.isPending} disabled={!title.trim()} onClick={() => create.mutate()}>Створити</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (title.trim() && !create.isPending) create.mutate(); }}>
        <Field label="Назва">{(id) => <Input id={id} autoFocus value={title} maxLength={200} placeholder="Лабораторна №6. Декоратори" onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Завдання" optional hint="Чим докладніше, тим точніший аналіз">{(id, d) => <Textarea id={id} aria-describedby={d} rows={5} value={description} maxLength={8000} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label="Файл методички" optional hint={ready.length ? undefined : "Завантажте матеріали предмета, щоб прив'язати файл"}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={fileId} onChange={(e) => setFileId(e.target.value)} disabled={!ready.length}>
              <option value="">Без файлу</option>
              {ready.map((f) => <option key={f.id} value={f.id}>{f.original_name}</option>)}
            </Select>
          )}
        </Field>
        {create.isError && <p role="alert" className="text-sm text-danger">{errorMessage(create.error)}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function LabDetail({ lab, onBack }: { lab: Lab; onBack: () => void }) {
  const task = useAITask<{ lab: Lab }>();
  const [confirm, setConfirm] = useState(false);
  const files = useOwnerFiles("subject", lab.subject_id);
  const file = files.data?.find((f) => f.id === lab.file_id);
  const update = useMutation({
    mutationFn: (body: Partial<Lab>) => api.patch<Lab>(`/labs/${lab.id}`, body),
    onSuccess: (l) => {
      queryClient.setQueryData<Lab[]>(qk.labs(lab.subject_id), (old) => old?.map((x) => (x.id === l.id ? l : x)));
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      queryClient.invalidateQueries({ queryKey: qk.subjects });
    },
    onError: (e) => toast.error("Не вдалося оновити", errorMessage(e)),
  });
  const analyze = async () => {
    const res = await task.run(`/labs/${lab.id}/analyze`);
    if (res?.lab) queryClient.setQueryData<Lab[]>(qk.labs(lab.subject_id), (old) => old?.map((x) => (x.id === res.lab.id ? res.lab : x)));
  };
  const remove = async () => {
    await api.delete(`/labs/${lab.id}`);
    queryClient.setQueryData<Lab[]>(qk.labs(lab.subject_id), (old) => old?.filter((x) => x.id !== lab.id));
    queryClient.invalidateQueries({ queryKey: qk.dashboard });
    queryClient.invalidateQueries({ queryKey: qk.subjects });
    onBack();
  };
  const showLive = task.running || task.log.status !== "idle";

  return (
    <motion.div key={lab.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={t(dur.page)} className="min-w-0 space-y-5">
      <div className="flex items-start gap-2">
        <IconButton label="До списку" className="-ml-1.5 lg:hidden" onClick={onBack}><ArrowLeft /></IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-medium tracking-[-0.015em]">{lab.title}</h2>
          {file && <p className="mt-0.5 truncate text-xs text-muted">Методичка: {file.original_name}</p>}
        </div>
        <IconButton label="Видалити лабораторну" onClick={() => setConfirm(true)}><Trash2 /></IconButton>
      </div>
      <Segmented label="Статус" value={lab.status} onChange={(status) => update.mutate({ status })} options={(["todo", "in_progress", "done"] as const).map((v) => ({ value: v, label: STATUS_LABEL[v] }))} />
      {lab.description && <p className="max-w-[68ch] text-sm whitespace-pre-wrap text-fg/90">{lab.description}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={lab.analysis ? "outline" : "primary"} icon={<Sparkles className="size-3.5" />} loading={task.running} onClick={analyze}>
          {lab.analysis ? "Проаналізувати знову" : "Аналізувати складність"}
        </Button>
        {!showLive && lab.analysis_request_id && <PersistedProcess requestId={lab.analysis_request_id} />}
      </div>
      {task.requestError && <Notice tone="danger">{task.requestError}</Notice>}
      <AnimatePresence initial={false}>
        {showLive && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={t(dur.dialog)}>
            <AIProcessingPanel log={task.log} live={task.running} lastFrameAt={task.lastFrameAt} defaultOpen collapseOnDone onStop={task.stop} stopping={task.stopping} />
          </motion.div>
        )}
      </AnimatePresence>
      {lab.analysis && !task.running && <LabReport key={lab.analyzed_at} analysis={lab.analysis} analyzedAt={lab.analyzed_at} />}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Видалити лабораторну?" description={`«${lab.title}» і її звіт аналізу буде видалено.`} onConfirm={remove} />
    </motion.div>
  );
}

export function LabsTab({ subjectId }: { subjectId: string }) {
  const labs = useLabs(subjectId);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const selectedId = params.get("lab");
  const selected = labs.data?.find((l) => l.id === selectedId);
  const select = (id: string | null) => setParams(id ? { tab: "labs", lab: id } : { tab: "labs" }, { replace: true });

  if (labs.isLoading) return <div className="space-y-2"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>;
  if (labs.isError) return <ErrorState message={errorMessage(labs.error)} onRetry={() => labs.refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      <div className={cn("min-w-0 space-y-2", selected && "hidden lg:block")}>
        <Button variant="outline" size="sm" className="w-full" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>Нова лабораторна</Button>
        {labs.data?.length ? (
          <ul className="space-y-px">
            {labs.data.map((lab) => (
              <li key={lab.id}>
                <button type="button" onClick={() => select(lab.id)} className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors", lab.id === selectedId ? "bg-hover" : "hover:bg-hover/60")}>
                  <FlaskConical className="size-3.5 shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1 truncate text-sm">{lab.title}</span>
                  {lab.analysis && <span className="tabular text-2xs text-subtle" title="Складність виконання (AI-оцінка)">{lab.analysis.execution_difficulty}/10</span>}
                  <Badge tone={STATUS_TONE[lab.status]}>{STATUS_LABEL[lab.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<FlaskConical />} title="Лабораторних ще немає" description="Додайте завдання, щоб оцінити складність і підготуватися до захисту." />
        )}
      </div>
      <div className={cn("min-w-0", !selected && "hidden lg:block")}>
        {selected ? <LabDetail lab={selected} onBack={() => select(null)} /> : labs.data?.length ? <EmptyState title="Оберіть лабораторну" description="Деталі та AI-аналіз з'являться тут." /> : null}
      </div>
      <LabDialog subjectId={subjectId} open={creating} onOpenChange={setCreating} />
    </div>
  );
}

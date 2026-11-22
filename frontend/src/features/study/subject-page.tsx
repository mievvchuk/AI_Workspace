import { motion } from "motion/react";
import { ClipboardCheck, FileText, FlaskConical, GraduationCap, LayoutGrid, MessageSquare, Pencil, Plus, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { errorMessage } from "@/lib/api";
import { useDiagnostics, useLabs, useSessions, useSubject } from "@/lib/queries";
import { fadeUp, stagger } from "@/lib/motion";
import { plural, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/shell/app-shell";
import { FileManager } from "@/components/shell/context-panel";
import { SubjectEmoji } from "@/components/shell/subject-emoji";
import { SessionItem } from "@/components/shell/session-item";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import { useNewSession } from "@/features/chat/use-new-session";
import { LabsTab } from "./labs-tab";
import { SubjectDialog } from "./subject-dialog";

function Stat({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const body = (
    <>
      <span className="tabular text-xl font-medium">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </>
  );
  return to ? <Link to={to} className="flex flex-col rounded-lg stock stock-hover px-3.5 py-2.5">{body}</Link> : <div className="flex flex-col rounded-lg stock px-3.5 py-2.5">{body}</div>;
}

function Overview({ subjectId }: { subjectId: string }) {
  const { data: s } = useSubject(subjectId);
  const labs = useLabs(subjectId);
  const sessions = useSessions({ subject_id: subjectId });
  const diags = useDiagnostics(subjectId);
  const last = diags.data?.find((d) => d.status === "completed");
  if (!s) return null;
  return (
    <motion.div variants={stagger()} initial="hidden" animate="show" className="space-y-8">
      {s.description && <motion.p variants={fadeUp} className="max-w-[68ch] text-read leading-7 text-fg/90">{s.description}</motion.p>}
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label={plural(s.material_count, "матеріал", "матеріали", "матеріалів")} value={s.material_count} to="?tab=materials" />
        <Stat label="лабораторних відкрито" value={`${s.labs_open}/${s.lab_count}`} to="?tab=labs" />
        <Stat label="AI-сесій" value={sessions.data?.length ?? "—"} to="?tab=sessions" />
        <Stat label="остання діагностика" value={last?.score != null ? `${Math.round(last.score)}%` : "—"} to="?tab=diagnostics" />
      </motion.div>
      {!!labs.data?.filter((l) => l.status !== "done").length && (
        <motion.section variants={fadeUp}>
          <h3 className="mb-2 text-sm font-medium text-muted">Незавершені лабораторні</h3>
          <ul className="divide-y divide-line rounded-lg stock">
            {labs.data.filter((l) => l.status !== "done").slice(0, 5).map((l) => (
              <li key={l.id}>
                <Link to={`?tab=labs&lab=${l.id}`} className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-hover/60">
                  <FlaskConical className="size-3.5 text-subtle" />
                  <span className="flex-1 truncate">{l.title}</span>
                  {l.analysis ? <span className="tabular text-2xs text-subtle">складність {l.analysis.execution_difficulty}/10</span> : <span className="text-2xs text-subtle">без аналізу</span>}
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}

function DiagnosticsTab({ subjectId }: { subjectId: string }) {
  const diags = useDiagnostics(subjectId);
  const navigate = useNavigate();
  if (diags.isLoading) return <Skeleton className="h-24" />;
  if (diags.isError) return <ErrorState message={errorMessage(diags.error)} onRetry={() => diags.refetch()} />;
  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" icon={<Plus className="size-3.5" />} onClick={() => navigate(`/study/diagnostics/new?subject=${subjectId}`)}>Нова діагностика</Button>
      {diags.data?.length ? (
        <ul className="divide-y divide-line rounded-lg stock">
          {diags.data.map((d) => (
            <li key={d.id}>
              <Link to={`/study/diagnostics/${d.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover/60">
                <ClipboardCheck className="size-3.5 text-subtle" />
                <span className="min-w-0 flex-1 truncate text-sm">{d.topic}</span>
                <span className="hidden text-2xs text-subtle sm:inline">{d.question_count} запит. · {relativeTime(d.created_at)}</span>
                {d.status === "completed" ? <span className="tabular text-sm font-medium">{Math.round(d.score ?? 0)}%</span> : <Badge tone={d.status === "failed" ? "danger" : "accent"}>{d.status === "failed" ? "помилка" : d.status === "active" ? "незавершена" : "генерація"}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ClipboardCheck />} title="Діагностик ще немає" description="Перевірка знань генерується з урахуванням матеріалів предмета." />
      )}
    </div>
  );
}

function DefenseTab({ subjectId }: { subjectId: string }) {
  const labs = useLabs(subjectId);
  const navigate = useNavigate();
  const analyzed = labs.data?.filter((l) => l.analysis) ?? [];
  if (labs.isLoading) return <Skeleton className="h-24" />;
  if (!analyzed.length) return <EmptyState icon={<ShieldQuestion />} title="Немає даних для підготовки" description="Проаналізуйте лабораторні — тут з'являться ймовірні запитання на захисті й теми для повторення." />;
  return (
    <div className="space-y-6">
      {analyzed.map((l) => (
        <section key={l.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 truncate text-sm font-medium">{l.title}</h3>
            <Badge tone="accent">AI-оцінка захисту {l.analysis!.defense_difficulty}/10</Badge>
            <Button size="sm" variant="ghost" onClick={() => navigate(`/study/diagnostics/new?subject=${subjectId}&topic=${encodeURIComponent(l.title)}`)}>Потренуватися</Button>
          </div>
          <ol className="space-y-1.5 rounded-lg stock px-3.5 py-3">
            {l.analysis!.defense_questions.map((q, i) => <li key={q} className="flex gap-2.5 text-sm"><span className="tabular w-4 shrink-0 text-subtle">{i + 1}.</span>{q}</li>)}
          </ol>
          {l.analysis!.required_knowledge.length > 0 && <p className="text-xs text-muted">Повторити: {l.analysis!.required_knowledge.join(", ")}</p>}
        </section>
      ))}
    </div>
  );
}

function SessionsTab({ subjectId }: { subjectId: string }) {
  const sessions = useSessions({ subject_id: subjectId });
  const newSession = useNewSession();
  if (sessions.isLoading) return <Skeleton className="h-24" />;
  return (
    <div className="max-w-xl space-y-3">
      <Button variant="outline" size="sm" icon={<Plus className="size-3.5" />} loading={newSession.isPending} onClick={() => newSession.mutate({ space: "study", subject_id: subjectId })}>Нова сесія з контекстом предмета</Button>
      {sessions.data?.length ? <div className="space-y-px">{sessions.data.map((s) => <SessionItem key={s.id} session={s} layoutGroup={`subject-${subjectId}`} />)}</div> : <EmptyState icon={<MessageSquare />} title="Сесій ще немає" />}
    </div>
  );
}

const TABS = [
  { value: "overview", label: "Огляд", icon: <LayoutGrid /> },
  { value: "materials", label: "Матеріали", icon: <FileText /> },
  { value: "labs", label: "Лабораторні", icon: <FlaskConical /> },
  { value: "diagnostics", label: "Діагностика", icon: <ClipboardCheck /> },
  { value: "defense", label: "Захист", icon: <GraduationCap /> },
  { value: "sessions", label: "AI-сесії", icon: <MessageSquare /> },
];

export function SubjectPage() {
  const { subjectId = "" } = useParams();
  const subject = useSubject(subjectId);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const newSession = useNewSession();
  const tab = params.get("tab") ?? "overview";
  const s = subject.data;

  if (subject.isError) return <><PageHeader title="Предмет" /><ErrorState className="m-auto" title="Предмет недоступний" message={errorMessage(subject.error)} onRetry={() => subject.refetch()} /></>;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-1.5"><Link to="/study" className="text-muted hover:text-fg">Навчання</Link><span className="text-subtle">/</span><span className="truncate">{s?.name ?? " "}</span></span>}
        actions={<Button size="sm" variant="primary" icon={<MessageSquare className="size-3.5" />} loading={newSession.isPending} onClick={() => newSession.mutate({ space: "study", subject_id: subjectId })}>Запитати AI</Button>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1040px] px-4 sm:px-6">
          <div className="flex items-center gap-3 pt-6 pb-4">
            {s ? <SubjectEmoji emoji={s.emoji} size="lg" /> : <Skeleton className="size-11" />}
            <div className="min-w-0 flex-1">
              {s ? <h1 className="truncate text-[28px] leading-[34px] font-medium tracking-[-0.025em]">{s.name}</h1> : <Skeleton className="h-6 w-48" />}
              {s && <p className="text-xs text-muted">Оновлено {relativeTime(s.updated_at)}</p>}
            </div>
            {s && <IconButton label="Редагувати предмет" onClick={() => setEditing(true)}><Pencil /></IconButton>}
          </div>
          <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
            <Tabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} tabs={TABS.map((t) => (t.value === "materials" ? { ...t, count: s?.material_count } : t.value === "labs" ? { ...t, count: s?.lab_count } : t))} />
          </div>
          <div className="py-6">
            {tab === "overview" && <Overview subjectId={subjectId} />}
            {tab === "materials" && <div className="max-w-2xl"><FileManager kind="subject" ownerId={subjectId} /></div>}
            {tab === "labs" && <LabsTab subjectId={subjectId} />}
            {tab === "diagnostics" && <DiagnosticsTab subjectId={subjectId} />}
            {tab === "defense" && <DefenseTab subjectId={subjectId} />}
            {tab === "sessions" && <SessionsTab subjectId={subjectId} />}
          </div>
        </div>
      </div>
      {s && <SubjectDialog open={editing} onOpenChange={setEditing} subject={s} />}
    </>
  );
}

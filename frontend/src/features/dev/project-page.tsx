import { FileText, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useActivity, useProject, useSessions } from "@/lib/queries";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/shell/app-shell";
import { FileManager } from "@/components/shell/context-panel";
import { SessionItem } from "@/components/shell/session-item";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useNewSession } from "@/features/chat/use-new-session";
import { ProjectDialog } from "./project-dialog";

const ACTIVITY_ICON = { session: MessageSquare, file: FileText, message: MessageSquare };

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  const sessions = useSessions({ project_id: projectId });
  const activity = useActivity(projectId);
  const newSession = useNewSession();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const p = project.data;

  if (project.isError) return <><PageHeader title="Проєкт" /><ErrorState className="m-auto" title="Проєкт недоступний" message={errorMessage(project.error)} onRetry={() => project.refetch()} /></>;

  const remove = async () => {
    await api.delete(`/projects/${projectId}`);
    queryClient.invalidateQueries({ queryKey: qk.projects });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    navigate("/dev");
  };

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-1.5"><Link to="/dev" className="text-muted hover:text-fg">Розробка</Link><span className="text-subtle">/</span><span className="truncate">{p?.name ?? " "}</span></span>}
        actions={
          <>
            <IconButton label="Редагувати" onClick={() => setEditing(true)} disabled={!p}><Pencil /></IconButton>
            <IconButton label="Видалити проєкт" onClick={() => setDeleting(true)} disabled={!p}><Trash2 /></IconButton>
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} loading={newSession.isPending} onClick={() => newSession.mutate({ space: "dev", project_id: projectId })}>Сесія</Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6 sm:py-8">
          {p ? (
            <div className="mb-8">
              <h1 className="text-[28px] leading-[34px] font-medium tracking-[-0.025em]">{p.name}</h1>
              {p.description && <p className="mt-1.5 max-w-[68ch] text-sm text-fg/85">{p.description}</p>}
              {!!p.stack.length && <div className="mt-3 flex flex-wrap gap-1">{p.stack.map((s) => <span key={s} className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-xs">{s}</span>)}</div>}
            </div>
          ) : (
            <div className="mb-8 space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-80" /></div>
          )}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="space-y-8">
              <section>
                <h2 className="mb-2 text-sm font-medium text-muted">AI-сесії</h2>
                {sessions.isLoading ? <Skeleton className="h-20" /> : sessions.data?.length ? (
                  <div className="space-y-px rounded-lg border border-line bg-surface p-1">{sessions.data.map((s) => <SessionItem key={s.id} session={s} layoutGroup={`project-${projectId}`} />)}</div>
                ) : (
                  <div className="rounded-lg border border-dashed border-line-hover">
                    <EmptyState icon={<MessageSquare />} title="Сесій ще немає" description="Сесія проєкту автоматично шукає відповіді в його файлах." action={<Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => newSession.mutate({ space: "dev", project_id: projectId })}>Почати сесію</Button>} />
                  </div>
                )}
              </section>
              {!!activity.data?.length && (
              <section>
                <h2 className="mb-2 text-sm font-medium text-muted">Історія активності</h2>
                {(
                  <ol className="relative space-y-3 border-l border-line pl-4">
                    {activity.data.map((a, i) => {
                      const Icon = ACTIVITY_ICON[a.kind];
                      return (
                        <li key={`${a.kind}-${a.ref_id}-${i}`} className="relative">
                          <span className="absolute top-1 -left-[23px] flex size-3.5 items-center justify-center rounded-full border border-line bg-bg"><Icon className="size-2 text-subtle" /></span>
                          <p className="text-sm">{a.kind !== "file" ? <Link to={`/chat/${a.ref_id}`} className="hover:underline">{a.title}</Link> : a.title}</p>
                          <p className="text-2xs text-subtle">{relativeTime(a.at)}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
              )}
            </div>
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted">Файли</h2>
              <FileManager kind="project" ownerId={projectId} />
            </section>
          </div>
        </div>
      </div>
      {p && <ProjectDialog open={editing} onOpenChange={setEditing} project={p} />}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Видалити проєкт?" description={`«${p?.name}» і всі його файли буде видалено. Сесії залишаться без прив'язки.`} onConfirm={remove} />
    </>
  );
}

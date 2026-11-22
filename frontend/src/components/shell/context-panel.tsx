import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useModels, useOwnerFiles, useProject, useSession, useSubject } from "@/lib/queries";
import { dur, t } from "@/lib/motion";
import { formatTokens, relativeTime } from "@/lib/utils";
import { useUI, type ContextPanel } from "@/stores/ui";
import { IconButton } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Drawer } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { FilePreview, FileUploader, useUploader } from "@/components/files/files";
import type { StoredFile } from "@/lib/types";

function useWide() {
  const [wide, setWide] = useState(() => matchMedia("(min-width: 1280px)").matches);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

async function deleteFile(file: StoredFile, key: readonly unknown[]) {
  try {
    await api.delete(`/files/${file.id}`);
    queryClient.setQueryData<StoredFile[]>(key, (old) => old?.filter((f) => f.id !== file.id));
    queryClient.invalidateQueries({ queryKey: file.subject_id ? qk.subjects : qk.projects });
  } catch (e) {
    toast.error("Не вдалося видалити файл", errorMessage(e));
  }
}

export function FileManager({ kind, ownerId }: { kind: "subject" | "project"; ownerId: string }) {
  const key = kind === "subject" ? qk.subjectFiles(ownerId) : qk.projectFiles(ownerId);
  const files = useOwnerFiles(kind, ownerId);
  const uploader = useUploader(kind === "subject" ? `/subjects/${ownerId}/files` : `/projects/${ownerId}/files`, (f) => {
    queryClient.setQueryData<StoredFile[]>(key, (old) => [f, ...(old ?? [])]);
    queryClient.invalidateQueries({ queryKey: key });
  });
  return (
    <div className="space-y-3">
      <FileUploader uploader={uploader} compact />
      {files.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : files.isError ? (
        <ErrorState message={errorMessage(files.error)} onRetry={() => files.refetch()} />
      ) : files.data?.length ? (
        <div className="-mx-2">{files.data.map((f) => <FilePreview key={f.id} file={f} onDelete={() => deleteFile(f, key)} />)}</div>
      ) : null}
    </div>
  );
}

function SessionInfo({ sessionId }: { sessionId: string }) {
  const { data: s } = useSession(sessionId);
  const { data: models = [] } = useModels();
  const subject = useSubject(s?.subject_id ?? "");
  const project = useProject(s?.project_id ?? "");
  if (!s) return <Skeleton className="h-32" />;
  const rows: [string, string][] = [
    ["Модель", models.find((m) => m.id === s.model)?.label ?? s.model],
    ["Effort", s.effort],
    ["Контекст", s.subject_id ? subject.data?.name ?? "…" : s.project_id ? project.data?.name ?? "…" : "Без прив'язки"],
    ["Токени запитів", formatTokens(s.prompt_tokens)],
    ["Токени відповідей", formatTokens(s.completion_tokens)],
    ["Створено", relativeTime(s.created_at)],
    ["Оновлено", relativeTime(s.updated_at)],
  ];
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2">
          <dt className="text-muted">{k}</dt>
          <dd className="tabular truncate text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const TITLES: Record<NonNullable<ContextPanel>["kind"], string> = { materials: "Матеріали предмета", files: "Файли проєкту", session: "Про сесію", process: "Процес роботи AI" };

function PanelBody({ panel }: { panel: NonNullable<ContextPanel> }) {
  switch (panel.kind) {
    case "materials":
      return <FileManager kind="subject" ownerId={panel.subjectId} />;
    case "files":
      return <FileManager kind="project" ownerId={panel.projectId} />;
    case "session":
      return <SessionInfo sessionId={panel.sessionId} />;
    default:
      return null;
  }
}

/** Optional third column: opened on demand, never permanently. Drawer below 1280px. */
export function ContextPanelHost() {
  const panel = useUI((s) => s.panel);
  const close = () => useUI.getState().openPanel(null);
  const wide = useWide();
  const header = panel && (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
      <span className="text-sm font-medium">{TITLES[panel.kind]}</span>
      <IconButton label="Закрити панель" size="sm" onClick={close}><X /></IconButton>
    </div>
  );
  if (!wide) {
    return (
      <Drawer open={!!panel} onOpenChange={(o) => !o && close()} side="right" title={panel ? TITLES[panel.kind] : "Панель"}>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{panel && <PanelBody panel={panel} />}</div>
      </Drawer>
    );
  }
  return (
    <AnimatePresence initial={false}>
      {panel && (
        <motion.aside
          key="ctx"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 360, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={t(dur.sidebar)}
          className="shrink-0 overflow-hidden border-l border-line bg-bg"
          aria-label={TITLES[panel.kind]}
        >
          <div className="flex h-full w-[360px] flex-col">
            {header}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <PanelBody panel={panel} />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

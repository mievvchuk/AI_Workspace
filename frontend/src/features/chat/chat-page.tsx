import { FolderKanban, Info, Paperclip } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { errorMessage } from "@/lib/api";
import { useProject, useSession, useSubject } from "@/lib/queries";
import { useUI } from "@/stores/ui";
import { PageHeader } from "@/components/shell/app-shell";
import { SubjectEmoji } from "@/components/shell/subject-emoji";
import { IconButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { ChatView } from "./chat-view";

export function ChatPage() {
  const { sessionId = "" } = useParams();
  const session = useSession(sessionId);
  const subject = useSubject(session.data?.subject_id ?? "");
  const project = useProject(session.data?.project_id ?? "");
  const openPanel = useUI((s) => s.openPanel);
  const setSpace = useUI((s) => s.setSpace);
  const s = session.data;

  useEffect(() => {
    if (s) setSpace(s.space);
  }, [s, setSpace]);

  if (session.isError) return <ErrorState className="m-auto" title="Сесію не знайдено" message={errorMessage(session.error)} />;

  const scopeName = s?.subject_id ? subject.data?.name : s?.project_id ? project.data?.name : undefined;
  const crumb = s?.subject_id && subject.data ? (
    <Link to={`/study/subjects/${subject.data.id}`} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-fg">
      <SubjectEmoji emoji={subject.data.emoji} size="xs" />
      <span className="truncate">{subject.data.name}</span>
    </Link>
  ) : s?.project_id && project.data ? (
    <Link to={`/dev/projects/${project.data.id}`} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-fg">
      <FolderKanban className="size-3.5 shrink-0" />
      <span className="truncate">{project.data.name}</span>
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            {crumb}
            {crumb && <span className="text-subtle">/</span>}
            <span className="truncate">{s?.title ?? " "}</span>
          </span>
        }
        actions={
          <>
            {s?.subject_id && (
              <IconButton label="Матеріали предмета" onClick={() => openPanel({ kind: "materials", subjectId: s.subject_id! })}>
                <Paperclip />
              </IconButton>
            )}
            {s?.project_id && (
              <IconButton label="Файли проєкту" onClick={() => openPanel({ kind: "files", projectId: s.project_id! })}>
                <Paperclip />
              </IconButton>
            )}
            <IconButton label="Про сесію" onClick={() => openPanel({ kind: "session", sessionId })}>
              <Info />
            </IconButton>
          </>
        }
      />
      <ChatView key={sessionId} sessionId={sessionId} contextLabel={scopeName} />
    </>
  );
}

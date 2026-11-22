import * as D from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { BookOpen, Code2, FolderKanban, MessageSquare, Moon, Plus, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useProjects, useSessions, useSubjects } from "@/lib/queries";
import { relativeTime } from "@/lib/utils";
import { useUI } from "@/stores/ui";
import { useNewSession } from "@/features/chat/use-new-session";
import { SubjectEmoji } from "./subject-emoji";
import { useCurrentScope } from "./sidebar";

const itemCls = "flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm outline-none data-[selected=true]:bg-hover [&_svg]:size-3.5 [&_svg]:text-subtle";
const groupCls = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle";

/** Raycast-style command palette: navigation, full-text session search, quick actions. */
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();
  const subjects = useSubjects();
  const projects = useProjects();
  const sessions = useSessions({ q: debounced || undefined });
  const newSession = useNewSession();
  const scope = useCurrentScope();
  const { theme, setTheme, setSpace } = useUI();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(id);
  }, [query]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const dark = document.documentElement.dataset.theme === "dark";

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="ov fixed inset-0 z-40 bg-black/30" />
        <D.Content aria-describedby={undefined} className="pop fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-elevated shadow-[var(--shadow-pop)]">
          <D.Title className="sr-only">Пошук і команди</D.Title>
          <Command loop shouldFilter={!debounced} className="flex max-h-[60vh] flex-col">
            <div className="flex items-center gap-2.5 border-b border-line px-3.5">
              <Search className="size-4 text-subtle" />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Шукати сесії, предмети, проєкти або дії…" className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-subtle" />
            </div>
            <Command.List className="overflow-y-auto p-1.5">
              <Command.Empty className="py-8 text-center text-sm text-muted">{sessions.isFetching ? "Пошук…" : "Нічого не знайдено"}</Command.Empty>
              {!debounced && (
                <Command.Group heading="Дії" className={groupCls}>
                  <Command.Item className={itemCls} onSelect={() => run(() => newSession.mutate({ space: scope.space, subject_id: scope.subjectId, project_id: scope.projectId }))}>
                    <Plus /> Нова сесія
                  </Command.Item>
                  <Command.Item className={itemCls} onSelect={() => run(() => { setSpace("study"); navigate("/study"); })}>
                    <BookOpen /> Перейти до навчання
                  </Command.Item>
                  <Command.Item className={itemCls} onSelect={() => run(() => { setSpace("dev"); navigate("/dev"); })}>
                    <Code2 /> Перейти до розробки
                  </Command.Item>
                  <Command.Item className={itemCls} onSelect={() => run(() => setTheme(dark ? "light" : "dark"))}>
                    {dark ? <Sun /> : <Moon />} {dark ? "Світла тема" : "Темна тема"} {theme === "system" && <span className="ml-auto text-2xs text-subtle">зараз системна</span>}
                  </Command.Item>
                </Command.Group>
              )}
              {!!sessions.data?.length && (
                <Command.Group heading={debounced ? "Сесії (пошук у повідомленнях)" : "Останні сесії"} className={groupCls}>
                  {sessions.data.slice(0, debounced ? 20 : 6).map((s) => (
                    <Command.Item key={s.id} value={`session ${s.title} ${s.id}`} className={itemCls} onSelect={() => run(() => navigate(`/chat/${s.id}`))}>
                      <MessageSquare />
                      <span className="flex-1 truncate">{s.title}</span>
                      <span className="text-2xs text-subtle">{relativeTime(s.updated_at)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!debounced && !!subjects.data?.length && (
                <Command.Group heading="Предмети" className={groupCls}>
                  {subjects.data.map((s) => (
                    <Command.Item key={s.id} value={`subject ${s.name}`} className={itemCls} onSelect={() => run(() => { setSpace("study"); navigate(`/study/subjects/${s.id}`); })}>
                      <SubjectEmoji emoji={s.emoji} size="xs" /> {s.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!debounced && !!projects.data?.length && (
                <Command.Group heading="Проєкти" className={groupCls}>
                  {projects.data.map((p) => (
                    <Command.Item key={p.id} value={`project ${p.name} ${p.stack.join(" ")}`} className={itemCls} onSelect={() => run(() => { setSpace("dev"); navigate(`/dev/projects/${p.id}`); })}>
                      <FolderKanban /> {p.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

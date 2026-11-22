import { motion } from "motion/react";
import { ArrowRight, BookOpen, ClipboardCheck, FlaskConical, MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useDashboard, useMe } from "@/lib/queries";
import type { Subject } from "@/lib/types";
import { deal, fadeUp, stagger } from "@/lib/motion";
import { plural, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/shell/app-shell";
import { SubjectEmoji } from "@/components/shell/subject-emoji";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { useNewSession } from "@/features/chat/use-new-session";
import { SubjectDialog } from "./subject-dialog";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Доброї ночі" : h < 12 ? "Доброго ранку" : h < 18 ? "Доброго дня" : "Доброго вечора";
}

function SubjectCard({ subject, onEdit, onDelete }: { subject: Subject; onEdit: () => void; onDelete: () => void }) {
  return (
    <motion.div variants={deal} layout className="group relative">
      <Link to={`/study/subjects/${subject.id}`} className="flex h-full min-h-[76px] flex-col rounded-lg stock stock-hover p-3.5">
        <div className="flex items-start gap-3">
          <SubjectEmoji emoji={subject.emoji} size="md" />
          <div className="min-w-0 flex-1 pr-6">
            <p className="truncate text-sm font-medium">{subject.name}</p>
            {subject.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{subject.description}</p>}
          </div>
        </div>
        {(subject.material_count > 0 || subject.lab_count > 0) && (
          <div className="mt-auto flex items-center gap-3 pt-3 text-2xs text-subtle">
            {subject.material_count > 0 && <span className="tabular">{subject.material_count} {plural(subject.material_count, "матеріал", "матеріали", "матеріалів")}</span>}
            {subject.lab_count > 0 && <span className="tabular">{subject.lab_count} {plural(subject.lab_count, "лабораторна", "лабораторні", "лабораторних")}</span>}
            {subject.labs_open > 0 && <Badge tone="warning" className="ml-auto">{subject.labs_open} відкр.</Badge>}
          </div>
        )}
      </Link>
      <div className="absolute top-2.5 right-2.5">
        <Menu>
          <MenuTrigger asChild>
            <button type="button" aria-label={`Дії: ${subject.name}`} className="flex size-7 items-center justify-center rounded-md text-subtle opacity-100 transition-opacity hover:bg-hover hover:text-fg data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
              <MoreHorizontal className="size-4" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Pencil />} onSelect={onEdit}>Редагувати</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} destructive onSelect={onDelete}>Видалити</MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </motion.div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StudyHome() {
  const { data: me } = useMe();
  const dash = useDashboard();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Subject | undefined>();
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const newSession = useNewSession();
  const navigate = useNavigate();
  const creating = params.get("new") === "1";
  const dialogOpen = creating || !!editing;
  const closeDialog = () => {
    setEditing(undefined);
    if (creating) setParams({}, { replace: true });
  };

  const remove = async (s: Subject) => {
    try {
      await api.delete(`/subjects/${s.id}`);
      queryClient.invalidateQueries({ queryKey: qk.subjects });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Предмет видалено");
    } catch (e) {
      toast.error("Не вдалося видалити", errorMessage(e));
    }
  };

  const d = dash.data;
  return (
    <>
      <PageHeader title="Навчання" actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setParams({ new: "1" })}>Предмет</Button>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1040px] space-y-8 px-4 py-6 sm:px-6 sm:py-8">
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <h1 className="text-[28px] leading-[34px] font-medium tracking-[-0.025em]">{greeting()}{me?.name ? <>, {me.name.split(" ")[0]}</> : ""}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {d ? (d.subjects.length ? `${d.subjects.length} ${plural(d.subjects.length, "предмет", "предмети", "предметів")}${d.open_labs.length ? ` · ${d.open_labs.length} незавершених лабораторних` : ""}` : "Почніть з додавання першого предмета.") : " "}
            </p>
          </motion.div>

          {dash.isError ? (
            <ErrorState message={errorMessage(dash.error)} onRetry={() => dash.refetch()} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" icon={<MessageSquare className="size-3.5" />} loading={newSession.isPending} onClick={() => newSession.mutate({ space: "study" })}>Запитати AI</Button>
                <Button variant="outline" size="sm" icon={<ClipboardCheck className="size-3.5" />} onClick={() => navigate("/study/diagnostics/new")}>Перевірити знання</Button>
              </div>

              <Section title="Предмети">
                {dash.isLoading ? (
                  <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))]">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px]" />)}</div>
                ) : d?.subjects.length ? (
                  <motion.div variants={stagger()} initial="hidden" animate="show" className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))]">
                    {d.subjects.map((s) => <SubjectCard key={s.id} subject={s} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />)}
                  </motion.div>
                ) : (
                  <div className="rounded-lg border border-dashed border-line-hover">
                    <EmptyState icon={<BookOpen />} title="Ще немає предметів" description="Додайте предмет — емодзі підбереться автоматично, а матеріали стануть контекстом для AI." action={<Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setParams({ new: "1" })}>Додати предмет</Button>} />
                  </div>
                )}
              </Section>

              {(!!d?.open_labs.length || !!d?.recent_sessions.length || !!d?.recent_diagnostics.length) && (
                <div className="grid gap-8 lg:grid-cols-2">
                  {!!d?.open_labs.length && (
                    <Section title="Незавершені лабораторні">
                      <motion.ul variants={stagger(0.12)} initial="hidden" animate="show" className="divide-y divide-line rounded-lg stock">
                        {d.open_labs.map((lab) => {
                          const s = d.subjects.find((x) => x.id === lab.subject_id);
                          return (
                            <motion.li variants={fadeUp} key={lab.id}>
                              <Link to={`/study/subjects/${lab.subject_id}?tab=labs&lab=${lab.id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-hover/60">
                                <FlaskConical className="size-3.5 shrink-0 text-subtle" />
                                <span className="min-w-0 flex-1 truncate text-sm">{lab.title}</span>
                                <span className="truncate text-2xs text-subtle">{s?.name}</span>
                                {lab.status === "in_progress" && <Badge tone="accent">в роботі</Badge>}
                              </Link>
                            </motion.li>
                          );
                        })}
                      </motion.ul>
                    </Section>
                  )}
                  {!!d?.recent_sessions.length && (
                    <Section title="Останні сесії">
                      <motion.ul variants={stagger(0.12)} initial="hidden" animate="show" className="divide-y divide-line rounded-lg stock">
                        {d.recent_sessions.map((s) => (
                          <motion.li variants={fadeUp} key={s.id}>
                            <Link to={`/chat/${s.id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-hover/60">
                              <MessageSquare className="size-3.5 shrink-0 text-subtle" />
                              <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                              <span className="shrink-0 text-2xs text-subtle">{relativeTime(s.updated_at)}</span>
                            </Link>
                          </motion.li>
                        ))}
                      </motion.ul>
                    </Section>
                  )}
                  {!!d?.recent_diagnostics.length && (
                    <Section title="Останні діагностики">
                      <motion.ul variants={stagger(0.12)} initial="hidden" animate="show" className="divide-y divide-line rounded-lg stock">
                        {d.recent_diagnostics.map((g) => (
                          <motion.li variants={fadeUp} key={g.id}>
                            <Link to={`/study/diagnostics/${g.id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-hover/60">
                              <ClipboardCheck className="size-3.5 shrink-0 text-subtle" />
                              <span className="min-w-0 flex-1 truncate text-sm">{g.topic}</span>
                              <span className="tabular text-sm font-medium">{g.score != null ? `${Math.round(g.score)}%` : "—"}</span>
                              <ArrowRight className="size-3.5 text-subtle" />
                            </Link>
                          </motion.li>
                        ))}
                      </motion.ul>
                    </Section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <SubjectDialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()} subject={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Видалити предмет?"
        description={`«${deleting?.name}» разом з матеріалами, лабораторними й діагностиками буде видалено. Сесії залишаться без прив'язки.`}
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
      />
    </>
  );
}

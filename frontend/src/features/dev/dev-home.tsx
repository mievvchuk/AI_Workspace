import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowDownAZ, Clock, FolderKanban, FolderPlus, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useCategories, useProjects } from "@/lib/queries";
import type { Category } from "@/lib/types";
import { fadeUp, stagger } from "@/lib/motion";
import { cn, plural, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/shell/app-shell";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ProjectDialog } from "./project-dialog";

function CategoryDialog({ open, onOpenChange, category }: { open: boolean; onOpenChange: (o: boolean) => void; category?: Category }) {
  const [name, setName] = useState(category?.name ?? "");
  const save = useMutation({
    mutationFn: () => (category ? api.patch<Category>(`/categories/${category.id}`, { name: name.trim() }) : api.post<Category>("/categories", { name: name.trim() })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.categories });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Не вдалося зберегти", errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={category ? "Перейменувати категорію" : "Нова категорія"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Скасувати</Button><Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>Зберегти</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(); }}>
        <Input autoFocus aria-label="Назва категорії" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Веб, Мобільні, Навчальні…" />
      </form>
    </Dialog>
  );
}

export function DevHome() {
  const projects = useProjects();
  const categories = useCategories();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [category, setCategory] = useState<string>("all");
  const [catDialog, setCatDialog] = useState<{ open: boolean; category?: Category }>({ open: false });
  const [deletingCat, setDeletingCat] = useState<Category | null>(null);
  const creating = params.get("new") === "1";

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = projects.data ?? [];
    if (category === "none") items = items.filter((p) => !p.category_id);
    else if (category !== "all") items = items.filter((p) => p.category_id === category);
    if (q) items = items.filter((p) => `${p.name} ${p.description} ${p.stack.join(" ")}`.toLowerCase().includes(q));
    return [...items].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "uk") : b.updated_at.localeCompare(a.updated_at)));
  }, [projects.data, query, sort, category]);

  const catName = (id: string | null) => categories.data?.find((c) => c.id === id)?.name;
  const removeCategory = async (c: Category) => {
    await api.delete(`/categories/${c.id}`);
    if (category === c.id) setCategory("all");
    queryClient.invalidateQueries({ queryKey: qk.categories });
    queryClient.invalidateQueries({ queryKey: qk.projects });
  };

  const chip = (value: string, label: string, count?: number) => (
    <button key={value} type="button" onClick={() => setCategory(value)} className={cn("flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors", category === value ? "bg-hover text-fg" : "text-muted hover:text-fg")}>
      {label}
      {count !== undefined && <span className="tabular text-2xs text-subtle">{count}</span>}
    </button>
  );

  return (
    <>
      <PageHeader title="Розробка" actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setParams({ new: "1" })}>Проєкт</Button>} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1040px] space-y-5 px-4 py-6 sm:px-6 sm:py-8">
          <div>
            <h1 className="text-[28px] leading-[34px] font-medium tracking-[-0.025em]">Каталог проєктів</h1>
            <p className="mt-0.5 text-sm text-muted">Проєкти, їхні файли та AI-сесії з контекстом коду.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук за назвою, описом або стеком" className="pl-8" aria-label="Пошук проєктів" />
            </div>
            <div className="flex gap-1">
              <Button size="md" variant={sort === "recent" ? "secondary" : "ghost"} icon={<Clock className="size-3.5" />} onClick={() => setSort("recent")}>Нещодавні</Button>
              <Button size="md" variant={sort === "name" ? "secondary" : "ghost"} icon={<ArrowDownAZ className="size-3.5" />} onClick={() => setSort("name")}>За назвою</Button>
            </div>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line pb-2 [scrollbar-width:none]">
            {chip("all", "Усі", projects.data?.length)}
            {categories.data?.map((c) => (
              <div key={c.id} className="group flex shrink-0 items-center">
                {chip(c.id, c.name, projects.data?.filter((p) => p.category_id === c.id).length)}
                <Menu>
                  <MenuTrigger asChild>
                    <button type="button" aria-label={`Дії: ${c.name}`} className="flex size-6 items-center justify-center rounded text-subtle opacity-100 hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal className="size-3.5" /></button>
                  </MenuTrigger>
                  <MenuContent align="start">
                    <MenuItem icon={<Pencil />} onSelect={() => setCatDialog({ open: true, category: c })}>Перейменувати</MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} destructive onSelect={() => setDeletingCat(c)}>Видалити</MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            ))}
            {!!projects.data?.some((p) => !p.category_id) && !!categories.data?.length && chip("none", "Без категорії")}
            <IconButton label="Нова категорія" size="sm" onClick={() => setCatDialog({ open: true })}><FolderPlus /></IconButton>
          </div>

          {projects.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : projects.isError ? (
            <ErrorState message={errorMessage(projects.error)} onRetry={() => projects.refetch()} />
          ) : list.length ? (
            <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="divide-y divide-line rounded-lg border border-line bg-surface">
              {list.map((p) => (
                <motion.li key={p.id} variants={fadeUp} layout>
                  <Link to={`/dev/projects/${p.id}`} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-hover/50">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-subtle"><FolderKanban className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{p.name}</span>
                        {catName(p.category_id) && <span className="hidden truncate text-2xs text-subtle sm:inline">{catName(p.category_id)}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1 overflow-hidden">
                        {p.stack.slice(0, 5).map((s) => <span key={s} className="shrink-0 rounded-sm border border-line px-1.5 text-2xs text-muted">{s}</span>)}
                        {!p.stack.length && <span className="truncate text-xs text-subtle">{p.description || "Без опису"}</span>}
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-right text-2xs text-subtle sm:block">
                      <div className="tabular">{p.session_count} {plural(p.session_count, "сесія", "сесії", "сесій")} · {p.file_count} {plural(p.file_count, "файл", "файли", "файлів")}</div>
                      <div>{relativeTime(p.updated_at)}</div>
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          ) : projects.data?.length ? (
            <EmptyState title="Нічого не знайдено" description="Змініть пошуковий запит або категорію." />
          ) : (
            <div className="rounded-lg border border-dashed border-line-hover">
              <EmptyState icon={<FolderKanban />} title="Ще немає проєктів" description="Створіть проєкт, додайте файли — і AI-сесії працюватимуть з контекстом вашого коду." action={<Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setParams({ new: "1" })}>Новий проєкт</Button>} />
            </div>
          )}
        </div>
      </div>
      <ProjectDialog open={creating} onOpenChange={(o) => !o && setParams({}, { replace: true })} defaultCategory={category !== "all" && category !== "none" ? category : undefined} />
      <CategoryDialog key={catDialog.category?.id ?? "new"} open={catDialog.open} onOpenChange={(open) => setCatDialog({ open })} category={catDialog.category} />
      <ConfirmDialog open={!!deletingCat} onOpenChange={(o) => !o && setDeletingCat(null)} title="Видалити категорію?" description={`Проєкти з «${deletingCat?.name}» залишаться, але без категорії.`} onConfirm={() => (deletingCat ? removeCategory(deletingCat) : undefined)} />
    </>
  );
}

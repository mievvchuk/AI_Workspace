import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useCategories } from "@/lib/queries";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

function StackInput({ value, onChange, id }: { value: string[]; onChange: (v: string[]) => void; id: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    // pasted "React, TypeScript" becomes separate tags
    const next = [...value];
    for (const raw of draft.split(",")) {
      const v = raw.trim().slice(0, 40);
      if (v && !next.some((x) => x.toLowerCase() === v.toLowerCase()) && next.length < 20) next.push(v);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-1 focus-within:border-accent focus-within:ring-3 focus-within:ring-ring/40">
      {value.map((s) => (
        <span key={s} className="flex h-6 items-center gap-1 rounded-sm bg-hover pr-0.5 pl-1.5 text-xs">
          {s}
          <button type="button" aria-label={`Прибрати ${s}`} onClick={() => onChange(value.filter((x) => x !== s))} className="rounded p-0.5 text-subtle hover:text-fg"><X className="size-3" /></button>
        </span>
      ))}
      <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} placeholder={value.length ? "" : "React, FastAPI, PostgreSQL…"} className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-subtle" />
    </div>
  );
}

export function ProjectDialog({ open, onOpenChange, project, defaultCategory }: { open: boolean; onOpenChange: (o: boolean) => void; project?: Project; defaultCategory?: string }) {
  const categories = useCategories();
  const [form, setForm] = useState({ name: "", description: "", stack: [] as string[], category_id: "" });
  useEffect(() => {
    if (open) setForm({ name: project?.name ?? "", description: project?.description ?? "", stack: project?.stack ?? [], category_id: project?.category_id ?? defaultCategory ?? "" });
  }, [open, project, defaultCategory]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, name: form.name.trim(), category_id: form.category_id || null };
      return project ? api.patch<Project>(`/projects/${project.id}`, body) : api.post<Project>("/projects", body);
    },
    onSuccess: (p) => {
      queryClient.setQueryData(qk.project(p.id), p);
      queryClient.invalidateQueries({ queryKey: qk.projects });
      toast.success(project ? "Проєкт оновлено" : "Проєкт створено", p.name);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)} title={project ? "Редагувати проєкт" : "Новий проєкт"}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Скасувати</Button><Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>{project ? "Зберегти" : "Створити"}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (form.name.trim() && !save.isPending) save.mutate(); }}>
        <Field label="Назва">{(id) => <Input id={id} autoFocus value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="Опис" optional>{(id) => <Textarea id={id} rows={3} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
        <Field label="Стек" optional hint="Enter або кома — додати">{(id) => <StackInput id={id} value={form.stack} onChange={(stack) => setForm({ ...form, stack })} />}</Field>
        <Field label="Категорія" optional>
          {(id) => (
            <Select id={id} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Без категорії</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        {save.isError && <p role="alert" className="text-sm text-danger">{errorMessage(save.error)}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

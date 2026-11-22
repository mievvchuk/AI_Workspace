import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient } from "@/lib/queries";
import type { EmojiSuggestion, Subject } from "@/lib/types";
import { dur, t } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dialog, Popover } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { EmojiGlyph, SubjectEmoji } from "@/components/shell/subject-emoji";

const PALETTE = ["🧠", "💻", "🗄️", "🔐", "🌐", "📐", "📊", "🎨", "🏗️", "🧪", "🧬", "⚛️", "📚", "🏛️", "📖", "🗣️", "📈", "💼", "⚖️", "🩺", "🌱", "🗺️", "🔭", "🎵", "🛠️", "⚡", "🤖", "📱", "⚙️", "🖥️", "🎮", "🧮", "🕸️", "📘", "📗", "📝"];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Local-only suggestion after the user pauses typing — never an AI call per keystroke. */
function useEmojiSuggestion(name: string, description: string) {
  const n = useDebounced(name.trim(), 400);
  const d = useDebounced(description.trim(), 600);
  return useQuery({
    queryKey: ["emoji", n, d],
    queryFn: () => api.post<EmojiSuggestion>("/emoji/suggest", { name: n, description: d }),
    enabled: n.length >= 2,
    staleTime: Infinity,
  });
}

function EmojiPicker({ value, suggestions, onPick }: { value: string; suggestions: string[]; onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (e: string) => {
    onPick(e);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-[300px] p-2"
      trigger={
        <button type="button" aria-label="Змінити емодзі" className="rounded-lg transition-transform duration-150 hover:scale-105 focus-visible:scale-105">
          <SubjectEmoji emoji={value} size="lg" />
        </button>
      }
    >
      {suggestions.length > 0 && (
        <>
          <p className="px-1 pb-1 text-2xs text-subtle">Підходять за назвою</p>
          <div className="mb-2 flex gap-1">
            {suggestions.map((e) => (
              <button key={e} type="button" onClick={() => pick(e)} className={cn("flex size-9 items-center justify-center rounded-lg transition-transform duration-150 hover:scale-110 hover:bg-hover", e === value && "bg-accent-soft ring-1 ring-accent/40")}><EmojiGlyph emoji={e} className="size-6" /></button>
            ))}
          </div>
        </>
      )}
      <p className="px-1 pb-1 text-2xs text-subtle">Усі</p>
      <div className="grid grid-cols-8 gap-0.5">
        {PALETTE.map((e) => (
          <button key={e} type="button" onClick={() => pick(e)} className={cn("flex size-8 items-center justify-center rounded-lg transition-transform duration-150 hover:scale-110 hover:bg-hover", e === value && "bg-accent-soft ring-1 ring-accent/40")}><EmojiGlyph emoji={e} className="size-5" /></button>
        ))}
      </div>
    </Popover>
  );
}

const SOURCE_LABEL = { local: "Підібрано за назвою", ai: "Підібрано AI", fallback: "Нейтральне — уточніть назву або оберіть вручну" } as const;

export function SubjectDialog({ open, onOpenChange, subject }: { open: boolean; onOpenChange: (o: boolean) => void; subject?: Subject }) {
  const editing = !!subject;
  const [name, setName] = useState(subject?.name ?? "");
  const [description, setDescription] = useState(subject?.description ?? "");
  const [manualEmoji, setManualEmoji] = useState<string | null>(subject?.emoji_source === "manual" ? subject.emoji : null);
  const [keepEmoji, setKeepEmoji] = useState(editing);
  const nameRef = useRef<HTMLInputElement>(null);
  const suggestion = useEmojiSuggestion(name, description);

  useEffect(() => {
    if (!open) return;
    setName(subject?.name ?? "");
    setDescription(subject?.description ?? "");
    setManualEmoji(subject?.emoji_source === "manual" ? subject.emoji : null);
    setKeepEmoji(!!subject);
  }, [open, subject]);

  const suggested = suggestion.data?.emoji;
  // Editing: keep the stored emoji until the user accepts the proposed one.
  const shown = manualEmoji ?? (keepEmoji && subject ? subject.emoji : suggested ?? "📘");
  const offerUpdate = editing && !manualEmoji && keepEmoji && suggested && suggested !== subject?.emoji && name.trim() !== subject?.name;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = { name: name.trim(), description: description.trim() };
      if (manualEmoji) body.emoji = manualEmoji;
      else if (editing && !keepEmoji && suggested) body.emoji = suggested;
      else if (!editing && suggestion.data && suggestion.data.source !== "fallback") body.emoji = suggestion.data.emoji;
      // creating with no confident local match: backend tries the AI fallback, then neutral
      return editing ? api.patch<Subject>(`/subjects/${subject!.id}`, body) : api.post<Subject>("/subjects", body);
    },
    onSuccess: (s) => {
      queryClient.setQueryData<Subject[]>(qk.subjects, (old) => (editing ? old?.map((x) => (x.id === s.id ? s : x)) : [...(old ?? []), s]));
      queryClient.setQueryData(qk.subject(s.id), s);
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(editing ? "Предмет оновлено" : "Предмет створено", s.name);
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={editing ? "Редагувати предмет" : "Новий предмет"}
      description="Емодзі підбирається автоматично за назвою та описом."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>Скасувати</Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            {editing ? "Зберегти" : "Створити"}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate(); }}>
        <div className="flex items-start gap-3">
          <EmojiPicker value={shown} suggestions={[suggested, ...(suggestion.data?.alternatives ?? [])].filter((x): x is string => !!x).slice(0, 6)} onPick={setManualEmoji} />
          <div className="min-w-0 flex-1">
            <Field label="Назва">{(id) => <Input ref={nameRef} id={id} autoFocus value={name} maxLength={160} placeholder="Наприклад, Машинне навчання" onChange={(e) => setName(e.target.value)} />}</Field>
            {(manualEmoji || suggestion.isFetching || (suggestion.data && !keepEmoji)) && (
            <div className="mt-1.5 flex min-h-5 items-center gap-1.5 text-2xs text-subtle">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={manualEmoji ? "m" : suggestion.isFetching ? "f" : suggestion.data?.source ?? "none"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t(0.12)} className="flex items-center gap-1.5">
                  {manualEmoji ? (
                    <>Обрано вручну · <button type="button" className="text-accent hover:underline" onClick={() => setManualEmoji(null)}>повернути автопідбір</button></>
                  ) : suggestion.isFetching ? (
                    <><Loader2 className="size-3 animate-spin" />Підбираємо емодзі…</>
                  ) : suggestion.data && !keepEmoji ? (
                    <><Sparkles className="size-3" />{SOURCE_LABEL[suggestion.data.source]}{!editing && suggestion.data.source === "fallback" ? "; під час збереження спробуємо AI" : ""}</>
                  ) : null}
                </motion.span>
              </AnimatePresence>
            </div>
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {offerUpdate && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t(dur.dropdown)} className="overflow-hidden">
              <div className="flex items-center gap-2 rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-sm">
                <Wand2 className="size-3.5 text-accent" />
                <span className="flex-1">Назва змінилась. Оновити емодзі на {suggested}?</span>
                <Button size="sm" variant="outline" onClick={() => setKeepEmoji(false)}>Оновити</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Field label="Опис" optional>{(id) => <Textarea id={id} value={description} maxLength={2000} rows={3} placeholder="Що вивчаєте, викладач, формат контролю…" onChange={(e) => setDescription(e.target.value)} />}</Field>
        {save.isError && <p role="alert" className="text-sm text-danger">{errorMessage(save.error)}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

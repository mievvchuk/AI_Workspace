import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Loader2, Paperclip, Square, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import type { Effort, ModelInfo } from "@/lib/types";
import { useUI } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { dur, t } from "@/lib/motion";
import { IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { EffortSelector, ModelSelector } from "@/components/ai/selectors";
import { ACCEPT, useFileStatus, useUploader, type UploadItem } from "@/components/files/files";

const MAX_ROWS_PX = 240;

interface ComposerProps {
  draftKey: string;
  contextLabel?: string;
  model?: ModelInfo;
  modelId: string;
  effort: Effort;
  onModel: (m: ModelInfo) => void;
  onEffort: (e: Effort) => void;
  streaming: boolean;
  stopping?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (text: string, fileIds: string[]) => void;
  onStop: () => void;
  autoFocus?: boolean;
}

function AttachmentChip({ item, onRemove }: { item: UploadItem; onRemove: () => void }) {
  const { data: file } = useFileStatus(item.file);
  const pending = !item.error && (!file || ["uploaded", "parsing", "indexing"].includes(file.status));
  const failed = !!item.error || file?.status === "failed";
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={t(dur.dropdown)}
      className={cn("flex h-7 max-w-[220px] items-center gap-1.5 rounded-md border border-line bg-surface pr-1 pl-2 text-xs", failed && "border-danger/40 text-danger")}
      title={item.error ?? file?.error ?? item.name}
    >
      {pending && <Loader2 className="size-3 shrink-0 animate-spin text-subtle" />}
      <span className="truncate">{item.name}</span>
      {!item.file && !item.error && <span className="tabular text-2xs text-subtle">{item.progress}%</span>}
      <button type="button" aria-label={`Прибрати ${item.name}`} onClick={onRemove} className="rounded p-0.5 text-subtle hover:text-fg">
        <X className="size-3" />
      </button>
    </motion.div>
  );
}

/** Floating composer: autosize, Enter to send, Shift+Enter newline, drafts, drag&drop/paste files. */
export function Composer(props: ComposerProps) {
  const { draftKey, streaming, disabled, onSend, onStop } = props;
  const draft = useUI((s) => s.drafts[draftKey] ?? "");
  const setDraft = useUI((s) => s.setDraft);
  const [text, setText] = useState(draft);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploader = useUploader("/files");

  // Switching sessions: load that session's draft.
  useEffect(() => {
    setText(useUI.getState().drafts[draftKey] ?? "");
    uploader.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the draft target changes
  }, [draftKey]);

  // Persist the draft (debounced) so an accidental navigation doesn't lose it.
  useEffect(() => {
    const id = setTimeout(() => setDraft(draftKey, text), 250);
    return () => clearTimeout(id);
  }, [text, draftKey, setDraft]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [text]);

  // Re-focus after a reply finishes (desktop only; on touch it would pop the keyboard).
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (wasStreaming.current && !streaming && matchMedia("(pointer: fine)").matches) ref.current?.focus();
    wasStreaming.current = streaming;
  }, [streaming]);

  const uploading = uploader.items.some((i) => !i.error && !i.file);
  const canSend = !!text.trim() && !streaming && !disabled && !uploading;

  const send = () => {
    if (!canSend) return;
    const ids = uploader.items.filter((i) => i.file && !i.error).map((i) => i.file!.id);
    onSend(text.trim(), ids);
    setText("");
    setDraft(draftKey, "");
    uploader.clear();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (!files.length) return;
    e.preventDefault();
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length) toast.info("Зображення не підтримуються", "Поточні моделі працюють лише з текстом і документами");
    const docs = files.filter((f) => !f.type.startsWith("image/"));
    if (docs.length) uploader.add(docs);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) uploader.add(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative rounded-xl border border-line bg-elevated shadow-[var(--shadow-float)] transition-[border-color,box-shadow] duration-150 focus-within:border-line-hover",
        dragging && "border-accent ring-3 ring-ring/30",
      )}
    >
      {dragging && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-accent-soft text-sm font-medium text-accent">Відпустіть, щоб прикріпити</div>}
      <AnimatePresence initial={false}>
        {uploader.items.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t(dur.dropdown)} className="overflow-hidden">
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              <AnimatePresence initial={false}>
                {uploader.items.map((item) => (
                  <AttachmentChip key={item.key} item={item} onRemove={() => uploader.remove(item.key)} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        autoFocus={props.autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        disabled={disabled}
        placeholder={props.disabledReason ?? (props.contextLabel ? `Запитайте про ${props.contextLabel}…` : "Напишіть повідомлення…")}
        aria-label="Повідомлення"
        className="block max-h-[240px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-read leading-6 placeholder:text-subtle disabled:opacity-60"
      />
      <div className="flex min-w-0 items-center gap-0.5 px-1.5 pb-1.5">
        <IconButton label="Прикріпити файл" size="sm" onClick={() => fileInput.current?.click()} disabled={disabled}>
          <Paperclip />
        </IconButton>
        <input ref={fileInput} type="file" multiple hidden accept={ACCEPT.join(",")} onChange={(e) => e.target.files && (uploader.add(e.target.files), (e.target.value = ""))} />
        <ModelSelector value={props.modelId} onChange={props.onModel} disabled={streaming} />
        {/* only offer the effort control when the model actually has more than one level */}
        {(props.model?.efforts.length ?? 0) > 1 && <EffortSelector value={props.effort} model={props.model} onChange={props.onEffort} disabled={streaming} />}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {uploader.items.length > 0 && <span className="tabular hidden text-2xs text-subtle sm:inline">{uploader.items.length} влад.</span>}
          {streaming ? (
            <IconButton label="Зупинити генерацію" variant="outline" size="md" onClick={onStop} disabled={props.stopping} tooltip>
              {props.stopping ? <Loader2 className="animate-spin" /> : <Square className="fill-current !size-3" />}
            </IconButton>
          ) : (
            <IconButton label="Надіслати" shortcut="Enter" variant="primary" size="md" onClick={send} disabled={!canSend} className="rounded-lg">
              <ArrowUp />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}

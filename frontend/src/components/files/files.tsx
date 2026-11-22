import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, FileCode2, FileText, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { api, errorMessage, uploadFile } from "@/lib/api";
import type { FileStatus, StoredFile } from "@/lib/types";
import { dur, t } from "@/lib/motion";
import { cn, formatBytes } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";

export const ACCEPT = [".pdf", ".docx", ".txt", ".md", ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".cs", ".go", ".rs", ".sql", ".json", ".yaml", ".yml", ".html", ".css", ".csv"];
export const MAX_MB = 20;

export function validateFile(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ACCEPT.includes(ext)) return `Формат ${ext} не підтримується`;
  if (file.size > MAX_MB * 1024 * 1024) return `Більше ${MAX_MB} МБ`;
  if (file.size === 0) return "Файл порожній";
  return null;
}

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  progress: number;
  error: string | null;
  file: StoredFile | null;
}

/** Manages client-side upload progress; server-side processing status comes from the API. */
export function useUploader(path: string, onUploaded?: (f: StoredFile) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const update = (key: string, patch: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const add = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const key = `${file.name}-${file.size}-${Math.random()}`;
        const invalid = validateFile(file);
        setItems((list) => [...list, { key, name: file.name, size: file.size, progress: 0, error: invalid, file: null }]);
        if (invalid) continue;
        uploadFile<StoredFile>(path, file, (progress) => update(key, { progress }))
          .then((stored) => {
            update(key, { file: stored, progress: 100 });
            onUploaded?.(stored);
          })
          .catch((err) => update(key, { error: errorMessage(err) }));
      }
    },
    [path, onUploaded],
  );
  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key));
  const clear = () => setItems([]);
  return { items, add, remove, clear };
}

const STATUS: Record<FileStatus, { label: string; tone: string }> = {
  uploaded: { label: "Завантажено", tone: "text-muted" },
  parsing: { label: "Розбір тексту", tone: "text-accent" },
  indexing: { label: "Індексація", tone: "text-accent" },
  ready: { label: "Готово", tone: "text-success" },
  failed: { label: "Помилка", tone: "text-danger" },
};
const PIPELINE: FileStatus[] = ["uploaded", "parsing", "indexing", "ready"];

export function FileStatusLine({ file }: { file: StoredFile }) {
  const s = STATUS[file.status];
  const busy = file.status === "uploaded" || file.status === "parsing" || file.status === "indexing";
  return (
    <span className={cn("inline-flex items-center gap-1 text-2xs", s.tone)}>
      {busy && <Loader2 className="size-3 animate-spin" />}
      {file.status === "ready" && <CheckCircle2 className="size-3" />}
      {file.status === "failed" && <AlertCircle className="size-3" />}
      {file.status === "failed" ? file.error ?? s.label : s.label}
      {file.status === "ready" && <span className="text-subtle">· {file.chunk_count} фрагм.</span>}
    </span>
  );
}

function fileIcon(name: string) {
  return /\.(py|js|ts|tsx|jsx|java|c|cpp|cs|go|rs|sql|json|ya?ml|html|css)$/i.test(name) ? FileCode2 : FileText;
}

/** One file row: real backend pipeline state, with a 4-step mini progress. */
export function FilePreview({ file, onDelete, action }: { file: StoredFile; onDelete?: () => void; action?: ReactNode }) {
  const Icon = fileIcon(file.original_name);
  const stage = file.status === "failed" ? -1 : PIPELINE.indexOf(file.status);
  return (
    <div className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-hover/60">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-subtle">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{file.original_name}</span>
          <span className="shrink-0 text-2xs text-subtle">{formatBytes(file.size)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <FileStatusLine file={file} />
          {stage >= 0 && stage < 3 && (
            <span className="flex gap-0.5" aria-hidden>
              {PIPELINE.slice(0, 3).map((p, i) => (
                <span key={p} className={cn("h-1 w-3 rounded-full", i <= stage ? "bg-accent" : "bg-line")} />
              ))}
            </span>
          )}
        </div>
      </div>
      {action}
      {onDelete && (
        <IconButton label="Видалити файл" size="sm" onClick={onDelete} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
          <Trash2 />
        </IconButton>
      )}
    </div>
  );
}

/** Drop zone + list of in-flight uploads (progress / validation errors). */
export function FileUploader({ uploader, compact }: { uploader: ReturnType<typeof useUploader>; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) uploader.add(e.dataTransfer.files);
  };
  const inFlight = uploader.items.filter((i) => !i.file || i.error);
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-dashed border-line-hover px-4 text-left transition-[background-color,border-color] duration-150 hover:bg-hover/50",
          compact ? "py-2.5" : "py-4",
          over && "border-accent bg-accent-soft",
        )}
      >
        <UploadCloud className={cn("size-4 shrink-0", over ? "text-accent" : "text-subtle")} />
        <span className="text-sm">
          <span className="font-medium">Перетягніть файли</span> <span className="text-muted">або натисніть, щоб обрати</span>
          <span className="block text-2xs text-subtle">PDF, DOCX, TXT, MD, код · до {MAX_MB} МБ</span>
        </span>
      </button>
      <input ref={inputRef} type="file" multiple hidden accept={ACCEPT.join(",")} onChange={(e) => e.target.files && (uploader.add(e.target.files), (e.target.value = ""))} />
      <AnimatePresence initial={false}>
        {inFlight.map((item) => (
          <motion.div key={item.key} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={t(dur.dropdown)} className="overflow-hidden">
            <div className="mt-2 flex items-center gap-3 rounded-md px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{item.name}</span>
                  <span className={cn("shrink-0 text-2xs", item.error ? "text-danger" : "text-subtle")}>{item.error ?? `${item.progress}%`}</span>
                </div>
                {!item.error && <Progress value={item.progress} className="mt-1.5" label={`Завантаження ${item.name}`} />}
              </div>
              {item.error && (
                <IconButton label="Прибрати" size="sm" onClick={() => uploader.remove(item.key)}>
                  <X />
                </IconButton>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Polls a single file until the backend finishes processing it. */
export function useFileStatus(file: StoredFile | null) {
  return useQuery({
    queryKey: ["file", file?.id],
    queryFn: () => api.get<StoredFile>(`/files/${file!.id}`),
    enabled: !!file,
    initialData: file ?? undefined,
    refetchInterval: (q) => (q.state.data && ["uploaded", "parsing", "indexing"].includes(q.state.data.status) ? 1000 : false),
  });
}

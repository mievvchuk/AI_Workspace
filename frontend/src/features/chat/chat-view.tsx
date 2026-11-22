import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowDown, Ban, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { qk, queryClient, useMessages, useModels, useSession, useUsage } from "@/lib/queries";
import type { ChatSession, Effort, Message, ModelInfo } from "@/lib/types";
import { dur, t } from "@/lib/motion";
import { formatTokens } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorState, Notice, Skeleton } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";
import { toast } from "@/components/ui/toast";
import { AIProcessingPanel, PersistedProcess } from "@/components/ai/process-panel";
import { Composer } from "./composer";
import { startStream, stopStream, useStreams, type LiveStream } from "./stream-store";

const Markdown = lazy(() => import("@/components/ai/markdown"));

function RichText({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="prose-ai whitespace-pre-wrap">{text}</div>}>
      <Markdown text={text} />
    </Suspense>
  );
}

function UserMessage({ message, editable, onEdit }: { message: Message; editable: boolean; onEdit: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[85%] space-y-2">
        <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-24 text-read" aria-label="Редагування повідомлення" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Скасувати</Button>
          <Button size="sm" variant="primary" disabled={!draft.trim() || draft.trim() === message.content} onClick={() => { setEditing(false); onEdit(draft.trim()); }}>
            Надіслати знову
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-hover px-3.5 py-2 text-read leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</div>
      <div className="mt-1 flex h-6 gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <CopyButton text={message.content} />
        {editable && (
          <button type="button" onClick={() => { setDraft(message.content); setEditing(true); }} className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-subtle hover:bg-hover hover:text-fg">
            <Pencil className="size-3.5" />
            <span className="hidden sm:inline">Редагувати</span>
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message, isLast, busy, onRegenerate, models }: { message: Message; isLast: boolean; busy: boolean; onRegenerate: () => void; models: ModelInfo[] }) {
  const modelLabel = models.find((m) => m.id === message.model)?.label ?? message.model;
  return (
    <div className="group space-y-2">
      {message.request_id && <PersistedProcess requestId={message.request_id} className="-ml-1.5" />}
      {message.content && <RichText text={message.content} />}
      {message.status === "error" && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-fg">{message.error ?? "Не вдалося отримати відповідь"}</p>
            {message.content && <p className="text-xs text-muted">Отриману частину відповіді збережено.</p>}
          </div>
          {isLast && <Button size="sm" variant="outline" onClick={onRegenerate} disabled={busy} icon={<RefreshCw className="size-3.5" />}>Повторити</Button>}
        </div>
      )}
      {message.status === "cancelled" && (
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          <Ban className="size-3" /> Генерацію зупинено
        </p>
      )}
      <div className="flex h-6 items-center gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        {message.content && <CopyButton text={message.content} />}
        {isLast && message.status !== "error" && (
          <button type="button" disabled={busy} onClick={onRegenerate} className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-subtle hover:bg-hover hover:text-fg disabled:opacity-40">
            <RefreshCw className="size-3.5" />
            <span className="hidden sm:inline">Згенерувати знову</span>
          </button>
        )}
        <span className="ml-auto truncate pl-2 text-2xs text-subtle">
          {modelLabel}
          {message.effort && message.effort !== "medium" ? ` · ${message.effort}` : ""}
          {message.completion_tokens ? ` · ${formatTokens(message.prompt_tokens + message.completion_tokens)} ток.` : ""}
        </span>
      </div>
    </div>
  );
}

function LiveMessage({ live }: { live: LiveStream }) {
  return (
    <div className="space-y-3">
      <AIProcessingPanel log={live.log} live lastFrameAt={live.lastFrameAt} onStop={() => stopStream(live.sessionId)} stopping={live.stopping} />
      {live.text && (
        <div className="relative">
          <RichText text={live.text} />
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse-dot bg-accent align-middle" aria-hidden />
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = ["Поясни ключові поняття теми простими словами", "Склади план підготовки до захисту", "Перевір мій код і запропонуй покращення"];

/** Keeps the view pinned to the bottom only if the user is already there. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const at = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = at;
    setAtBottom(at);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [dep]);
  const scrollToBottom = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    atBottomRef.current = true;
  };
  return { ref, atBottom, onScroll, scrollToBottom, forceBottom: () => (atBottomRef.current = true) };
}

export function ChatView({ sessionId, contextLabel }: { sessionId: string; contextLabel?: string }) {
  const session = useSession(sessionId);
  const messages = useMessages(sessionId);
  const { data: models = [] } = useModels();
  const { data: usage } = useUsage();
  const live = useStreams((s) => s.streams[sessionId]);
  const list = messages.data ?? [];
  const busy = !!live;
  const scroll = useStickToBottom(`${list.length}:${live?.text.length ?? 0}:${live?.log.steps.length ?? 0}`);

  // Jump to the bottom when opening a session.
  useEffect(() => {
    scroll.forceBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const updateSession = useMutation({
    mutationFn: (body: Partial<Pick<ChatSession, "model" | "effort">>) => api.patch<ChatSession>(`/sessions/${sessionId}`, body),
    onSuccess: (s) => {
      queryClient.setQueryData(qk.session(sessionId), s);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error("Не вдалося змінити налаштування", errorMessage(e)),
  });

  const s = session.data;
  const model = models.find((m) => m.id === s?.model);

  const send = (text: string, fileIds: string[]) => {
    scroll.forceBottom();
    const optimistic: Message = {
      id: `optimistic-${Date.now()}`, role: "user", content: text, status: "complete", error: null, model: null, effort: null,
      request_id: null, prompt_tokens: 0, completion_tokens: 0, created_at: new Date().toISOString(),
    };
    void startStream({ sessionId, path: `/sessions/${sessionId}/messages`, body: { content: text, file_ids: fileIds }, optimistic: (m) => [...m, optimistic] });
  };
  const regenerate = () => {
    scroll.forceBottom();
    void startStream({ sessionId, path: `/sessions/${sessionId}/regenerate`, optimistic: (m) => (m.at(-1)?.role === "assistant" ? m.slice(0, -1) : m) });
  };
  const edit = (message: Message, text: string) => {
    scroll.forceBottom();
    void startStream({
      sessionId,
      path: `/messages/${message.id}/edit`,
      body: { content: text },
      optimistic: (m) => {
        const i = m.findIndex((x) => x.id === message.id);
        return i < 0 ? m : [...m.slice(0, i), { ...message, content: text }];
      },
    });
  };

  if (session.isError || messages.isError) {
    return <ErrorState message={errorMessage(session.error ?? messages.error)} onRetry={() => { session.refetch(); messages.refetch(); }} />;
  }

  const lastUserIdx = list.map((m) => m.role).lastIndexOf("user");
  const noProvider = usage && !usage.ai_configured;
  const overLimit = usage && usage.today_tokens >= usage.daily_limit;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroll.ref} onScroll={scroll.onScroll} className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]">
        <div className="mx-auto w-full max-w-[740px] px-4 pt-6 pb-40 sm:px-6">
          {messages.isLoading ? (
            <div className="space-y-6">
              <Skeleton className="ml-auto h-10 w-2/3" />
              <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-3/5" /></div>
            </div>
          ) : list.length === 0 && !live ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={t(dur.page)} className="pt-[12vh]">
              <div className="mb-4 flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-accent">
                <Sparkles className="size-4" />
              </div>
              <h2 className="text-2xl font-medium tracking-[-0.02em]">{contextLabel ? `Чим допомогти з «${contextLabel}»?` : "З чого почнемо?"}</h2>
              <p className="mt-1 text-sm text-muted">{contextLabel ? "Асистент шукатиме відповіді у матеріалах цього простору й покаже кожен крок обробки." : "Поставте запитання або прикріпіть файл."}</p>
              <div className="mt-6 flex flex-col gap-1.5">
                {SUGGESTIONS.map((q) => (
                  <button key={q} type="button" disabled={busy || !!noProvider} onClick={() => send(q, [])} className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-muted transition-[border-color,color] duration-150 hover:border-line-hover hover:text-fg disabled:opacity-50">
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-6">
              <AnimatePresence initial={false}>
                {list.map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={t(dur.dropdown)}>
                    {m.role === "user" ? (
                      <UserMessage message={m} editable={!busy && !m.id.startsWith("optimistic-") && i === lastUserIdx} onEdit={(text) => edit(m, text)} />
                    ) : (
                      <AssistantMessage message={m} isLast={i === list.length - 1 && !live} busy={busy} onRegenerate={regenerate} models={models} />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {live && <LiveMessage live={live} />}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!scroll.atBottom && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={t(dur.dropdown)}
            onClick={scroll.scrollToBottom}
            className="absolute bottom-36 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-elevated px-3 text-xs text-muted shadow-[var(--shadow-float)] hover:text-fg"
          >
            <ArrowDown className="size-3.5" />
            {busy ? "Нова відповідь" : "До останнього"}
          </motion.button>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg from-75% to-transparent pt-10">
        <div className="pointer-events-auto mx-auto w-full max-w-[740px] px-3 pb-3 safe-bottom sm:px-6 sm:pb-5">
          {noProvider && <div className="mb-2"><Notice>AI-провайдер не налаштовано на сервері. Додайте NVIDIA_API_KEY у backend/.env.</Notice></div>}
          {!noProvider && overLimit && <div className="mb-2"><Notice tone="danger">Ви вичерпали власний денний ліміт токенів.</Notice></div>}
          {usage?.provider === "mock" && <p className="mb-1.5 text-center text-2xs text-warning">Тестовий режим: відповіді генерує mock-провайдер, а не справжня модель</p>}
          <Composer
            draftKey={`session:${sessionId}`}
            contextLabel={contextLabel}
            model={model}
            modelId={s?.model ?? ""}
            effort={(s?.effort ?? "medium") as Effort}
            onModel={(m) => updateSession.mutate({ model: m.id, effort: m.efforts.includes(s?.effort as Effort) ? s?.effort : (m.efforts.includes("medium") ? "medium" : m.efforts[0]) })}
            onEffort={(effort) => updateSession.mutate({ effort })}
            streaming={busy}
            stopping={live?.stopping}
            disabled={!s || !!noProvider}
            onSend={send}
            onStop={() => stopStream(sessionId)}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

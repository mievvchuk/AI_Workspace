/**
 * Live generation state, kept outside React components so a generation survives switching
 * sessions/pages. Text deltas are buffered and flushed once per animation frame, so long answers
 * don't re-render markdown for every chunk.
 */
import { create } from "zustand";
import { ApiError, api, errorMessage } from "@/lib/api";
import { qk, queryClient } from "@/lib/queries";
import { applyEvent, emptyLog, streamPost, type ProcessLog } from "@/lib/sse";
import type { AIEvent, Message } from "@/lib/types";
import { toast } from "@/components/ui/toast";

export interface LiveStream {
  sessionId: string;
  messageId: string | null;
  requestId: string | null;
  text: string;
  log: ProcessLog;
  lastFrameAt: number;
  startedAt: number;
  stopping: boolean;
}

interface StreamState {
  streams: Record<string, LiveStream>;
}

export const useStreams = create<StreamState>(() => ({ streams: {} }));

const controllers = new Map<string, AbortController>();

function patch(sessionId: string, update: (s: LiveStream) => Partial<LiveStream>) {
  useStreams.setState((st) => {
    const cur = st.streams[sessionId];
    if (!cur) return st;
    return { streams: { ...st.streams, [sessionId]: { ...cur, ...update(cur) } } };
  });
}

function finish(sessionId: string) {
  controllers.delete(sessionId);
  useStreams.setState((st) => {
    const { [sessionId]: _, ...rest } = st.streams;
    return { streams: rest };
  });
}

function setMessages(sessionId: string, fn: (msgs: Message[]) => Message[]) {
  queryClient.setQueryData<Message[]>(qk.messages(sessionId), (old) => fn(old ?? []));
}

export interface StartOptions {
  sessionId: string;
  path: string;
  body?: unknown;
  /** optimistic changes to the message list before the request starts */
  optimistic?: (msgs: Message[]) => Message[];
  onRequestError?: () => void;
}

export async function startStream({ sessionId, path, body, optimistic, onRequestError }: StartOptions): Promise<void> {
  if (controllers.has(sessionId)) return; // one generation per session; blocks double submit
  const controller = new AbortController();
  controllers.set(sessionId, controller);
  const snapshot = queryClient.getQueryData<Message[]>(qk.messages(sessionId));
  if (optimistic) setMessages(sessionId, optimistic);

  const now = Date.now();
  useStreams.setState((st) => ({
    streams: { ...st.streams, [sessionId]: { sessionId, messageId: null, requestId: null, text: "", log: emptyLog, lastFrameAt: now, startedAt: now, stopping: false } },
  }));

  let pending = "";
  let raf = 0;
  const flush = () => {
    raf = 0;
    if (!pending) return;
    const chunk = pending;
    pending = "";
    patch(sessionId, (s) => ({ text: s.text + chunk }));
  };

  let finalMessage: Message | null = null;
  try {
    await streamPost(
      path,
      body,
      {
        onFrame: ({ event, data }) => {
          const at = Date.now();
          if (event === "delta") {
            pending += String(data.text ?? "");
            if (!raf) raf = requestAnimationFrame(flush);
            useStreams.setState((st) => (st.streams[sessionId] ? { streams: { ...st.streams, [sessionId]: { ...st.streams[sessionId], lastFrameAt: at } } } : st));
            return;
          }
          if (event === "start") {
            patch(sessionId, () => ({ messageId: String(data.message_id), requestId: data.request_id, lastFrameAt: at }));
          } else if (event === "ai") {
            patch(sessionId, (s) => ({ log: applyEvent(s.log, data as unknown as AIEvent), lastFrameAt: at }));
          } else if (event === "message") {
            finalMessage = data.message as Message;
          } else {
            // e.g. "progress" during model reasoning: real liveness, resets the silence indicator
            patch(sessionId, () => ({ lastFrameAt: at }));
          }
        },
      },
      controller.signal,
    );
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      // request rejected before streaming (409 busy, 429, 503 no provider, network)
      if (snapshot) queryClient.setQueryData(qk.messages(sessionId), snapshot);
      toast.error("Не вдалося надіслати", errorMessage(err));
      onRequestError?.();
      if (err instanceof ApiError && err.isAuth) return finish(sessionId);
    }
  } finally {
    if (raf) cancelAnimationFrame(raf);
    flush();
  }

  const done = finalMessage as Message | null;
  // Put the saved reply in place before dropping the live state, so nothing flickers.
  if (done) setMessages(sessionId, (msgs) => [...msgs.filter((m) => m.id !== done.id), done]);
  // Re-sync with the server: real ids for the optimistic user message, token counters, titles.
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.messages(sessionId) }),
    queryClient.invalidateQueries({ queryKey: qk.session(sessionId) }),
    queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    queryClient.invalidateQueries({ queryKey: qk.usage }),
  ]);
  const reqId = useStreams.getState().streams[sessionId]?.requestId;
  if (reqId) queryClient.removeQueries({ queryKey: qk.request(reqId) });
  finish(sessionId);
}

/** Ask the server to stop (keeps the partial answer); abort the connection if it doesn't react. */
export async function stopStream(sessionId: string) {
  const s = useStreams.getState().streams[sessionId];
  if (!s || s.stopping) return;
  patch(sessionId, () => ({ stopping: true }));
  const controller = controllers.get(sessionId);
  const fallback = setTimeout(() => controller?.abort(), 4000);
  try {
    if (s.requestId) await api.post(`/requests/${s.requestId}/cancel`);
    else controller?.abort();
  } catch {
    controller?.abort();
  } finally {
    // the stream normally ends on its own after the cancel event
    setTimeout(() => clearTimeout(fallback), 4000);
  }
}

export const isStreaming = (sessionId: string) => controllers.has(sessionId);

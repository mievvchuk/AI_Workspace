import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { applyEvent, emptyLog, streamPost, type ProcessLog } from "@/lib/sse";
import type { AIEvent } from "@/lib/types";

export interface AITaskState<R> {
  log: ProcessLog;
  result: R | null;
  running: boolean;
  lastFrameAt: number;
  requestError: string | null;
  stopping: boolean;
}

/**
 * Runs a structured AI task over SSE (lab analysis, diagnostics) and exposes its real processing log.
 * The task is aborted if the component unmounts.
 */
export function useAITask<R = Record<string, unknown>>() {
  const [state, setState] = useState<AITaskState<R>>({ log: emptyLog, result: null, running: false, lastFrameAt: 0, requestError: null, stopping: false });
  const ctrl = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = useCallback(async (path: string, body?: unknown): Promise<R | null> => {
    if (busy.current) return null; // blocks double submit
    busy.current = true;
    ctrl.current = new AbortController();
    setState({ log: emptyLog, result: null, running: true, lastFrameAt: Date.now(), requestError: null, stopping: false });
    let result: R | null = null;
    try {
      await streamPost(
        path,
        body,
        {
          onFrame: ({ event, data }) => {
            if (event === "ai") setState((s) => ({ ...s, log: applyEvent(s.log, data as unknown as AIEvent), lastFrameAt: Date.now() }));
            else if (event === "result") {
              result = data as unknown as R;
              setState((s) => ({ ...s, result }));
            } else setState((s) => ({ ...s, lastFrameAt: Date.now() }));
          },
        },
        ctrl.current.signal,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setState((s) => ({ ...s, requestError: errorMessage(err) }));
    } finally {
      busy.current = false;
      setState((s) => ({ ...s, running: false, stopping: false }));
    }
    return result;
  }, []);

  const stop = useCallback(async () => {
    const id = state.log.requestId;
    setState((s) => ({ ...s, stopping: true }));
    try {
      if (id) await api.post(`/requests/${id}/cancel`);
      else ctrl.current?.abort();
    } catch {
      ctrl.current?.abort();
    }
  }, [state.log.requestId]);

  const reset = useCallback(() => setState({ log: emptyLog, result: null, running: false, lastFrameAt: 0, requestError: null, stopping: false }), []);

  return { ...state, run, stop, reset };
}

import { request } from "./api";
import type { AIEvent } from "./types";

export interface Frame {
  event: string;
  data: { request_id: string; seq: number } & Record<string, unknown>;
}

/** Parse an SSE text buffer. Returns complete frames and the unconsumed remainder. */
export function parseFrames(buffer: string): { frames: Frame[]; rest: string } {
  const frames: Frame[] = [];
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) continue;
    try {
      frames.push({ event, data: JSON.parse(data) });
    } catch {
      /* malformed frame: skip rather than break the whole stream */
    }
  }
  return { frames, rest };
}

/**
 * Guards against duplicate, late and out-of-order frames: a stream is bound to the first
 * request_id it sees and only accepts strictly increasing seq numbers.
 */
export class FrameGuard {
  requestId: string | null = null;
  private lastSeq = 0;
  accept(frame: Frame): boolean {
    const { request_id, seq } = frame.data;
    if (this.requestId === null) this.requestId = request_id;
    if (request_id !== this.requestId || typeof seq !== "number" || seq <= this.lastSeq) return false;
    this.lastSeq = seq;
    return true;
  }
}

export interface StreamHandlers {
  onFrame: (frame: Frame) => void;
}

/** POST and consume a text/event-stream response. Resolves when the stream ends. */
export async function streamPost(path: string, body: unknown, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const res = await request(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), signal });
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const guard = new FrameGuard();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const { frames, rest } = parseFrames(buffer);
    buffer = rest;
    for (const frame of frames) if (guard.accept(frame)) handlers.onFrame(frame);
  }
}

/* ---------------- processing log reducer ---------------- */

export interface Step {
  stage: string;
  status: AIEvent["status"];
  title: string;
  description: string;
  event_type: string;
  started_at: string;
  duration_ms: number | null;
  metadata: AIEvent["metadata"];
  seq: number;
}

export interface ProcessLog {
  requestId: string | null;
  steps: Step[];
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  durationMs: number | null;
  error: string | null;
  lastSeq: number;
}

export const emptyLog: ProcessLog = { requestId: null, steps: [], status: "idle", startedAt: null, durationMs: null, error: null, lastSeq: 0 };

const TERMINAL: Record<string, ProcessLog["status"]> = {
  request_completed: "completed",
  request_failed: "failed",
  request_cancelled: "cancelled",
};

/** Merge one event into the log. Events of one stage update a single step (latest seq wins). */
export function applyEvent(log: ProcessLog, ev: AIEvent): ProcessLog {
  if (log.requestId && ev.request_id !== log.requestId) return log;
  if (ev.seq <= log.lastSeq) return log;
  const next: ProcessLog = { ...log, requestId: ev.request_id, lastSeq: ev.seq, startedAt: log.startedAt ?? ev.timestamp };
  if (next.status === "idle") next.status = "running";
  const terminal = TERMINAL[ev.event_type];
  if (terminal) {
    next.status = terminal;
    next.durationMs = ev.duration_ms;
    if (terminal === "failed") next.error = ev.description || ev.title;
    // close any step left running (e.g. failure mid-stream)
    const closed: Step["status"] = terminal === "completed" ? "completed" : terminal === "failed" ? "failed" : "cancelled";
    next.steps = log.steps.map((s) => (s.status === "running" ? { ...s, status: closed } : s));
    return next;
  }
  const idx = log.steps.findIndex((s) => s.stage === ev.stage);
  const step: Step = {
    stage: ev.stage,
    status: ev.status,
    title: ev.title,
    description: ev.description,
    event_type: ev.event_type,
    started_at: idx >= 0 ? log.steps[idx].started_at : ev.timestamp,
    duration_ms: ev.duration_ms,
    metadata: { ...(idx >= 0 ? log.steps[idx].metadata : {}), ...ev.metadata },
    seq: ev.seq,
  };
  next.steps = idx >= 0 ? log.steps.map((s, i) => (i === idx ? step : s)) : [...log.steps, step];
  return next;
}

export function logFromEvents(events: AIEvent[]): ProcessLog {
  return [...events].sort((a, b) => a.seq - b.seq).reduce(applyEvent, emptyLog);
}

export function currentStep(log: ProcessLog): Step | undefined {
  return [...log.steps].reverse().find((s) => s.status === "running") ?? log.steps[log.steps.length - 1];
}

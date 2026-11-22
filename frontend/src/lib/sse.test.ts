import { describe, expect, it } from "vitest";
import { applyEvent, currentStep, emptyLog, FrameGuard, logFromEvents, parseFrames } from "./sse";
import type { AIEvent } from "./types";

const ev = (seq: number, patch: Partial<AIEvent> = {}): AIEvent => ({
  request_id: "r1",
  event_id: `e${seq}`,
  seq,
  event_type: "context_preparation",
  stage: "context",
  status: "running",
  title: "Підготовка",
  description: "",
  timestamp: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
  duration_ms: null,
  metadata: {},
  ...patch,
});

describe("parseFrames", () => {
  it("parses complete frames and keeps the partial remainder", () => {
    const buf = 'event: ai\ndata: {"request_id":"r1","seq":1}\n\nevent: delta\ndata: {"request_id":"r1","seq":2,"text":"Прив';
    const { frames, rest } = parseFrames(buf);
    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe("ai");
    expect(rest).toContain("Прив");
  });

  it("skips malformed frames", () => {
    expect(parseFrames("event: ai\ndata: {oops\n\n").frames).toHaveLength(0);
  });
});

describe("FrameGuard", () => {
  it("drops duplicates, late and foreign frames", () => {
    const g = new FrameGuard();
    const f = (request_id: string, seq: number) => ({ event: "ai", data: { request_id, seq } });
    expect(g.accept(f("r1", 1))).toBe(true);
    expect(g.accept(f("r1", 1))).toBe(false); // duplicate
    expect(g.accept(f("r1", 3))).toBe(true);
    expect(g.accept(f("r1", 2))).toBe(false); // out of order / late
    expect(g.accept(f("r2", 4))).toBe(false); // another request
  });
});

describe("applyEvent", () => {
  it("merges events of one stage into a single step", () => {
    let log = applyEvent(emptyLog, ev(1));
    log = applyEvent(log, ev(2, { status: "completed", duration_ms: 40, metadata: { subject: "Python" } }));
    expect(log.steps).toHaveLength(1);
    expect(log.steps[0]).toMatchObject({ status: "completed", duration_ms: 40, metadata: { subject: "Python" } });
    expect(log.status).toBe("running");
  });

  it("ignores stale events", () => {
    const log = applyEvent(applyEvent(emptyLog, ev(5, { status: "completed" })), ev(4));
    expect(log.steps[0].status).toBe("completed");
  });

  it("terminal failure closes running steps and records the error", () => {
    let log = applyEvent(emptyLog, ev(1, { stage: "model", event_type: "model_request_started" }));
    log = applyEvent(log, ev(2, { stage: "request", event_type: "request_failed", status: "failed", description: "NVIDIA API недоступний", duration_ms: 900 }));
    expect(log.status).toBe("failed");
    expect(log.error).toBe("NVIDIA API недоступний");
    expect(log.steps[0].status).toBe("failed");
    expect(log.durationMs).toBe(900);
  });

  it("rebuilds the same log from persisted events in any order", () => {
    const events = [ev(3, { stage: "save", event_type: "result_saving", status: "completed" }), ev(1), ev(2, { status: "completed" })];
    const log = logFromEvents(events);
    expect(log.steps.map((s) => s.stage)).toEqual(["context", "save"]);
    expect(currentStep(log)?.stage).toBe("save");
  });
});

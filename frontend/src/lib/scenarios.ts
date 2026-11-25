import { api, type ApiResult, type Job } from "./api";

export interface ScenarioRunOutcome {
  responses: Array<{ result: ApiResult<Job>; idempotencyKey?: string | null }>;
  focusJobId?: string;
  note?: string;
  deduped?: { key: string; jobId: string; identical: boolean };
}

export interface DemoScenario {
  id: string;
  title: string;
  tag: string;
  summary: string;
  headers: string;
  previewPayload: Record<string, unknown>;
  execute: () => Promise<ScenarioRunOutcome>;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "burst",
    title: "Concurrency burst",
    tag: "10x POST /jobs",
    summary: "10 parallel sleep jobs claimed via SKIP LOCKED.",
    headers: "Content-Type: application/json",
    previewPayload: {
      count: 10,
      type: "sleep",
      payload: "800..1880",
      maxAttempts: 3,
    },
    execute: async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          api.submitJob({
            type: "sleep",
            payload: String(800 + i * 120),
            priority: i % 3,
            maxAttempts: 3,
          })
        )
      );
      const focus = results.find((r) => r.data?.id)?.data?.id;
      return {
        responses: results.map((result) => ({ result })),
        focusJobId: focus,
        note: "Queued 10 concurrent sleep jobs",
      };
    },
  },
  {
    id: "retry",
    title: "Retry with backoff",
    tag: "flaky / fails 2x",
    summary: "Fails twice with backoff, succeeds on attempt 3.",
    headers: "Content-Type: application/json",
    previewPayload: {
      type: "flaky",
      payload: "2",
      priority: 5,
      maxAttempts: 4,
    },
    execute: async () => {
      const r = await api.submitJob({
        type: "flaky",
        payload: "2",
        priority: 5,
        maxAttempts: 4,
      });
      return {
        responses: [{ result: r }],
        focusJobId: r.data?.id,
        note: "Queued flaky retry job",
      };
    },
  },
  {
    id: "dlq",
    title: "Dead letter + replay",
    tag: "maxAttempts = 2",
    summary: "Exhausts attempts into DEAD for manual replay.",
    headers: "Content-Type: application/json",
    previewPayload: {
      type: "flaky",
      payload: "99",
      priority: 1,
      maxAttempts: 2,
    },
    execute: async () => {
      const r = await api.submitJob({
        type: "flaky",
        payload: "99",
        priority: 1,
        maxAttempts: 2,
      });
      return {
        responses: [{ result: r }],
        focusJobId: r.data?.id,
        note: "Queued dead-letter job",
      };
    },
  },
  {
    id: "idem",
    title: "Idempotent submit",
    tag: "same Idempotency-Key",
    summary: "Two parallel POSTs with one Idempotency-Key.",
    headers: "Content-Type: application/json\nIdempotency-Key: demo-<random>",
    previewPayload: {
      type: "echo",
      payload: "charge customer",
      maxAttempts: 3,
    },
    execute: async () => {
      const key = "demo-" + Math.random().toString(36).slice(2, 8);
      const body = {
        type: "echo",
        payload: `charge customer (${key})`,
        maxAttempts: 3,
      };
      const [a, b] = await Promise.all([
        api.submitJob(body, key),
        api.submitJob(body, key),
      ]);
      const idA = a.data?.id ?? "";
      const idB = b.data?.id ?? "";
      const identical = Boolean(idA && idA === idB);
      return {
        responses: [
          { result: a, idempotencyKey: key },
          { result: b, idempotencyKey: key },
        ],
        focusJobId: idA || undefined,
        deduped: { key, jobId: idA, identical },
        note: identical
          ? "Deduped: identical UUID returned"
          : "Idempotency mismatch",
      };
    },
  },
  {
    id: "delay",
    title: "Delayed job",
    tag: "scheduledAt +10s",
    summary: "Held in Scheduled until 10s delay elapses.",
    headers: "Content-Type: application/json",
    previewPayload: {
      type: "echo",
      payload: "send reminder",
      scheduledAt: "<now + 10s>",
      maxAttempts: 3,
    },
    execute: async () => {
      const scheduledAt = new Date(Date.now() + 10_000).toISOString();
      const r = await api.submitJob({
        type: "echo",
        payload: "send reminder",
        scheduledAt,
        maxAttempts: 3,
      });
      return {
        responses: [{ result: r }],
        focusJobId: r.data?.id,
        note: "Scheduled job +10s",
      };
    },
  },
  {
    id: "priority",
    title: "Priority ordering",
    tag: "priority 0 vs 9",
    summary: "Priority 9 jumps ahead of queued backlog.",
    headers: "Content-Type: application/json",
    previewPayload: {
      batch: "5x sleep(priority=0) + 1x echo(priority=9)",
    },
    execute: async () => {
      const lows = await Promise.all(
        Array.from({ length: 5 }, () =>
          api.submitJob({ type: "sleep", payload: "1500", priority: 0 })
        )
      );
      const urgent = await api.submitJob({
        type: "echo",
        payload: "urgent",
        priority: 9,
      });
      return {
        responses: [
          { result: urgent },
          ...lows.map((result) => ({ result })),
        ],
        focusJobId: urgent.data?.id,
        note: "Queued priority-9 ahead of backlog",
      };
    },
  },
];

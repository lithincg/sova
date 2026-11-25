export type JobStatus =
  | "PENDING"
  | "CLAIMED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "DEAD";

export type DisplayState = JobStatus | "SCHEDULED" | "RETRYING";

export interface Job {
  id: string;
  type: string;
  payload: string | null;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  priority: number;
  scheduledAt: string | null;
  nextRetryAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobAttempt {
  attemptNumber: number;
  workerId: string | null;
  outcome: "SUCCEEDED" | "FAILED" | "REAPED";
  error: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export type JobStats = Record<JobStatus, number>;

export interface HealthResponse {
  status: string;
  components?: Record<string, { status: string; details?: Record<string, unknown> }>;
}

export interface SubmitJobInput {
  type: "echo" | "sleep" | "flaky" | string;
  payload: string;
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: string | null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(path, init);
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const errObj = parsed as { detail?: string; message?: string } | string | null;
    const msg =
      typeof errObj === "string"
        ? errObj
        : errObj?.detail || errObj?.message || `HTTP ${res.status}`;
    return { ok: false, status: res.status, data: null, error: msg };
  }
  return { ok: true, status: res.status, data: parsed as T };
}

export const api = {
  listJobs: (status?: JobStatus) =>
    request<Job[]>(status ? `/jobs?status=${status}` : "/jobs"),
  getStats: () => request<JobStats>("/jobs/stats"),
  getJob: (id: string) => request<Job>(`/jobs/${id}`),
  getAttempts: (id: string) => request<JobAttempt[]>(`/jobs/${id}/attempts`),
  submitJob: (body: SubmitJobInput, idempotencyKey?: string | null) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return request<Job>("/jobs", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  },
  replayJob: (id: string) => request<Job>(`/jobs/${id}/replay`, { method: "POST" }),
  getHealth: () => request<HealthResponse>("/actuator/health"),
};

export function getDisplayState(job: Job): DisplayState {
  if (job.status === "PENDING") {
    if (job.attempts > 0 && job.nextRetryAt) return "RETRYING";
    if (job.scheduledAt && new Date(job.scheduledAt).getTime() > Date.now()) {
      return "SCHEDULED";
    }
  }
  return job.status;
}

export function shortId(id?: string | null): string {
  return id ? id.slice(0, 8) : "-";
}

export function relTime(iso?: string | null): string {
  if (!iso) return "-";
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const s = Math.abs(diffSec);
  const unit =
    s < 60
      ? `${Math.round(s)}s`
      : s < 3600
      ? `${Math.round(s / 60)}m`
      : s < 86400
      ? `${Math.round(s / 3600)}h`
      : `${Math.round(s / 86400)}d`;
  if (diffSec > 1) return `in ${unit}`;
  return s < 3 ? "just now" : `${unit} ago`;
}

export function fmtDuration(ms?: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

export function fmtTimestamp(iso?: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

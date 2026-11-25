import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import {
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCw,
  X,
} from "lucide-react";
import {
  api,
  fmtDuration,
  fmtTimestamp,
  getDisplayState,
  relTime,
  shortId,
  type Job,
  type JobAttempt,
} from "@/lib/api";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/scenarios";
import { CopyButton } from "./ui/copy-button";
import { WaterfallTrace } from "./WaterfallTrace";

interface PipelineBoardProps {
  jobs: Job[];
  query: string;
  onReplaySingle: (id: string) => void;
  replayingId: string | null;
  onReplayAllDead: (ids: string[]) => void;
  replayingAll: boolean;
  onRunScenario: (sc: DemoScenario) => void;
  onOpenEnqueue: () => void;
}

type ColumnKey = "queued" | "flight" | "done" | "dead";

const COLUMNS: Array<{
  key: ColumnKey;
  title: string;
  accent: string;
  empty: string;
}> = [
  {
    key: "queued",
    title: "Queued",
    accent: "text-[#78716C]",
    empty: "Waiting for pending or delayed jobs",
  },
  {
    key: "flight",
    title: "In Flight",
    accent: "text-[#0F766E]",
    empty: "Workers idle",
  },
  {
    key: "done",
    title: "Completed",
    accent: "text-[#166534]",
    empty: "No completed jobs yet",
  },
  {
    key: "dead",
    title: "Dead Letter",
    accent: "text-[#C2410C]",
    empty: "No exhausted jobs",
  },
];

function SegmentedAttemptBar({ job }: { job: Job }) {
  const total = Math.min(Math.max(job.maxAttempts, 1), 6);
  const failed = job.attempts;
  const succeeded = job.status === "SUCCEEDED";
  const inFlight = job.status === "RUNNING" || job.status === "CLAIMED";

  return (
    <div
      className="flex items-center gap-1"
      title={`${job.attempts} / ${job.maxAttempts} attempts`}
    >
      {Array.from({ length: total }, (_, idx) => {
        let color = "bg-[#EAE5DB]";
        if (idx < failed) color = "bg-[#C2410C]";
        else if (succeeded && idx === failed) color = "bg-[#166534]";
        else if (inFlight && idx === failed) color = "bg-[#0F766E] animate-pulse";
        return <span key={idx} className={`h-1.5 flex-1 rounded-full ${color}`} />;
      })}
    </div>
  );
}

export function PipelineBoard({
  jobs,
  query,
  onReplaySingle,
  replayingId,
  onReplayAllDead,
  replayingAll,
  onRunScenario,
  onOpenEnqueue,
}: PipelineBoardProps) {
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [drawerJob, setDrawerJob] = useState<Job | null>(null);
  const [drawerAttempts, setDrawerAttempts] = useState<JobAttempt[]>([]);
  const [clearedDoneAt, setClearedDoneAt] = useState<number | null>(null);
  const [dockOpen, setDockOpen] = useState(true);

  useEffect(() => {
    if (!drawerJobId) {
      setDrawerJob(null);
      setDrawerAttempts([]);
      return;
    }
    let cancelled = false;
    Promise.all([api.getJob(drawerJobId), api.getAttempts(drawerJobId)]).then(
      ([jRes, aRes]) => {
        if (cancelled) return;
        if (jRes.ok && jRes.data) setDrawerJob(jRes.data);
        if (aRes.ok && aRes.data) setDrawerAttempts(aRes.data);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [drawerJobId, jobs]);

  const q = query.trim().toLowerCase();
  const filtered = jobs.filter((job) => {
    if (!q) return true;
    return [job.id, job.type, job.payload, job.claimedBy].some((v) =>
      (v || "").toLowerCase().includes(q)
    );
  });

  const grouped: Record<ColumnKey, Job[]> = {
    queued: [],
    flight: [],
    done: [],
    dead: [],
  };

  filtered.forEach((job) => {
    if (job.status === "CLAIMED" || job.status === "RUNNING") {
      grouped.flight.push(job);
    } else if (job.status === "SUCCEEDED") {
      grouped.done.push(job);
    } else if (job.status === "DEAD") {
      grouped.dead.push(job);
    } else {
      grouped.queued.push(job);
    }
  });

  const hiddenDoneCount =
    clearedDoneAt === null
      ? 0
      : grouped.done.filter(
          (j) => new Date(j.updatedAt).getTime() <= clearedDoneAt
        ).length;

  if (clearedDoneAt !== null) {
    grouped.done = grouped.done.filter(
      (j) => new Date(j.updatedAt).getTime() > clearedDoneAt
    );
  }

  const dockScenarios = DEMO_SCENARIOS.filter((s) =>
    ["burst", "retry", "dlq", "idem"].includes(s.id)
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#F2EFE9] pb-24 text-[#1C1917]">
      {/* 4 Live Horizontal Swimlane Columns */}
      <main className="mx-auto grid max-w-[1380px] grid-cols-4 gap-4 px-6 pt-6 max-xl:grid-cols-2 max-sm:grid-cols-1">
        {COLUMNS.map((col) => {
          const items = grouped[col.key];
          return (
            <section
              key={col.key}
              className="flex min-h-[calc(100vh-170px)] flex-col rounded-2xl bg-[#EAE5DB]/85 p-3 ring-1 ring-[#DDD6C8]"
            >
              <div className="flex items-center justify-between gap-2 px-1.5 pb-3">
                <h2
                  className={`font-fraunces text-[18px] font-medium tracking-[-0.01em] ${col.accent}`}
                >
                  {col.title}
                </h2>
                <div className="flex items-center gap-1.5">
                  {col.key === "done" && hiddenDoneCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setClearedDoneAt(null)}
                      className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[#57534E] transition-colors hover:bg-[#DED8CC]/70 hover:text-[#1C1917] cursor-pointer"
                    >
                      Show {hiddenDoneCount}
                    </button>
                  )}
                  {col.key === "done" && items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setClearedDoneAt(Date.now())}
                      className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[#78716C] transition-colors hover:bg-[#DED8CC]/70 hover:text-[#1C1917] cursor-pointer"
                    >
                      Clear done
                    </button>
                  )}
                  {col.key === "dead" && items.length > 0 && (
                    <button
                      type="button"
                      disabled={replayingAll}
                      onClick={() => onReplayAllDead(items.map((j) => j.id))}
                      className="pressable inline-flex items-center gap-1 rounded-md bg-[#C2410C]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#C2410C] transition-colors hover:bg-[#C2410C] hover:text-white cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-2.5 w-2.5 ${
                          replayingAll ? "animate-spin" : ""
                        }`}
                      />
                      Replay all
                    </button>
                  )}
                  <span className="rounded-full bg-[#F7F4EE] px-2 py-0.5 font-mono text-[11px] font-medium text-[#57534E]">
                    {items.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-2.5">
                {items.length > 0 ? (
                  items.slice(0, 40).map((job) => {
                    const ds = getDisplayState(job);
                    const isFlight = col.key === "flight";
                    const isDead = col.key === "dead";
                    const isRetrying = ds === "RETRYING";
                    const isScheduled = ds === "SCHEDULED";

                    return (
                      <article
                        key={job.id}
                        onClick={() => setDrawerJobId(job.id)}
                        className={`pressable group relative cursor-pointer overflow-hidden rounded-xl p-3.5 shadow-[0_1px_3px_rgba(60,48,30,0.08)] ring-1 transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-6px_rgba(60,48,30,0.14)] ${
                          isDead
                            ? "bg-[#FFF9F7] ring-[#F4C7B8]"
                            : "bg-white ring-[#E6E0D4]"
                        }`}
                      >
                        {isFlight && (
                          <div className="pipeline-flight-bar absolute inset-x-0 top-0 h-[3px]" />
                        )}

                        {/* Card Title: Handler + Payload */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-semibold text-[#1C1917]">
                              {job.type}
                              {job.payload ? (
                                <span className="font-normal text-[#57534E]">
                                  {" "}
                                  · {job.payload}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[10.5px] text-[#78716C]">
                            {shortId(job.id)}
                          </span>
                        </div>

                        {/* Horizontal Segmented Attempt Progress */}
                        <div className="mt-3">
                          <SegmentedAttemptBar job={job} />
                        </div>

                        {/* Card Footer */}
                        <div className="mt-2.5 flex items-center justify-between gap-2 text-[11.5px]">
                          <div className="flex items-center gap-1.5">
                            {isRetrying && (
                              <span className="inline-flex items-center gap-1 font-mono text-[#C2410C]">
                                <RotateCw className="h-3 w-3 animate-spin [animation-duration:1600ms]" />
                                retry {relTime(job.nextRetryAt)}
                              </span>
                            )}
                            {isScheduled && (
                              <span className="inline-flex items-center gap-1 font-mono text-[#78716C]">
                                <Clock className="h-3 w-3" />
                                {relTime(job.scheduledAt)}
                              </span>
                            )}
                            {!isRetrying && !isScheduled && (
                              <span className="font-mono text-[#78716C]">
                                {job.claimedBy ||
                                  (job.priority !== 0
                                    ? `p${job.priority}`
                                    : relTime(job.updatedAt))}
                              </span>
                            )}
                          </div>

                          {isDead ? (
                            <button
                              type="button"
                              disabled={replayingId === job.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onReplaySingle(job.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-[#C2410C] px-2 py-0.5 font-mono text-[10.5px] font-medium text-white hover:bg-[#9A3412] active:scale-[0.97] cursor-pointer"
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                              {replayingId === job.id ? "Replaying" : "Replay"}
                            </button>
                          ) : (
                            <span className="font-mono text-[10.5px] text-[#A8A29E]">
                              {job.attempts}/{job.maxAttempts}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#D6CFC2] px-4 text-center text-[12px] text-[#78716C]">
                    <span>
                      {col.key === "done" && hiddenDoneCount > 0
                        ? `${hiddenDoneCount} completed hidden`
                        : col.empty}
                    </span>
                    {col.key === "done" && hiddenDoneCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setClearedDoneAt(null)}
                        className="font-mono text-[11px] font-medium text-[#166534] underline underline-offset-4 cursor-pointer"
                      >
                        Show all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </main>

      {/* Collapsible Floating Bottom Demo Dock */}
      {dockOpen ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-[#1C1917]/95 px-2.5 py-1.5 text-[#FAF8F4] shadow-[0_14px_38px_-10px_rgba(28,25,23,0.45)] backdrop-blur-md">
          <span className="hidden rounded-md bg-white/10 px-2 py-1 font-mono text-[10.5px] tracking-[0.02em] text-[#D6D3D1] sm:inline-flex">
            Live demo
          </span>
          {dockScenarios.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => onRunScenario(sc)}
              className="pressable rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#E7E5E4] transition-colors hover:bg-white/10 hover:text-white cursor-pointer whitespace-nowrap"
            >
              {sc.title === "Concurrency burst"
                ? "Burst 10"
                : sc.title === "Retry with backoff"
                ? "Flaky retry"
                : sc.title === "Dead letter + replay"
                ? "Dead letter"
                : "Idempotency"}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <button
            type="button"
            onClick={onOpenEnqueue}
            className="pressable inline-flex items-center gap-1 rounded-xl bg-[#166534] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#15803D] cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Enqueue
          </button>
          <button
            type="button"
            onClick={() => setDockOpen(false)}
            aria-label="Hide demo dock"
            title="Hide demo dock"
            className="ml-0.5 rounded-lg p-1.5 text-[#A8A29E] transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDockOpen(true)}
          className="pressable fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1C1917]/95 px-3.5 py-1.5 font-mono text-[11px] font-medium text-[#FAF8F4] shadow-[0_10px_28px_-8px_rgba(28,25,23,0.45)] backdrop-blur-md transition-colors hover:bg-[#292524] cursor-pointer"
        >
          Live demo
        </button>
      )}

      {/* Right Vaul Sheet Inspector when a card is clicked */}
      <Drawer.Root
        open={drawerJobId !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerJobId(null);
        }}
        direction="right"
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-[#1C1917]/25 backdrop-blur-[1px]" />
          <Drawer.Content className="fixed right-2 top-2 bottom-2 z-50 flex w-full max-w-[620px] flex-col overflow-hidden rounded-2xl bg-[#FAF8F4] text-[#1C1917] shadow-[0_24px_60px_-16px_rgba(28,25,23,0.3)] ring-1 ring-[#DED8CC] outline-none max-sm:right-0 max-sm:top-0 max-sm:bottom-0 max-sm:rounded-none">
            {drawerJob ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[#E6E0D4] bg-white px-6 py-4">
                  <div className="min-w-0">
                    <Drawer.Title className="font-fraunces text-[24px] leading-tight font-medium text-[#1C1917]">
                      {drawerJob.type}{" "}
                      <span className="font-mono text-[13px] font-normal text-[#78716C]">
                        ({getDisplayState(drawerJob).toLowerCase()})
                      </span>
                    </Drawer.Title>
                    <Drawer.Description className="mt-1 flex items-center gap-2 font-mono text-[11.5px] text-[#78716C]">
                      <span className="truncate">{drawerJob.id}</span>
                      <CopyButton
                        value={drawerJob.id}
                        label="Copy"
                        toastMessage="Copied UUID"
                        size="sm"
                        variant="ghost"
                      />
                    </Drawer.Description>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <CopyButton
                      value={`curl -s ${window.location.origin}/jobs/${drawerJob.id}`}
                      label="cURL"
                      toastMessage="Copied cURL command"
                      variant="outline"
                      size="sm"
                    />
                    <a
                      href={`#/jobs/${drawerJob.id}`}
                      onClick={() => setDrawerJobId(null)}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#DED8CC] bg-white px-2.5 text-[12px] font-medium text-[#1C1917] transition-colors hover:bg-[#FAF8F4]"
                    >
                      <span>Full trace</span>
                      <ExternalLink className="h-3 w-3 text-[#78716C]" />
                    </a>
                    {drawerJob.status === "DEAD" && (
                      <button
                        type="button"
                        disabled={replayingId === drawerJob.id}
                        onClick={() => onReplaySingle(drawerJob.id)}
                        className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#C2410C] px-3 text-[12px] font-medium text-white hover:bg-[#9A3412] cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${
                            replayingId === drawerJob.id ? "animate-spin" : ""
                          }`}
                        />
                        Replay
                      </button>
                    )}
                    <Drawer.Close asChild>
                      <button
                        type="button"
                        aria-label="Close inspector"
                        className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#F2EFE9] hover:text-[#1C1917] cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Drawer.Close>
                  </div>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                  <WaterfallTrace job={drawerJob} attempts={drawerAttempts} />

                  <div className="grid grid-cols-3 gap-3 rounded-xl bg-white p-4 ring-1 ring-[#E6E0D4]">
                    {[
                      ["Attempts", `${drawerJob.attempts} / ${drawerJob.maxAttempts}`],
                      ["Priority", String(drawerJob.priority)],
                      ["Created", relTime(drawerJob.createdAt)],
                      ["Worker", drawerJob.claimedBy || "-"],
                      ["Idempotency", drawerJob.idempotencyKey || "-"],
                      ["Updated", fmtTimestamp(drawerJob.updatedAt)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div className="text-[11px] text-[#78716C]">{k}</div>
                        <div className="mt-0.5 truncate font-mono text-[12px] text-[#1C1917]">
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#E6E0D4]">
                    <div className="border-b border-[#E6E0D4] px-4 py-2.5 font-fraunces text-[15px] font-medium">
                      Attempts ({drawerAttempts.length})
                    </div>
                    <div className="divide-y divide-[#EFECE4]">
                      {drawerAttempts.length > 0 ? (
                        [...drawerAttempts].reverse().map((att) => (
                          <div key={att.attemptNumber} className="p-4">
                            <div className="flex items-center justify-between font-mono text-[12px]">
                              <span
                                className={
                                  att.outcome === "SUCCEEDED"
                                    ? "font-semibold text-[#166534]"
                                    : "font-semibold text-[#C2410C]"
                                }
                              >
                                Attempt #{att.attemptNumber} ·{" "}
                                {att.outcome.toLowerCase()}
                              </span>
                              <span className="text-[#78716C]">
                                {att.workerId || "-"} ·{" "}
                                {fmtDuration(att.durationMs)}
                              </span>
                            </div>
                            {att.error && (
                              <div className="mt-2 rounded-lg bg-[#FFF8F5] px-3 py-2 font-mono text-[11.5px] text-[#C2410C] ring-1 ring-[#F4C7B8]">
                                {att.error}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-[12.5px] text-[#78716C]">
                          No attempts recorded yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#E6E0D4]">
                    <div className="flex items-center justify-between border-b border-[#E6E0D4] px-4 py-2.5 text-[12.5px] font-medium">
                      <span>Raw JSON</span>
                      <CopyButton
                        value={JSON.stringify(drawerJob, null, 2)}
                        toastMessage="Copied JSON"
                      />
                    </div>
                    <pre className="overflow-x-auto bg-[#FAF8F4] p-4 font-mono text-[11.5px] leading-5 whitespace-pre-wrap break-words">
                      {JSON.stringify(drawerJob, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-[13px] text-[#78716C]">Loading...</div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

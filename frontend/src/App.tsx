import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Toaster, toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Pause,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  api,
  fmtDuration,
  fmtTimestamp,
  getDisplayState,
  relTime,
  shortId,
  type HealthResponse,
  type Job,
  type JobAttempt,
} from "@/lib/api";
import {
  DEMO_SCENARIOS,
  type DemoScenario,
  type ScenarioRunOutcome,
} from "@/lib/scenarios";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommandMenu } from "@/components/CommandMenu";
import { EnqueueDrawer } from "@/components/EnqueueDrawer";
import { WaterfallTrace } from "@/components/WaterfallTrace";
import { StatusIconLabel } from "@/components/StatusLabel";
import { PipelineBoard } from "@/components/PipelineBoard";

type Route =
  | { view: "jobs" }
  | { view: "job"; id: string }
  | { view: "playground" }
  | { view: "api" };

const POLL_OPTIONS = [
  { ms: 0, label: "Pause" },
  { ms: 1000, label: "1s" },
  { ms: 2000, label: "2s" },
  { ms: 5000, label: "5s" },
  { ms: 10000, label: "10s" },
];

const REST_ENDPOINTS = [
  ["POST", "/jobs", "Submit job (echo | sleep | flaky), supports Idempotency-Key"],
  ["GET", "/jobs", "List recent 200 jobs (?status= optional)"],
  ["GET", "/jobs/stats", "Counts grouped by status"],
  ["GET", "/jobs/{id}", "Get single job"],
  ["GET", "/jobs/{id}/attempts", "Execution attempt history"],
  ["POST", "/jobs/{id}/replay", "Reset DEAD job to PENDING"],
  ["GET", "/actuator/prometheus", "Micrometer metrics"],
] as const;

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const [seg, id] = clean.split("/");
  if (seg === "jobs" && id) return { view: "job", id };
  if (seg === "playground") return { view: "playground" };
  if (seg === "api") return { view: "api" };
  return { view: "jobs" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash)
  );
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState("");
  const [pollMs, setPollMs] = useState(2000);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayingAll, setReplayingAll] = useState(false);

  const [, setClockTick] = useState(0);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [enqueueOpen, setEnqueueOpen] = useState(false);

  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const [detailAttempts, setDetailAttempts] = useState<JobAttempt[]>([]);
  const [detailMissing, setDetailMissing] = useState(false);

  const [selectedScenarioId, setSelectedScenarioId] = useState(
    DEMO_SCENARIOS[0].id
  );
  const [runningScenario, setRunningScenario] = useState(false);
  const [streamItems, setStreamItems] = useState<
    Array<{
      status: number;
      ok: boolean;
      id?: string;
      jobStatus?: string;
      key?: string | null;
      error?: string;
    }>
  >([]);
  const [dedupeBanner, setDedupeBanner] = useState<
    ScenarioRunOutcome["deduped"] | null
  >(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  const inspectJob = useCallback(
    (id: string) => {
      navigate(`#/jobs/${id}`);
    },
    [navigate]
  );

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setClockTick((n) => (n + 1) % 60_000);
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  const refreshQueue = useCallback(async () => {
    const jRes = await api.listJobs();
    if (jRes.ok && jRes.data) setJobs(jRes.data);
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    const [jRes, aRes] = await Promise.all([
      api.getJob(id),
      api.getAttempts(id),
    ]);
    if (!jRes.ok || !jRes.data) {
      setDetailMissing(true);
      setDetailJob(null);
      return;
    }
    setDetailMissing(false);
    setDetailJob(jRes.data);
    if (aRes.ok && aRes.data) setDetailAttempts(aRes.data);
  }, []);

  const refreshHealth = useCallback(async () => {
    const h = await api.getHealth();
    if (h.data) setHealth(h.data);
  }, []);

  useEffect(() => {
    if (route.view === "job") {
      setDetailMissing(false);
      refreshDetail(route.id);
    } else if (route.view === "api") {
      refreshHealth();
    }
  }, [route, refreshDetail, refreshHealth]);

  const isPollingPaused = pollMs === 0;
  useEffect(() => {
    refreshQueue();
    if (isPollingPaused) return;
    const handle = window.setInterval(() => {
      refreshQueue();
      if (route.view === "job") {
        refreshDetail(route.id);
      }
    }, pollMs);
    return () => window.clearInterval(handle);
  }, [isPollingPaused, pollMs, route, refreshQueue, refreshDetail]);

  const replaySingle = async (id: string) => {
    setReplayingId(id);
    try {
      const r = await api.replayJob(id);
      if (!r.ok) {
        toast.error(r.error || "Replay failed");
        return;
      }
      toast.success(`Replayed ${shortId(id)}`);
      await Promise.all([
        refreshQueue(),
        route.view === "job" ? refreshDetail(id) : Promise.resolve(),
      ]);
    } finally {
      setReplayingId(null);
    }
  };

  const replayAllDead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setReplayingAll(true);
    try {
      const results = await Promise.all(ids.map((id) => api.replayJob(id)));
      const okCount = results.filter((r) => r.ok).length;
      toast.success(`Replayed ${okCount} of ${ids.length} dead jobs`);
      await refreshQueue();
    } finally {
      setReplayingAll(false);
    }
  };

  const runScenario = async (scenario: DemoScenario) => {
    setSelectedScenarioId(scenario.id);
    setRunningScenario(true);
    if (scenario.id !== "idem") setDedupeBanner(null);

    try {
      const outcome = await scenario.execute();
      const newLines = outcome.responses.map(({ result, idempotencyKey }) => ({
        status: result.status,
        ok: result.ok,
        id: result.data?.id,
        jobStatus: result.data?.status,
        key: idempotencyKey,
        error: result.error,
      }));
      setStreamItems((prev) => [...newLines, ...prev].slice(0, 14));
      if (outcome.deduped) setDedupeBanner(outcome.deduped);

      await refreshQueue();

      if (outcome.focusJobId) {
        const focus = outcome.focusJobId;
        toast.success(outcome.note || `${scenario.title} dispatched`, {
          action: {
            label: "Inspect",
            onClick: () => inspectJob(focus),
          },
        });
      }
    } finally {
      setRunningScenario(false);
    }
  };

  const activeScenario =
    DEMO_SCENARIOS.find((s) => s.id === selectedScenarioId) || DEMO_SCENARIOS[0];
  const currentNav = route.view === "job" ? "jobs" : route.view;

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={300}>
      <div className="min-h-screen bg-[#F2EFE9] text-[#1C1917]">
        <Toaster position="bottom-right" richColors closeButton />

        <CommandMenu
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          jobs={jobs}
          onNavigate={(hash) => {
            if (hash.startsWith("#/jobs/")) {
              inspectJob(hash.replace("#/jobs/", ""));
            } else {
              navigate(hash);
            }
          }}
          onFilterStatus={() => navigate("#/jobs")}
          onOpenEnqueue={() => setEnqueueOpen(true)}
          onRunScenario={(sc) => {
            navigate("#/playground");
            runScenario(sc);
          }}
        />

        <EnqueueDrawer
          open={enqueueOpen}
          onOpenChange={setEnqueueOpen}
          onSubmitted={() => {
            refreshQueue();
          }}
        />

        {/* Persistent Warm Linen Pipeline Header */}
        <header className="sticky top-0 z-30 border-b border-[#DED8CC] bg-[#F2EFE9]/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1380px] items-center justify-between gap-4 px-6">
            <div className="flex items-center gap-6">
              <a
                href="#/jobs"
                className="flex items-center gap-2.5 font-fraunces text-[23px] font-medium tracking-[-0.02em] text-[#1C1917]"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4.5 12H11L15 7H19.5"
                    stroke="#1C1917"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M11 12L15 17H19.5"
                    stroke="#0F766E"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="4.5" cy="12" r="2.2" fill="#1C1917" />
                  <circle cx="19.5" cy="7" r="2.1" fill="#1C1917" />
                  <circle cx="19.5" cy="17" r="2.1" fill="#0F766E" />
                </svg>
                <span>Sova</span>
              </a>

              <nav aria-label="Primary" className="flex items-center gap-1">
                {[
                  { key: "jobs", label: "Runs", href: "#/jobs" },
                  {
                    key: "playground",
                    label: "Playground",
                    href: "#/playground",
                  },
                  { key: "api", label: "API", href: "#/api" },
                ].map((item) => {
                  const active = item.key === currentNav;
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      className={`relative rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        active
                          ? "text-[#1C1917]"
                          : "text-[#57534E] hover:text-[#1C1917]"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-pill"
                          transition={{
                            type: "spring",
                            duration: 0.3,
                            bounce: 0.1,
                          }}
                          className="absolute inset-0 rounded-lg bg-[#1C1917]/[0.07]"
                        />
                      )}
                      <span className="relative z-10">{item.label}</span>
                    </a>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-2.5">
              {route.view === "jobs" && (
                <div className="hidden h-8 w-[220px] items-center gap-2 rounded-lg border border-[#DED8CC] bg-white px-3 focus-within:border-[#0F766E] sm:flex">
                  <Search className="h-3.5 w-3.5 text-[#78716C]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter queue..."
                    className="w-full bg-transparent text-[12.5px] text-[#1C1917] outline-none placeholder:text-[#A8A29E]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                className="pressable hidden h-8 items-center gap-2 rounded-lg border border-[#DED8CC] bg-white px-2.5 text-[12.5px] text-[#57534E] transition-colors hover:border-[#C7BFB1] hover:text-[#1C1917] md:inline-flex cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
                <kbd className="rounded bg-[#F2EFE9] px-1.5 py-0.5 font-mono text-[10px] text-[#78716C]">
                  Ctrl K
                </kbd>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {isPollingPaused ? (
                      <Pause className="h-3 w-3 text-[#C2410C]" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#166534]" />
                    )}
                    <span className="tabular-nums">
                      {pollMs === 0 ? "Paused" : `Live · ${pollMs / 1000}s`}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Polling</DropdownMenuLabel>
                  {POLL_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.ms}
                      onClick={() => setPollMs(opt.ms)}
                    >
                      <span>{opt.label}</span>
                      {pollMs === opt.ms && (
                        <Check className="h-3.5 w-3.5 text-[#166534]" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="default" onClick={() => setEnqueueOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                <span>Enqueue</span>
                <kbd className="hidden rounded bg-white/15 px-1 font-mono text-[10px] text-white/85 sm:inline">
                  N
                </kbd>
              </Button>
            </div>
          </div>
        </header>

        {/* VIEW 1: PIPELINE SWIMLANE BOARD (#/jobs) */}
        {route.view === "jobs" && (
          <PipelineBoard
            jobs={jobs}
            query={query}
            onReplaySingle={replaySingle}
            replayingId={replayingId}
            onReplayAllDead={replayAllDead}
            replayingAll={replayingAll}
            onRunScenario={runScenario}
            onOpenEnqueue={() => setEnqueueOpen(true)}
          />
        )}

        {/* VIEW 2: DIRECT JOB DETAIL (#/jobs/:id) */}
        {route.view === "job" && (
          <main className="mx-auto max-w-[1260px] space-y-6 px-6 py-8">
            <div className="flex items-center justify-between">
              <a
                href="#/jobs"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#57534E] transition-colors hover:text-[#1C1917]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Runs
              </a>

              {detailJob && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={detailJob.status === "DEAD" ? "danger" : "outline"}
                    disabled={
                      detailJob.status !== "DEAD" ||
                      replayingId === detailJob.id
                    }
                    onClick={() => replaySingle(detailJob.id)}
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${
                        replayingId === detailJob.id ? "animate-spin" : ""
                      }`}
                    />
                    Replay
                  </Button>
                  <CopyButton
                    value={`curl -s ${window.location.origin}/jobs/${detailJob.id}`}
                    label="Copy cURL"
                    toastMessage="Copied cURL command"
                    variant="outline"
                    size="sm"
                  />
                </div>
              )}
            </div>

            {detailMissing ? (
              <div className="rounded-xl border border-[#DED8CC] bg-white px-8 py-16 text-center">
                <h2 className="font-fraunces text-[22px] font-medium tracking-[-0.02em] text-[#1C1917]">
                  Job not found
                </h2>
                <p className="mt-1 mb-5 font-mono text-[12px] text-[#78716C]">
                  {route.id}
                </p>
                <Button variant="outline" onClick={() => navigate("#/jobs")}>
                  Back to runs
                </Button>
              </div>
            ) : !detailJob ? (
              <div className="rounded-xl border border-[#DED8CC] bg-white p-8 text-[13px] text-[#78716C]">
                Loading...
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="font-fraunces text-[28px] font-medium tracking-[-0.02em] text-[#1C1917]">
                      {detailJob.type}
                    </h1>
                    <StatusIconLabel
                      status={getDisplayState(detailJob)}
                      job={detailJob}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[12px] text-[#78716C]">
                    <span>{detailJob.id}</span>
                    <CopyButton
                      value={detailJob.id}
                      label="Copy"
                      toastMessage="Copied job UUID"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                    />
                  </div>
                </div>

                <WaterfallTrace job={detailJob} attempts={detailAttempts} />

                <div className="grid grid-cols-[55fr_45fr] items-start gap-6 max-lg:grid-cols-1">
                  <div className="space-y-6">
                    <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                      <div className="border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2.5 text-[13px] font-medium text-[#1C1917]">
                        Metadata
                      </div>
                      <dl className="divide-y divide-[#EAE5DB]">
                        {[
                          ["State", getDisplayState(detailJob)],
                          [
                            "Attempts",
                            `${detailJob.attempts} / ${detailJob.maxAttempts}`,
                          ],
                          ["Priority", String(detailJob.priority)],
                          [
                            "Worker",
                            detailJob.claimedBy ||
                              detailAttempts[detailAttempts.length - 1]
                                ?.workerId ||
                              "-",
                          ],
                          ["Idempotency key", detailJob.idempotencyKey || "-"],
                          [
                            "Created",
                            `${fmtTimestamp(detailJob.createdAt)} (${relTime(
                              detailJob.createdAt
                            )})`,
                          ],
                          [
                            "Scheduled / Retry",
                            detailJob.nextRetryAt
                              ? `${fmtTimestamp(
                                  detailJob.nextRetryAt
                                )} (${relTime(detailJob.nextRetryAt)})`
                              : detailJob.scheduledAt
                              ? `${fmtTimestamp(
                                  detailJob.scheduledAt
                                )} (${relTime(detailJob.scheduledAt)})`
                              : "-",
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="grid grid-cols-[150px_1fr] items-baseline gap-4 px-4 py-2.5 text-[13px]"
                          >
                            <dt className="text-[#78716C]">{label}</dt>
                            <dd className="break-all font-mono text-[12px] text-[#1C1917]">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                      <div className="flex items-center justify-between border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2.5 text-[13px]">
                        <span className="font-medium text-[#1C1917]">
                          Attempts
                        </span>
                        <span className="font-mono text-[12px] text-[#78716C]">
                          {detailAttempts.length}
                        </span>
                      </div>
                      <div className="divide-y divide-[#EAE5DB]">
                        {detailAttempts.length > 0 ? (
                          [...detailAttempts].reverse().map((att) => (
                            <div
                              key={att.attemptNumber}
                              className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 p-4"
                            >
                              <div>
                                <div className="flex items-center gap-2.5">
                                  <StatusIconLabel
                                    status={att.outcome}
                                    compact
                                  />
                                  <span className="text-[13px] font-medium text-[#1C1917]">
                                    Attempt #{att.attemptNumber}
                                  </span>
                                </div>
                                <div className="mt-1.5 font-mono text-[11.5px] text-[#78716C]">
                                  {att.workerId || "unknown"}
                                </div>
                                {att.error && (
                                  <div className="mt-2.5 rounded-lg border border-[#FDBA74] bg-[#FFF7ED] px-3 py-2 font-mono text-[12px] break-words text-[#C2410C]">
                                    {att.error}
                                  </div>
                                )}
                              </div>
                              <div className="text-right font-mono text-[12px] text-[#57534E]">
                                <div>{fmtDuration(att.durationMs)}</div>
                                <div className="text-[#78716C]">
                                  {relTime(att.finishedAt)}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-[13px] text-[#78716C]">
                            No attempts yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                      <div className="flex items-center justify-between border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2 text-[13px]">
                        <span className="font-medium text-[#1C1917]">
                          Payload
                        </span>
                        <CopyButton
                          value={detailJob.payload || ""}
                          toastMessage="Copied payload"
                        />
                      </div>
                      <pre className="overflow-x-auto bg-[#FAF8F4] p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words text-[#1C1917]">
                        {detailJob.payload || "(empty)"}
                      </pre>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                      <div className="flex items-center justify-between border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2 text-[13px]">
                        <span className="font-mono text-[12px] font-medium text-[#1C1917]">
                          GET /jobs/{shortId(detailJob.id)}
                        </span>
                        <CopyButton
                          value={JSON.stringify(detailJob, null, 2)}
                          toastMessage="Copied JSON record"
                        />
                      </div>
                      <pre className="overflow-x-auto bg-[#FAF8F4] p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words text-[#1C1917]">
                        {JSON.stringify(detailJob, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </>
            )}
          </main>
        )}

        {/* VIEW 3: PLAYGROUND (#/playground) */}
        {route.view === "playground" && (
          <main className="mx-auto max-w-[1260px] space-y-6 px-6 py-8">
            <h1 className="font-fraunces text-[28px] font-medium tracking-[-0.02em] text-[#1C1917]">
              Playground
            </h1>

            <div className="grid grid-cols-[42fr_58fr] items-start gap-6 max-lg:grid-cols-1">
              <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                <div className="divide-y divide-[#EAE5DB]">
                  {DEMO_SCENARIOS.map((sc) => {
                    const active = sc.id === activeScenario.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          setSelectedScenarioId(sc.id);
                          setDedupeBanner(null);
                        }}
                        className={`relative flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition-colors cursor-pointer ${
                          active ? "bg-[#0F766E]/[0.06]" : "hover:bg-[#FAF8F4]"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="pg-active-bar"
                            transition={{
                              type: "spring",
                              duration: 0.24,
                              bounce: 0.08,
                            }}
                            className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-[#0F766E]"
                          />
                        )}
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 transition-colors ${
                              active ? "bg-[#0F766E]" : "bg-[#D6CFC2]"
                            }`}
                          />
                          <div>
                            <div className="text-[13.5px] font-medium text-[#1C1917]">
                              {sc.title}
                            </div>
                            <p className="mt-0.5 text-[12.5px] text-[#57534E]">
                              {sc.summary}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded bg-[#F2EFE9] px-2 py-0.5 font-mono text-[11px] text-[#57534E]">
                          {sc.tag}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                <div className="flex items-center justify-between gap-4 border-b border-[#EAE5DB] bg-[#FAF8F4] px-5 py-4">
                  <div>
                    <div className="font-mono text-[11px] text-[#78716C]">
                      {activeScenario.tag}
                    </div>
                    <h2 className="mt-0.5 font-fraunces text-[21px] font-medium tracking-[-0.02em] text-[#1C1917]">
                      {activeScenario.title}
                    </h2>
                  </div>
                  <Button
                    variant="default"
                    disabled={runningScenario}
                    onClick={() => runScenario(activeScenario)}
                    className="group h-9 px-4"
                  >
                    <span>
                      {runningScenario ? "Dispatching..." : "Run scenario"}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
                  </Button>
                </div>

                <div className="space-y-5 p-5">
                  <div className="overflow-hidden rounded-lg border border-[#EAE5DB] bg-[#FAF8F4]">
                    <div className="flex items-center justify-between border-b border-[#EAE5DB] px-3.5 py-2 font-mono text-[11px] text-[#78716C]">
                      <span>POST {window.location.origin}/jobs</span>
                      <span>application/json</span>
                    </div>
                    <pre className="overflow-x-auto p-3.5 font-mono text-[12px] leading-5 whitespace-pre-wrap text-[#1C1917]">
                      <span className="text-[#78716C]">
                        {activeScenario.headers}
                      </span>
                      {"\n\n"}
                      {JSON.stringify(activeScenario.previewPayload, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <div className="flex items-center justify-between border-b border-[#EAE5DB] pb-2 text-[12px] font-medium text-[#1C1917]">
                      <span>Responses</span>
                      {(streamItems.length > 0 || dedupeBanner !== null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setStreamItems([]);
                            setDedupeBanner(null);
                          }}
                          className="font-mono text-[11px] font-medium text-[#78716C] transition-colors hover:text-[#1C1917] cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {dedupeBanner && (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#166534]/20 bg-[#166534]/10 px-3.5 py-2.5 font-mono text-[12px] text-[#166534]">
                        <span>
                          {dedupeBanner.identical
                            ? "Deduped — identical UUID"
                            : "Mismatch"}{" "}
                          · {dedupeBanner.key} &rarr;{" "}
                          {shortId(dedupeBanner.jobId)}
                        </span>
                        <button
                          type="button"
                          onClick={() => inspectJob(dedupeBanner.jobId)}
                          className="font-medium underline underline-offset-4 cursor-pointer"
                        >
                          Trace &rarr;
                        </button>
                      </div>
                    )}

                    <div className="mt-1 divide-y divide-[#EAE5DB]">
                      {streamItems.length > 0 ? (
                        streamItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-4 py-2.5 font-mono text-[12px]"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={
                                  item.ok
                                    ? "font-medium text-[#166534]"
                                    : "font-medium text-[#C2410C]"
                                }
                              >
                                {item.status}
                              </span>
                              <span className="truncate text-[#57534E]">
                                {item.ok
                                  ? `{ "id": "${item.id}", "status": "${item.jobStatus}"${
                                      item.key ? `, "key": "${item.key}"` : ""
                                    } }`
                                  : item.error}
                              </span>
                            </div>
                            {item.id && (
                              <button
                                type="button"
                                onClick={() => inspectJob(item.id!)}
                                className="shrink-0 font-sans text-[12px] font-medium text-[#0F766E] underline-offset-4 hover:underline cursor-pointer"
                              >
                                Inspect &rarr;
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-[13px] text-[#78716C]">
                          No requests sent yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* VIEW 4: API (#/api) */}
        {route.view === "api" && (
          <main className="mx-auto max-w-[1260px] space-y-6 px-6 py-8">
            <h1 className="font-fraunces text-[28px] font-medium tracking-[-0.02em] text-[#1C1917]">
              API
            </h1>

            <div className="grid grid-cols-[52fr_48fr] items-start gap-6 max-lg:grid-cols-1">
              <div className="space-y-6">
                <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                  <div className="flex items-center justify-between border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2.5">
                    <span className="text-[13px] font-medium text-[#1C1917]">
                      Health
                    </span>
                    <Button size="sm" variant="outline" onClick={refreshHealth}>
                      Re-check
                    </Button>
                  </div>
                  <div className="divide-y divide-[#EAE5DB]">
                    {health ? (
                      [
                        ["Overall", health.status] as const,
                        ...Object.entries(health.components || {}).map(
                          ([k, v]) => [k, v.status] as const
                        ),
                      ].map(([k, v]) => (
                        <div
                          key={k}
                          className="flex items-center justify-between px-4 py-2.5"
                        >
                          <span className="font-mono text-[12px] text-[#1C1917]">
                            {k}
                          </span>
                          <StatusIconLabel status={v} compact />
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-[13px] text-[#78716C]">
                        Checking...
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
                  <div className="border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2.5 text-[13px] font-medium text-[#1C1917]">
                    Endpoints
                  </div>
                  <div className="divide-y divide-[#EAE5DB]">
                    {REST_ENDPOINTS.map(([method, path, desc]) => (
                      <div
                        key={path}
                        className="grid grid-cols-[52px_180px_1fr] items-baseline gap-3 px-4 py-3 text-[13px] max-sm:grid-cols-1"
                      >
                        <span
                          className={`font-mono text-[11px] font-medium ${
                            method === "GET"
                              ? "text-[#0F766E]"
                              : "text-[#166534]"
                          }`}
                        >
                          {method}
                        </span>
                        <span className="font-mono text-[12px] text-[#1C1917]">
                          {path}
                        </span>
                        <span className="text-[#57534E]">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  {
                    title: "Submit with Idempotency-Key",
                    cmd: `curl -X POST ${window.location.origin}/jobs \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: order-4821" \\\n  -d '{"type":"flaky","payload":"2","maxAttempts":4}'`,
                  },
                  {
                    title: "Inspect execution attempts",
                    cmd: `curl -s ${window.location.origin}/jobs/<job-uuid>/attempts`,
                  },
                  {
                    title: "Replay dead-letter job",
                    cmd: `curl -X POST ${window.location.origin}/jobs/<job-uuid>/replay`,
                  },
                ].map((snippet) => (
                  <div
                    key={snippet.title}
                    className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2 text-[13px]">
                      <span className="font-medium text-[#1C1917]">
                        {snippet.title}
                      </span>
                      <CopyButton
                        value={snippet.cmd}
                        toastMessage={`Copied ${snippet.title}`}
                      />
                    </div>
                    <pre className="overflow-x-auto bg-[#FAF8F4] p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap text-[#1C1917]">
                      {snippet.cmd}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </main>
        )}
      </div>
    </TooltipProvider>
  );
}
export default App;

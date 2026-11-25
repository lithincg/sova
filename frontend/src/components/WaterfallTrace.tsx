import {
  fmtDuration,
  getDisplayState,
  relTime,
  shortId,
  type Job,
  type JobAttempt,
} from "@/lib/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface TraceRow {
  label: string;
  tone: "ok" | "bad" | "warn" | "wait" | "run";
  startMs: number;
  endMs: number;
  caption: string;
  worker?: string | null;
  error?: string | null;
}

const BAR_CLASS: Record<TraceRow["tone"], string> = {
  ok: "bg-[#166534]/10 text-[#166534] ring-1 ring-inset ring-[#166534]/25",
  bad: "bg-[#C2410C]/10 text-[#C2410C] ring-1 ring-inset ring-[#C2410C]/25",
  warn: "bg-[#B45309]/10 text-[#B45309] ring-1 ring-inset ring-[#B45309]/25",
  wait: "border border-dashed border-[#D6CFC2] bg-transparent text-[#78716C]",
  run: "trace-running-stripe trace-running-shimmer text-[#0F766E] ring-1 ring-inset ring-[#0F766E]/30",
};

export function WaterfallTrace({
  job,
  attempts,
}: {
  job: Job;
  attempts: JobAttempt[];
}) {
  const ds = getDisplayState(job);
  const toMs = (iso: string) => new Date(iso).getTime();

  const scheduled =
    job.scheduledAt && toMs(job.scheduledAt) > toMs(job.createdAt)
      ? toMs(job.scheduledAt)
      : toMs(job.createdAt);

  const rows: TraceRow[] = [];
  let cursor = scheduled;

  attempts.forEach((att, idx) => {
    const s = toMs(att.startedAt);
    const f = toMs(att.finishedAt);
    if (s - cursor > 15) {
      rows.push({
        label: idx === 0 ? "Queued" : "Backoff",
        tone: "wait",
        startMs: cursor,
        endMs: s,
        caption: idx === 0 ? "wait" : "backoff",
      });
    }
    const tone: TraceRow["tone"] =
      att.outcome === "SUCCEEDED"
        ? "ok"
        : att.outcome === "REAPED"
        ? "warn"
        : "bad";
    rows.push({
      label: `Attempt ${att.attemptNumber}`,
      tone,
      startMs: s,
      endMs: f,
      caption:
        att.outcome === "SUCCEEDED"
          ? fmtDuration(att.durationMs)
          : att.outcome.toLowerCase(),
      worker: att.workerId,
      error: att.error,
    });
    cursor = f;
  });

  const now = Date.now();
  if (job.status === "RUNNING" || job.status === "CLAIMED") {
    const s = job.claimedAt ? toMs(job.claimedAt) : cursor;
    if (s - cursor > 15) {
      rows.push({
        label: attempts.length ? "Backoff" : "Queued",
        tone: "wait",
        startMs: cursor,
        endMs: s,
        caption: "",
      });
    }
    rows.push({
      label: `Attempt ${job.attempts + 1}`,
      tone: "run",
      startMs: s,
      endMs: Math.max(now, s + 50),
      caption: "running",
      worker: job.claimedBy,
    });
  } else if (ds === "RETRYING" && job.nextRetryAt) {
    rows.push({
      label: "Backoff",
      tone: "wait",
      startMs: cursor,
      endMs: Math.max(toMs(job.nextRetryAt), cursor + 100),
      caption: `retry ${relTime(job.nextRetryAt)}`,
    });
  } else if (attempts.length === 0) {
    rows.push({
      label: "Queued",
      tone: "wait",
      startMs: scheduled,
      endMs: Math.max(now, scheduled + 100),
      caption: ds === "SCHEDULED" ? `runs ${relTime(job.scheduledAt)}` : "pending",
    });
  }

  const start = scheduled;
  const end = Math.max(...rows.map((r) => r.endMs), start + 1);
  const span = end - start;

  const rootTone: TraceRow["tone"] =
    job.status === "SUCCEEDED"
      ? "ok"
      : job.status === "DEAD"
      ? "bad"
      : job.status === "RUNNING" || job.status === "CLAIMED"
      ? "run"
      : "wait";

  const pct = (v: number) => ((v - start) / span) * 100;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => fmtDuration(span * p));

  return (
    <div className="overflow-hidden rounded-xl border border-[#DED8CC] bg-white">
      <div className="flex items-center justify-between border-b border-[#EAE5DB] bg-[#FAF8F4] px-4 py-2.5 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[#1C1917]">Execution trace</span>
          <span className="text-[#A8A29E]">/</span>
          <span className="font-mono text-[12px] text-[#57534E]">
            {job.type} · {shortId(job.id)}
          </span>
        </div>
        <span className="font-mono text-[12px] text-[#57534E]">
          {fmtDuration(span)} total
        </span>
      </div>

      <div className="grid grid-cols-[175px_72px_1fr] gap-x-4 px-4 py-3 max-sm:grid-cols-[110px_56px_1fr]">
        <div className="col-start-3 mb-1 flex h-6 items-center justify-between border-b border-[#EAE5DB] font-mono text-[11px] text-[#78716C]">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>

        {/* Root job span */}
        <div className="flex h-8 items-center gap-2 truncate text-[13px] font-medium text-[#1C1917]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0F766E]" />
          <span className="font-mono text-[12px]">{job.type}</span>
        </div>
        <div className="h-8 text-right font-mono text-[12px] leading-8 text-[#1C1917]">
          {fmtDuration(span)}
        </div>
        <div className="relative h-8">
          <div className="absolute inset-x-0 top-1/2 h-px bg-[#EAE5DB]/80" />
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`trace-bar-anim sova-span-bar absolute top-1.5 flex h-5 items-center rounded px-2 font-mono text-[11px] transition-[filter] duration-150 ${BAR_CLASS[rootTone]}`}
                style={{ left: "0%", width: "100%" }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {job.type} · {fmtDuration(span)} · {ds.toLowerCase()}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Child attempt & wait spans */}
        {rows.map((row, idx) => {
          const left = pct(row.startMs);
          const width = Math.max(pct(row.endMs) - left, 0.8);
          const durText = fmtDuration(row.endMs - row.startMs);
          const tipParts = [row.label, durText];
          if (row.worker) tipParts.push(row.worker);
          if (row.error) tipParts.push(row.error.slice(0, 90));

          return (
            <div key={idx} className="contents">
              <div className="ml-2 flex h-8 items-center justify-between gap-2 truncate border-l border-[#EAE5DB] pl-3 text-[12.5px] text-[#57534E]">
                <span className="truncate">{row.label}</span>
                {row.worker && (
                  <span className="hidden truncate font-mono text-[11px] text-[#78716C] md:inline">
                    {row.worker}
                  </span>
                )}
              </div>
              <div className="h-8 text-right font-mono text-[12px] leading-8 text-[#57534E]">
                {durText}
              </div>
              <div className="relative h-8">
                <div className="absolute inset-x-0 top-1/2 h-px bg-[#EAE5DB]/80" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`trace-bar-anim sova-span-bar absolute top-1.5 flex h-5 items-center overflow-hidden rounded px-2 font-mono text-[11px] whitespace-nowrap transition-[filter] duration-150 ${BAR_CLASS[row.tone]}`}
                      style={{
                        left: `${left}%`,
                        width: `max(${width}%, 6px)`,
                        animationDelay: `${(idx + 1) * 35}ms`,
                      }}
                    >
                      {row.caption}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[360px] whitespace-normal">
                    {tipParts.join(" · ")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

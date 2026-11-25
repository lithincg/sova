import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Lock,
  RotateCw,
} from "lucide-react";
import type { DisplayState, Job } from "@/lib/api";

function countdownSuffix(iso?: string | null): string {
  if (!iso) return "";
  const sec = Math.ceil((new Date(iso).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(sec)) return "";
  return sec > 0 ? ` · ${sec}s` : " · due";
}

export function StatusIconLabel({
  status,
  job,
  compact = false,
}: {
  status: DisplayState | "REAPED" | "ALL" | "UP" | "DOWN" | string;
  job?: Job;
  compact?: boolean;
}) {
  if (status === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#0F766E]">
        <Loader2 className="h-3.5 w-3.5 animate-spin [animation-duration:650ms]" />
        <span>Running</span>
      </span>
    );
  }
  if (status === "CLAIMED") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#0F766E]">
        <Lock className="h-3.5 w-3.5 animate-pulse" />
        <span>Claimed</span>
      </span>
    );
  }
  if (status === "RETRYING") {
    const countdown = !compact ? countdownSuffix(job?.nextRetryAt) : "";
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#B45309] tabular-nums">
        <RotateCw className="h-3.5 w-3.5 animate-spin [animation-duration:1.3s]" />
        <span>Retrying{countdown}</span>
      </span>
    );
  }
  if (status === "SCHEDULED") {
    const countdown = !compact ? countdownSuffix(job?.scheduledAt) : "";
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#78716C] tabular-nums">
        <Clock className="h-3.5 w-3.5" />
        <span>Scheduled{countdown}</span>
      </span>
    );
  }
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#78716C]">
        <Inbox className="h-3.5 w-3.5" />
        <span>Pending</span>
      </span>
    );
  }
  if (status === "SUCCEEDED" || status === "UP") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#166534]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>{status === "UP" ? "Up" : "Succeeded"}</span>
      </span>
    );
  }
  if (
    status === "DEAD" ||
    status === "FAILED" ||
    status === "REAPED" ||
    status === "DOWN"
  ) {
    const label =
      status === "FAILED"
        ? "Failed"
        : status === "REAPED"
          ? "Reaped"
          : status === "DOWN"
            ? "Down"
            : "Dead";
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#C2410C]">
        <AlertOctagon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-[#57534E]">
      <Inbox className="h-3.5 w-3.5" />
      <span>{status}</span>
    </span>
  );
}

import { useEffect } from "react";
import { Command } from "cmdk";
import { Play, Plus, ArrowRight, Terminal, ListFilter } from "lucide-react";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/scenarios";
import { getDisplayState, shortId, type Job } from "@/lib/api";
import { StatusIconLabel } from "./StatusLabel";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: Job[];
  onNavigate: (hash: string) => void;
  onFilterStatus: (status: string) => void;
  onOpenEnqueue: () => void;
  onRunScenario: (scenario: DemoScenario) => void;
}

const FILTER_OPTIONS = [
  { key: "ALL", label: "All jobs" },
  { key: "PENDING", label: "Pending" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "RETRYING", label: "Retrying" },
  { key: "CLAIMED", label: "Claimed" },
  { key: "RUNNING", label: "Running" },
  { key: "SUCCEEDED", label: "Succeeded" },
  { key: "DEAD", label: "Dead" },
];

export function CommandMenu({
  open,
  onOpenChange,
  jobs,
  onNavigate,
  onFilterStatus,
  onOpenEnqueue,
  onRunScenario,
}: CommandMenuProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const closeAnd = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Sova command menu"
    >
      <Command.Input placeholder="Jump to a job ID, filter state, or run a scenario..." />
      <Command.List>
        <Command.Empty>No matching jobs, filters, or commands.</Command.Empty>

        <Command.Group heading="Actions">
          <Command.Item
            value="enqueue new job"
            onSelect={() => closeAnd(onOpenEnqueue)}
          >
            <span className="flex items-center gap-2 font-medium text-[#1C1917]">
              <Plus className="h-3.5 w-3.5 text-[#57534E]" />
              Enqueue new job
            </span>
            <kbd className="rounded bg-[#F2EFE9] px-1.5 py-0.5 font-mono text-[10px] text-[#78716C]">
              N
            </kbd>
          </Command.Item>

          <Command.Item
            value="view runs queue list"
            onSelect={() => closeAnd(() => onNavigate("#/jobs"))}
          >
            <span className="flex items-center gap-2">
              <ArrowRight className="h-3.5 w-3.5 text-[#78716C]" />
              Go to Queue runs
            </span>
            <span className="font-mono text-[11px] text-[#78716C]">#/jobs</span>
          </Command.Item>

          <Command.Item
            value="view interactive playground"
            onSelect={() => closeAnd(() => onNavigate("#/playground"))}
          >
            <span className="flex items-center gap-2">
              <Play className="h-3.5 w-3.5 text-[#78716C]" />
              Open Playground
            </span>
            <span className="font-mono text-[11px] text-[#78716C]">
              #/playground
            </span>
          </Command.Item>

          <Command.Item
            value="view rest api health"
            onSelect={() => closeAnd(() => onNavigate("#/api"))}
          >
            <span className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[#78716C]" />
              Open API &amp; health
            </span>
            <span className="font-mono text-[11px] text-[#78716C]">#/api</span>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Demo scenarios">
          {DEMO_SCENARIOS.map((sc) => (
            <Command.Item
              key={sc.id}
              value={`demo ${sc.title} ${sc.tag}`}
              onSelect={() => closeAnd(() => onRunScenario(sc))}
            >
              <span className="flex items-center gap-2">
                <Play className="h-3 w-3 text-[#57534E]" />
                {sc.title}
              </span>
              <span className="font-mono text-[11px] text-[#78716C]">
                {sc.tag}
              </span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Filter by state">
          {FILTER_OPTIONS.map((st) => (
            <Command.Item
              key={st.key}
              value={`filter status ${st.label} ${st.key}`}
              onSelect={() =>
                closeAnd(() => {
                  onFilterStatus(st.key);
                  onNavigate("#/jobs");
                })
              }
            >
              <span className="flex items-center gap-2">
                <ListFilter className="h-3.5 w-3.5 text-[#78716C]" />
                {st.label}
              </span>
            </Command.Item>
          ))}
        </Command.Group>

        {jobs.length > 0 && (
          <Command.Group heading="Recent jobs">
            {jobs.slice(0, 12).map((job) => {
              const ds = getDisplayState(job);
              return (
                <Command.Item
                  key={job.id}
                  value={`job ${job.id} ${job.type} ${job.payload ?? ""} ${ds}`}
                  onSelect={() =>
                    closeAnd(() => onNavigate(`#/jobs/${job.id}`))
                  }
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <StatusIconLabel status={ds} compact />
                    <span className="font-mono text-[12px] text-[#1C1917]">
                      {shortId(job.id)}
                    </span>
                    <span className="truncate font-mono text-[12px] text-[#57534E]">
                      {job.type}
                      {job.payload ? ` · ${job.payload}` : ""}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[#78716C]">
                    {job.attempts}/{job.maxAttempts}
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

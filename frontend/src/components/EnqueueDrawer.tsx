import { useState, useEffect, type FormEvent } from "react";
import { Drawer } from "vaul";
import { toast } from "sonner";
import { X, Dices } from "lucide-react";
import { api, shortId } from "@/lib/api";
import { Button } from "./ui/button";

interface EnqueueDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: (jobId: string) => void;
}

const HANDLERS: Record<
  "echo" | "sleep" | "flaky",
  { defaultPayload: string; hint: string }
> = {
  echo: {
    defaultPayload: "order #4821",
    hint: "Succeeds immediately.",
  },
  sleep: {
    defaultPayload: "2000",
    hint: "Duration in ms (50-60000).",
  },
  flaky: {
    defaultPayload: "2",
    hint: "Failures before success (99 -> DEAD).",
  },
};

export function EnqueueDrawer({
  open,
  onOpenChange,
  onSubmitted,
}: EnqueueDrawerProps) {
  const [type, setType] = useState<"echo" | "sleep" | "flaky">("echo");
  const [payload, setPayload] = useState(HANDLERS.echo.defaultPayload);
  const [priority, setPriority] = useState("0");
  const [maxAttempts, setMaxAttempts] = useState("3");
  const [delaySec, setDelaySec] = useState("0");
  const [idemKey, setIdemKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  const selectType = (next: "echo" | "sleep" | "flaky") => {
    setType(next);
    setPayload(HANDLERS[next].defaultPayload);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const delay = Math.max(0, Number(delaySec) || 0);
      const res = await api.submitJob(
        {
          type,
          payload,
          priority: Number(priority) || 0,
          maxAttempts: Math.max(1, Number(maxAttempts) || 3),
          scheduledAt:
            delay > 0 ? new Date(Date.now() + delay * 1000).toISOString() : null,
        },
        idemKey.trim() || null
      );
      if (!res.ok || !res.data) {
        toast.error(res.error || "Failed to enqueue job");
        return;
      }
      const created = res.data;
      onOpenChange(false);
      onSubmitted(created.id);
      toast.success(`Enqueued ${created.type} (${shortId(created.id)})`, {
        action: {
          label: "Inspect",
          onClick: () => {
            window.location.hash = `#/jobs/${created.id}`;
          },
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "h-9 w-full rounded-lg border border-[#DED8CC] bg-white px-3 font-mono text-[12.5px] text-[#1C1917] outline-none transition-colors focus:border-[#0F766E]";

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-[#1C1917]/25 backdrop-blur-[1px]" />
        <Drawer.Content className="fixed right-2 top-2 bottom-2 z-50 flex w-full max-w-[440px] flex-col rounded-xl border border-[#DED8CC] bg-[#FFFDF9] text-[#1C1917] shadow-[var(--ring-popover)] outline-none max-sm:right-0 max-sm:top-0 max-sm:bottom-0 max-sm:rounded-none">
          <div className="flex items-center justify-between border-b border-[#EAE5DB] px-6 py-4">
            <div>
              <Drawer.Title className="font-fraunces text-[20px] font-medium tracking-[-0.02em] text-[#1C1917]">
                Enqueue job
              </Drawer.Title>
              <Drawer.Description className="sr-only">
                Submit a new job to POST /jobs
              </Drawer.Description>
            </div>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Close drawer"
                className="rounded-lg p-1.5 text-[#78716C] transition-colors hover:bg-[#F2EFE9] hover:text-[#1C1917] active:scale-[0.97] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </Drawer.Close>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col justify-between overflow-y-auto"
          >
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-[#57534E]">
                  Handler
                </label>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#EAE5DB] bg-[#F2EFE9] p-1">
                  {(["echo", "sleep", "flaky"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => selectType(t)}
                      className={`h-8 rounded-md font-mono text-[12px] transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] cursor-pointer ${
                        type === t
                          ? "bg-white font-medium text-[#1C1917] shadow-[0_1px_2px_rgba(28,25,23,0.08)]"
                          : "text-[#57534E] hover:text-[#1C1917]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="enqueue-payload"
                  className="mb-1.5 block text-[12.5px] font-medium text-[#57534E]"
                >
                  Payload
                </label>
                <input
                  id="enqueue-payload"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1.5 text-[12px] text-[#78716C]">
                  {HANDLERS[type].hint}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="enqueue-priority"
                    className="mb-1.5 block text-[12.5px] font-medium text-[#57534E]"
                  >
                    Priority
                  </label>
                  <input
                    id="enqueue-priority"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="enqueue-max"
                    className="mb-1.5 block text-[12.5px] font-medium text-[#57534E]"
                  >
                    Max attempts
                  </label>
                  <input
                    id="enqueue-max"
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="enqueue-delay"
                    className="mb-1.5 block text-[12.5px] font-medium text-[#57534E]"
                  >
                    Delay (sec)
                  </label>
                  <input
                    id="enqueue-delay"
                    type="number"
                    min={0}
                    value={delaySec}
                    onChange={(e) => setDelaySec(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="enqueue-idem"
                  className="mb-1.5 block text-[12.5px] font-medium text-[#57534E]"
                >
                  Idempotency key <span className="text-[#78716C]">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="enqueue-idem"
                    value={idemKey}
                    onChange={(e) => setIdemKey(e.target.value)}
                    placeholder="e.g. order-4821"
                    className={`${inputClass} flex-1`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setIdemKey(
                        `idem-${Math.random().toString(36).slice(2, 8)}`
                      )
                    }
                  >
                    <Dices className="h-3.5 w-3.5 text-[#57534E]" />
                    Generate
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#EAE5DB] bg-[#FAF8F4] px-6 py-4">
              <Drawer.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Drawer.Close>
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? "Submitting..." : "Enqueue job"}
              </Button>
            </div>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

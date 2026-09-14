import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2, ListChecks, XCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { listJobs } from "@/lib/jobs.functions";
import { kickWorker } from "@/lib/jobs-runner";
import { jobKindLabel, type JobRecord } from "@/lib/jobs.shared";

/** Tasks are per-account, so only poll once a session exists. */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

function useJobsQuery(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["jobs"],
    queryFn: () => listJobs({ data: { limit: 20 } }),
    refetchInterval: (query) => {
      const jobs = query.state.data as JobRecord[] | undefined;
      const active = jobs?.some((j) => j.status === "queued" || j.status === "running");
      return active ? 3000 : 20000;
    },
    refetchOnWindowFocus: true,
  });
}

function StatusIcon({ status }: { status: JobRecord["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-foreground" />;
  if (status === "failed" || status === "canceled")
    return <XCircle className="h-4 w-4 text-destructive" />;
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
}

/**
 * Floating tasks tray. Tasks live on the server, so this panel keeps reporting
 * progress after a reload and shows results that finished while away.
 */
export function BackgroundTasks() {
  const signedIn = useSignedIn();
  const { data: jobs } = useJobsQuery(signedIn);
  const queryClient = useQueryClient();
  const list = jobs ?? [];
  const active = list.filter((j) => j.status === "queued" || j.status === "running");

  // Only surface the tray while work is actually in flight.
  if (!active.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40">
      <Popover>
        <PopoverTrigger
          onClick={() => {
            void kickWorker();
            void queryClient.invalidateQueries({ queryKey: ["jobs"] });
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-foreground shadow-lg transition-colors hover:bg-accent",
          )}
        >
          {active.length ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ListChecks className="h-4 w-4" />
          )}
          {active.length ? `${active.length} running` : "Tasks"}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[13px] font-semibold text-foreground">Background tasks</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              These keep running if you leave or reload.
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {list.map((job) => (
              <li key={job.id} className="flex gap-3 px-4 py-2.5">
                <span className="mt-0.5 shrink-0">
                  <StatusIcon status={job.status} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] text-foreground">
                    {job.label || jobKindLabel(job.kind)}
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {jobKindLabel(job.kind)} ·{" "}
                    {job.status === "failed" ? (job.error ?? "Failed") : job.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

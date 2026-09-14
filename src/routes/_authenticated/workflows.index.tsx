import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Facebook, Instagram, Loader2, Play, Plug, Plus, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { listSocialConnections } from "@/lib/social.functions";
import {
  deleteWorkflow,
  listWorkflows,
  runWorkflowNow,
  setWorkflowEnabled,
} from "@/lib/workflows.functions";
import {
  ACTION_LABELS,
  REPEAT_LABELS,
  TRIGGER_LABELS,
  type SocialProvider,
} from "@/lib/social.shared";

export const Route = createFileRoute("/_authenticated/workflows/")({
  head: () =>
    pageHead({
      path: "/workflows",
      title: "Workflows \u2014 Schedule & Publish Social Content",
      description:
        "Automated publishing workflows: generate videos on a schedule and publish them to Facebook, Instagram and Threads.",
      noindex: true,
      keywords: ["social media automation", "post scheduling", "reel publishing", "cross-posting"],
    }),
  component: WorkflowsPage,
});

const ICONS: Record<SocialProvider, typeof Facebook> = {
  facebook_page: Facebook,
  instagram: Instagram,
  threads: AtSign,
};

/** Plain-language status line for a workflow card. */
function activityOf(workflow: {
  runState: string;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  nextDueAt: string | null;
  triggerType: string;
  enabled: boolean;
}): string {
  if (workflow.runState === "rendering") return "Creating the video…";
  if (workflow.runState === "retry") return "Publishing failed — retrying";
  if (workflow.lastRunStatus === "completed") return "Last run published";
  if (workflow.lastRunStatus === "failed") return "Last run failed";
  if (workflow.enabled && workflow.triggerType === "schedule" && workflow.nextDueAt) {
    return `Next run ${new Date(workflow.nextDueAt).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return "";
}

function WorkflowsPage() {
  const fetchWorkflows = useServerFn(listWorkflows);
  const fetchConnections = useServerFn(listSocialConnections);
  const remove = useServerFn(deleteWorkflow);
  const run = useServerFn(runWorkflowNow);
  const toggle = useServerFn(setWorkflowEnabled);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: () => fetchWorkflows(),
    // While a run is generating or retrying, keep the card status fresh.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((w) => w.runState && w.runState !== "idle") ? 15_000 : false,
  });
  const connections = useQuery({
    queryKey: ["social-connections"],
    queryFn: () => fetchConnections(),
  });

  const [runningId, setRunningId] = useState<string | null>(null);

  const providerOf = useMemo(() => {
    const map = new Map<string, SocialProvider>();
    for (const account of connections.data ?? []) {
      map.set(account.id, account.provider as SocialProvider);
    }
    return map;
  }, [connections.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workflows"] });

  const items = workflows.data ?? [];

  return (
    <StudioLayout>
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-2 sm:pt-4">
        <div className="mb-3 flex items-center justify-end">
          <Button asChild size="icon" className="size-10 rounded-full" title="New workflow">
            <Link to="/workflows/create" aria-label="New workflow">
              <Plus className="size-4.5" />
            </Link>
          </Button>
        </div>

        {workflows.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-muted-foreground">No workflows yet.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button asChild><Link to="/workflows/create">Create workflow</Link></Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((workflow) => {
              const providers = Array.from(
                new Set(workflow.targets.map((id) => providerOf.get(id)).filter(Boolean)),
              ) as SocialProvider[];
              const manual = workflow.triggerType === "manual";
              return (
                <li
                  key={workflow.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface p-3"
                >
                  <div className="flex shrink-0 items-center gap-1">
                    {providers.length === 0 ? (
                      <Plug className="size-4 text-muted-foreground" />
                    ) : (
                      providers.map((provider) => {
                        const Icon = ICONS[provider];
                        return <Icon key={provider} className="size-4 text-muted-foreground" />;
                      })
                    )}
                  </div>

                  <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-auto">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold">{workflow.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          workflow.enabled
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {workflow.enabled ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {TRIGGER_LABELS[workflow.triggerType]} ·{" "}
                      {ACTION_LABELS[workflow.actionType]}
                      {workflow.triggerType === "schedule"
                        ? ` · ${REPEAT_LABELS[workflow.repeatRule]}${
                            workflow.timeSlots.length ? ` · ${workflow.timeSlots.join(", ")}` : ""
                          }`
                        : ""}
                    </p>
                    {activityOf(workflow) ? (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-foreground/80">
                        {workflow.runState && workflow.runState !== "idle" ? (
                          <Loader2 className="size-3 shrink-0 animate-spin" />
                        ) : null}
                        {activityOf(workflow)}
                      </p>
                    ) : null}
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {manual ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Run now"
                        disabled={runningId === workflow.id}
                        onClick={async () => {
                          setRunningId(workflow.id);
                          try {
                            const res = await run({ data: { id: workflow.id } });
                            if (res.status === "queued") toast.success("Video generation started");
                            else toast[res.status === "completed" ? "success" : "error"](
                              res.status === "completed" ? "Published" : "Run failed",
                            );
                            refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Run failed");
                          } finally {
                            setRunningId(null);
                          }
                        }}
                        className="size-9 rounded-full"
                      >
                        {runningId === workflow.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Play className="size-4" />
                        )}
                      </Button>
                    ) : null}
                    <Switch
                      checked={workflow.enabled}
                      aria-label={workflow.enabled ? "Pause workflow" : "Activate workflow"}
                      onCheckedChange={async (enabled) => {
                        await toggle({ data: { id: workflow.id, enabled } });
                        refresh();
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit workflow"
                      onClick={() =>
                        navigate({ to: "/workflows/create", search: { id: workflow.id } })
                      }
                      className="size-9 rounded-full"
                    >
                      <Settings className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Delete workflow"
                      onClick={async () => {
                        await remove({ data: { id: workflow.id } });
                        toast.success("Workflow deleted");
                        refresh();
                      }}
                      className="size-9 rounded-full text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </StudioLayout>
  );
}

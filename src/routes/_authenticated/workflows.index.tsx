import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AtSign,
  Facebook,
  Instagram,
  Loader2,
  MoreVertical,
  Play,
  Plug,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listSocialConnections } from "@/lib/social.functions";
import {
  deleteWorkflow,
  listWorkflows,
  runWorkflowNow,
  setWorkflowEnabled,
} from "@/lib/workflows.functions";
import { type SocialProvider } from "@/lib/social.shared";

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

type StatusTone = "active" | "error" | "disabled" | "processing";

function statusTone(workflow: {
  runState: string;
  lastRunStatus: string | null;
  enabled: boolean;
}): StatusTone {
  if (workflow.runState === "requested" || workflow.runState === "rendering" || workflow.runState === "retry") {
    return "processing";
  }
  if (workflow.lastRunStatus === "failed") return "error";
  if (!workflow.enabled) return "disabled";
  return "active";
}

const STATUS_RING: Record<StatusTone, string> = {
  active: "border-emerald-500",
  error: "border-red-500",
  disabled: "border-border",
  processing: "border-amber-500",
};

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
    refetchInterval: (query) =>
      (query.state.data ?? []).some((w) => w.runState && w.runState !== "idle") ? 15_000 : false,
  });
  const connections = useQuery({
    queryKey: ["social-connections"],
    queryFn: () => fetchConnections(),
  });

  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const providerOf = useMemo(() => {
    const map = new Map<string, SocialProvider>();
    for (const account of connections.data ?? []) {
      map.set(account.id, account.provider as SocialProvider);
    }
    return map;
  }, [connections.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workflows"] });

  const items = workflows.data ?? [];

  const confirmDelete = async () => {
    if (!deletingWorkflow) return;
    try {
      await remove({ data: { id: deletingWorkflow.id } });
      toast.success("Workflow deleted");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingWorkflow(null);
      setDeleteConfirm("");
    }
  };

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
              <Button asChild>
                <Link to="/workflows/create">Create workflow</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((workflow) => {
              const providers = Array.from(
                new Set(workflow.targets.map((id) => providerOf.get(id)).filter(Boolean)),
              ) as SocialProvider[];
              const tone = statusTone(workflow);
              const manual = workflow.triggerType === "manual";
              const firstProvider = providers[0];
              const Icon = firstProvider ? ICONS[firstProvider] : Plug;

              return (
                <li
                  key={workflow.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
                >
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 bg-muted ${STATUS_RING[tone]}`}
                    title={tone}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{workflow.name}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={workflow.enabled}
                      aria-label={workflow.enabled ? "Pause workflow" : "Activate workflow"}
                      onCheckedChange={async (enabled) => {
                        await toggle({ data: { id: workflow.id, enabled } });
                        refresh();
                      }}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Workflow options"
                          className="size-8 rounded-full"
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {manual ? (
                          <DropdownMenuItem
                            disabled={runningId === workflow.id}
                            onClick={async () => {
                              setRunningId(workflow.id);
                              try {
                                await run({ data: { id: workflow.id } });
                                toast.success("Run started \u2014 it will publish in the background");
                                refresh();
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Run failed");
                              } finally {
                                setRunningId(null);
                              }
                            }}
                          >
                            {runningId === workflow.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Play className="size-4" />
                            )}
                            <span>Run</span>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => navigate({ to: "/workflows/create", search: { id: workflow.id } })}
                        >
                          <Settings className="size-4" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setDeletingWorkflow({ id: workflow.id, name: workflow.name });
                            setDeleteConfirm("");
                          }}
                        >
                          <Trash2 className="size-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!deletingWorkflow} onOpenChange={(open) => !open && setDeletingWorkflow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workflow?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Type <span className="font-semibold">Delete</span> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder='Type "Delete"'
              autoComplete="off"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingWorkflow(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "Delete"}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudioLayout>
  );
}

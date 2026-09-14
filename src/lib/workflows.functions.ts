import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  defaultCreationConfig,
  type ActionType,
  type CreationConfig,
  type RepeatRule,
  type TriggerType,
  type Workflow,
} from "@/lib/social.shared";

type Row = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  scheduled_at: string | null;
  repeat_rule: string;
  time_slots: string[] | null;
  action_type: string;
  caption: string | null;
  hook_title: string | null;
  hashtags: string[] | null;
  media_url: string | null;
  media_path: string | null;
  targets: string[] | null;
  last_run_at: string | null;
  last_run_status: string | null;
  creation_config: unknown;
  tz_offset: number | null;
  next_due_at: string | null;
  run_state: string | null;
};

function mergeCreation(raw: unknown): CreationConfig {
  const base = defaultCreationConfig();
  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...(raw as Partial<CreationConfig>) };
}

function toWorkflow(row: Row): Workflow {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    triggerType: row.trigger_type as TriggerType,
    scheduledAt: row.scheduled_at,
    repeatRule: row.repeat_rule as RepeatRule,
    timeSlots: row.time_slots ?? [],
    actionType: row.action_type as ActionType,
    caption: row.caption,
    hookTitle: row.hook_title,
    hashtags: row.hashtags ?? [],
    mediaUrl: row.media_url,
    mediaPath: row.media_path,
    targets: row.targets ?? [],
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    creationConfig: mergeCreation(row.creation_config),
    tzOffset: row.tz_offset ?? 0,
    nextDueAt: row.next_due_at,
    runState: row.run_state ?? "idle",
  };
}

const SELECT =
  "id, name, enabled, trigger_type, scheduled_at, repeat_rule, time_slots, action_type, caption, hook_title, hashtags, media_url, media_path, targets, last_run_at, last_run_status, creation_config, tz_offset, next_due_at, run_state";

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Workflow[]> => {
    const { data, error } = await context.supabase
      .from("workflows")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toWorkflow(row as unknown as Row));
  });

export const getWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("A workflow id is required.");
    return { id: String(input.id) };
  })
  .handler(async ({ data, context }): Promise<Workflow | null> => {
    const { data: row, error } = await context.supabase
      .from("workflows")
      .select(SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? toWorkflow(row as unknown as Row) : null;
  });

export type WorkflowInput = {
  id?: string;
  name: string;
  triggerType: TriggerType;
  scheduledAt: string | null;
  repeatRule: RepeatRule;
  timeSlots: string[];
  actionType: ActionType;
  caption: string;
  targets: string[];
  enabled: boolean;
  creationConfig: CreationConfig;
  tzOffset: number;
};

const TIME_SLOT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const saveWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: WorkflowInput) => {
    if (!input?.name?.trim()) throw new Error("Give the workflow a name.");
    if (!input.targets?.length) throw new Error("Choose at least one connected account.");
    const slots = (input.timeSlots ?? []).map((s) => s.trim()).filter(Boolean);
    if (slots.some((s) => !TIME_SLOT.test(s))) throw new Error("Time slots must use HH:MM.");
    if (input.triggerType === "schedule" && (!slots.length || !input.scheduledAt)) {
      throw new Error("Pick a start date and at least one publish time.");
    }
    return { ...input, timeSlots: Array.from(new Set(slots)).sort() };
  })
  .handler(async ({ data, context }): Promise<Workflow> => {
    const { computeNextDueAt } = await import("@/lib/workflows.server");

    const scheduled = data.triggerType === "schedule";
    const nextDueAt = scheduled
      ? computeNextDueAt({
          repeat_rule: data.repeatRule,
          time_slots: data.timeSlots,
          scheduled_at: data.scheduledAt,
          tz_offset: data.tzOffset,
        })
      : null;
    if (scheduled && data.enabled && !nextDueAt) {
      throw new Error("Choose a future schedule time.");
    }

    const payload = {
      user_id: context.userId,
      name: data.name.trim(),
      enabled: data.enabled,
      trigger_type: data.triggerType,
      scheduled_at: scheduled ? data.scheduledAt : null,
      repeat_rule: data.repeatRule,
      time_slots: scheduled ? data.timeSlots : [],
      action_type: data.actionType,
      caption: data.caption.trim() || null,
      targets: data.targets,
      creation_config: data.creationConfig as never,
      tz_offset: data.tzOffset,
      next_due_at: nextDueAt,
      run_state: "idle",
      publish_attempts: 0,
    };

    const query = data.id
      ? context.supabase.from("workflows").update(payload).eq("id", data.id).select(SELECT).single()
      : context.supabase.from("workflows").insert(payload).select(SELECT).single();

    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    return toWorkflow(row as unknown as Row);
  });

export const setWorkflowEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { data: workflow, error: readError } = await context.supabase
      .from("workflows")
      .select("trigger_type, repeat_rule, time_slots, scheduled_at, tz_offset")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!workflow) throw new Error("Workflow not found.");

    let nextDueAt: string | null = null;
    if (data.enabled && workflow.trigger_type === "schedule") {
      const { computeNextDueAt } = await import("@/lib/workflows.server");
      nextDueAt = computeNextDueAt({
        repeat_rule: workflow.repeat_rule,
        time_slots: workflow.time_slots,
        scheduled_at: workflow.scheduled_at,
        tz_offset: workflow.tz_offset,
      });
    }
    const { error } = await context.supabase
      .from("workflows")
      .update({ enabled: data.enabled, next_due_at: nextDueAt, lock_until: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Asks for a workflow to run now.
 *
 * This only flags the row; the `workflows_dispatch_scheduler` database trigger
 * wakes the server-side scheduler, which creates the video (if needed), waits
 * for the render and publishes to every selected account — all without this
 * request or the browser staying around. Progress shows up in `workflow_runs`.
 */
export const runWorkflowNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: wf, error } = await context.supabase
      .from("workflows")
      .select("id, run_state")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wf) throw new Error("Workflow not found.");
    if (wf.run_state && wf.run_state !== "idle") {
      throw new Error("This workflow is already running.");
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await context.supabase
      .from("workflows")
      .update({
        run_state: "requested",
        next_due_at: now,
        pending_video_id: null,
        publish_attempts: 0,
        lock_until: null,
        last_run_at: now,
        last_run_status: "processing",
      })
      .eq("id", data.id)
      .eq("run_state", wf.run_state ?? "idle")
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error("This workflow is already running.");

    return { status: "queued" as const };
  });

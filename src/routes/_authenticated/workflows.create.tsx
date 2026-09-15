import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, CalendarDays, Check, ChevronDown, Facebook, Instagram, Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { listSocialConnections } from "@/lib/social.functions";
import { getWorkflow, saveWorkflow } from "@/lib/workflows.functions";
import {
  ACTION_LABELS,
  ART_STYLES,
  CAPTION_TEMPLATES,
  CREATION_CATEGORIES,
  CREATION_DURATIONS,
  CREATION_QUALITIES,
  CREATION_RATIOS,
  IMAGE_STYLES,
  REPEAT_LABELS,
  TRIGGER_LABELS,
  VOICE_GENDERS,
  VOICE_PERSONAS,
  VOICE_TONES,
  defaultCreationConfig,
  isVideoAction,
  type ActionType,
  type CreationConfig,
  type RepeatRule,
  type SocialProvider,
  type TriggerType,
} from "@/lib/social.shared";

type Search = { id?: string | undefined };

export const Route = createFileRoute("/_authenticated/workflows/create")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    id: typeof search["id"] === "string" ? search["id"] : undefined,
  }),
  head: () =>
    pageHead({
      path: "/workflows/create",
      title: "Create Workflow \u2014 Automated Video Publishing",
      description:
        "Set a schedule, customize the AI video creation and publish automatically to your connected social accounts.",
      noindex: true,
      keywords: ["create workflow", "schedule video", "auto publishing"],
    }),
  component: CreateWorkflowPage,
});

const ICONS: Record<SocialProvider, typeof Facebook> = {
  facebook_page: Facebook,
  instagram: Instagram,
  threads: AtSign,
};

const inputClass =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-border-strong";
const labelClass = "text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground";

const TRIGGERS: TriggerType[] = ["schedule", "manual"];
const REPEATS: RepeatRule[] = ["once", "daily", "weekly", "custom"];
const ACTIONS: ActionType[] = ["publish_post", "publish_reel", "crosspost"];

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

/** In-app clock picker so we never depend on the browser's native time widget. */
function TimePicker({ onAdd }: { onAdd: (slot: string) => void }) {
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState("00");
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("AM");

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
      <SelectControl value={String(hour)} options={HOURS.map(String)} onChange={(value) => setHour(Number(value))} />
      <SelectControl value={minute} options={MINUTES} onChange={setMinute} />
      <SelectControl value={meridiem} options={["AM", "PM"]} onChange={(value) => setMeridiem(value as "AM" | "PM")} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Add publish time"
        onClick={() => {
          let h = hour % 12;
          if (meridiem === "PM") h += 12;
          onAdd(`${String(h).padStart(2, "0")}:${minute}`);
        }}
      >
        <Plus />
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <SelectControl value={value} options={options} onChange={onChange} />
    </Field>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  labels,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  labels?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const labelFor = (option: string) => labels?.[option] ?? option;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full min-w-0 justify-between rounded-full bg-background px-4 text-sm font-medium shadow-none"
        >
          <span className="truncate">{labelFor(value)}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-36 p-1.5">
        <div className="max-h-64 overflow-y-auto" role="listbox" aria-label="Choose an option">
          {options.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className="h-10 w-full justify-between rounded-xl px-3 font-medium"
            >
              <span className="truncate">{labelFor(option)}</span>
              {option === value ? <Check /> : null}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between rounded-full bg-background px-4 text-sm font-medium shadow-none"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {selected
              ? selected.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
              : "Choose date"}
          </span>
          <CalendarDays className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          disabled={{ before: new Date() }}
          onSelect={(date) => {
            if (!date) return;
            const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
            onChange(localDate.toISOString().slice(0, 10));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="min-w-6 text-right text-xs font-bold">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="h-6 w-11 [&>span]:size-5 data-[state=checked]:[&>span]:translate-x-5" />
    </div>
  );
}

function CreateWorkflowPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const fetchConnections = useServerFn(listSocialConnections);
  const fetchWorkflow = useServerFn(getWorkflow);
  const save = useServerFn(saveWorkflow);

  const connections = useQuery({
    queryKey: ["social-connections"],
    queryFn: () => fetchConnections(),
  });
  const existing = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => fetchWorkflow({ data: { id: id as string } }),
    enabled: Boolean(id),
  });

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [triggerType, setTriggerType] = useState<TriggerType>("schedule");
  const [repeatRule, setRepeatRule] = useState<RepeatRule>("daily");
  const [startDate, setStartDate] = useState("");
  const [timeSlots, setTimeSlots] = useState<string[]>(["09:00"]);
  const [actionType, setActionType] = useState<ActionType>("publish_reel");
  const [instruction, setInstruction] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [creation, setCreation] = useState<CreationConfig>(defaultCreationConfig());
  const [customizing, setCustomizing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const workflow = existing.data;
    if (!workflow) return;
    setName(workflow.name);
    setEnabled(workflow.enabled);
    setTriggerType(workflow.triggerType);
    setRepeatRule(workflow.repeatRule);
    setStartDate(workflow.scheduledAt ? workflow.scheduledAt.slice(0, 10) : "");
    setTimeSlots(workflow.timeSlots.length ? workflow.timeSlots : ["09:00"]);
    setActionType(workflow.actionType);
    setInstruction(workflow.caption ?? "");
    setTargets(workflow.targets);
    setCreation(workflow.creationConfig);
  }, [existing.data]);

  const accounts = useMemo(() => connections.data ?? [], [connections.data]);
  const scheduled = triggerType === "schedule";
  const videoAction = isVideoAction(actionType);

  const submit = async () => {
    setBusy(true);
    try {
      const scheduledAt = scheduled
        ? new Date(`${startDate || new Date().toISOString().slice(0, 10)}T00:00:00`).toISOString()
        : null;
      await save({
        data: {
          ...(id ? { id } : {}),
          name,
          triggerType,
          scheduledAt,
          repeatRule,
          timeSlots: scheduled ? timeSlots : [],
          actionType,
          caption: instruction,
          targets,
          enabled,
          creationConfig: creation,
          tzOffset: -new Date().getTimezoneOffset(),
        },
      });
      toast.success(id ? "Workflow updated" : "Workflow created");
      navigate({ to: "/workflows" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the workflow");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StudioLayout>
      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-3 sm:pt-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold">Workflow status</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{enabled ? "Automation is active" : "Automation is paused"}</p>
            </div>
            <Toggle checked={enabled} onChange={setEnabled} label={enabled ? "On" : "Off"} />
          </div>

          <section className="space-y-4 rounded-3xl border border-border bg-surface p-4" aria-label="Workflow details">
          <Field label="Workflow name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily cosmic story"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trigger">
              <SelectControl value={triggerType} options={TRIGGERS} labels={TRIGGER_LABELS} onChange={(value) => setTriggerType(value as TriggerType)} />
            </Field>
            <Field label="What it publishes">
              <SelectControl value={actionType} options={ACTIONS} labels={ACTION_LABELS} onChange={(value) => setActionType(value as ActionType)} />
            </Field>
          </div>
          </section>

          {scheduled ? (
            <section className="space-y-4 rounded-3xl border border-border bg-surface p-4" aria-label="Schedule">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frequency">
                  <SelectControl value={repeatRule} options={REPEATS} labels={REPEAT_LABELS} onChange={(value) => setRepeatRule(value as RepeatRule)} />
                </Field>
                <Field label="Starts on">
                  <DatePicker value={startDate} onChange={setStartDate} />
                </Field>
              </div>

              <div className="space-y-2">
                <span className={labelClass}>Publish times</span>
                <div className="flex flex-wrap gap-1.5">
                  {timeSlots.map((slot) => (
                    <span
                      key={slot}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs font-semibold"
                    >
                      {slot}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${slot}`}
                        onClick={() => setTimeSlots((slots) => slots.filter((s) => s !== slot))}
                        className="size-5"
                      >
                        <X />
                      </Button>
                    </span>
                  ))}
                </div>
                <TimePicker
                  onAdd={(slot) =>
                    setTimeSlots((slots) => Array.from(new Set([...slots, slot])).sort())
                  }
                />
              </div>
            </section>
          ) : null}

          <section className="space-y-4 rounded-3xl border border-border bg-surface p-4" aria-label="Content and destination">
          <Field label="Instruction">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="Describe what the post should say or show"
              className={`${inputClass} resize-none`}
            />
          </Field>

          {videoAction ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomizing(true)}
              className="h-auto min-h-12 w-full justify-start rounded-full px-4 py-2.5"
            >
              <Sparkles /> <span className="font-semibold">Customize Creation</span>
              <span className="ml-auto truncate text-right text-[11px] font-medium text-muted-foreground">
                {creation.category} · {creation.durationSeconds}s · {creation.aspectRatio}
              </span>
            </Button>
          ) : null}

          <div className="space-y-2">
            <span className={labelClass}>Publish to</span>
            {accounts.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Connect an account on the Integrations page first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {accounts.map((account) => {
                  const Icon = ICONS[account.provider as SocialProvider] ?? Facebook;
                  const active = targets.includes(account.id);
                  return (
                    <Button
                      key={account.id}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        setTargets((list) =>
                          active ? list.filter((t) => t !== account.id) : [...list, account.id],
                        )
                      }
                      className="rounded-full"
                    >
                      <Icon className="size-3.5" />
                      {account.displayName ?? account.provider}
                      {active ? <Check className="size-3.5" /> : null}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
          </section>

          <div className="pt-2">
          <Button
            type="button"
            disabled={busy}
            onClick={submit}
            className="h-12 w-full rounded-full text-sm font-bold"
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {id ? "Save workflow" : "Create workflow"}
          </Button>
          </div>
        </div>
      </div>

      {customizing ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="h-dvh w-full max-w-lg overflow-y-auto bg-background shadow-float sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl sm:border sm:border-border">
            <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4 sm:px-5">
              <h2 className="font-display text-base font-bold">Customize Creation</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => setCustomizing(false)}
              >
                <X />
              </Button>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <Field label="Avoid in generated video">
                <textarea
                  value={creation.instructions}
                  onChange={(e) => setCreation({ ...creation, instructions: e.target.value })}
                  rows={3}
                  placeholder="Examples: people, faces, text, logos, dark scenes"
                  className={`${inputClass} resize-none`}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Picker
                  label="Category"
                  value={creation.category}
                  options={CREATION_CATEGORIES}
                  onChange={(category) => setCreation({ ...creation, category })}
                />
                <Picker
                  label="Art style"
                  value={creation.artStyle}
                  options={ART_STYLES}
                  onChange={(artStyle) => setCreation({ ...creation, artStyle })}
                />
                <Picker
                  label="Image style"
                  value={creation.imageStyle}
                  options={IMAGE_STYLES}
                  onChange={(imageStyle) => setCreation({ ...creation, imageStyle })}
                />
                <Picker
                  label="Aspect ratio"
                  value={creation.aspectRatio}
                  options={CREATION_RATIOS}
                  onChange={(aspectRatio) => setCreation({ ...creation, aspectRatio })}
                />
                <Field label="Length">
                  <SelectControl value={`${creation.durationSeconds}s`} options={CREATION_DURATIONS.map((seconds) => `${seconds}s`)} onChange={(value) => setCreation({ ...creation, durationSeconds: Number(value.replace("s", "")) })} />
                </Field>
                <Picker
                  label="Quality"
                  value={creation.quality}
                  options={CREATION_QUALITIES}
                  onChange={(quality) => setCreation({ ...creation, quality })}
                />
                <Picker
                  label="Voice type"
                  value={creation.voiceGender}
                  options={VOICE_GENDERS}
                  onChange={(voiceGender) => setCreation({ ...creation, voiceGender })}
                />
                <Picker
                  label="Narrator"
                  value={creation.voicePersona}
                  options={VOICE_PERSONAS}
                  onChange={(voicePersona) => setCreation({ ...creation, voicePersona })}
                />
                <Picker
                  label="Voice tone"
                  value={creation.voiceTone}
                  options={VOICE_TONES}
                  onChange={(voiceTone) => setCreation({ ...creation, voiceTone })}
                />
                <Picker
                  label="Caption template"
                  value={creation.captionStyle}
                  options={CAPTION_TEMPLATES}
                  onChange={(captionStyle) => setCreation({ ...creation, captionStyle })}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border p-3">
                <span className="text-sm font-semibold">Captions</span>
                <Toggle checked={creation.captions} onChange={(captions) => setCreation({ ...creation, captions })} label={creation.captions ? "On" : "Off"} />
              </div>
              {creation.captions ? (
                <div className="space-y-3 rounded-2xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Caption size</span>
                    <span className="text-xs font-bold tabular-nums">{creation.captionScale}</span>
                  </div>
                  <Slider
                    value={[creation.captionScale]}
                    onValueChange={([value]) =>
                      setCreation({ ...creation, captionScale: Math.min(10, Math.max(1, Math.round(value ?? 4))) })
                    }
                    min={1}
                    max={10}
                    step={1}
                    aria-label="Caption size"
                  />
                  <div className="flex items-center justify-center rounded-xl border border-border bg-background p-4">
                    <span
                      className="font-bold uppercase tracking-wide"
                      style={{ fontSize: `${10 + creation.captionScale * 5}px`, lineHeight: 1.2 }}
                    >
                      CAPTION TEXT
                    </span>
                  </div>
                </div>
              ) : null}
              <Button
                type="button"
                onClick={() => setCustomizing(false)}
                className="h-12 w-full rounded-full font-bold"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </StudioLayout>
  );
}

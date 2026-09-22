import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  Play,
  Sparkles,
  Film,
  ChevronDown,
  ChevronUp,
  Subtitles,
  CheckCircle2,
  Clock,
  Loader2,
  Music,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { RecentCreations } from "@/components/hyper/RecentCreations";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/config";
import { getVideoPlaybackUrl, startVideoRender } from "@/lib/video-agent.functions";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/video-agent")({
  head: () =>
    pageHead({
      path: "/video-agent",
      title: "Video Agent | Hyper Copilot",
      description:
        "Clean, high-performance AI video studio for long-form documentaries and short-form reels.",
      ogTitle: "Video Agent — Long-Form & Short-Form Studio",
      breadcrumbs: [{ name: "Video Agent", path: "/video-agent" }],
    }),
  component: VideoAgent,
});

const CATEGORIES = [
  "Documentary",
  "Business & Finance",
  "Science & Technology",
  "Motivation",
  "Travel & Lifestyle",
  "Horror & Mystery",
  "News & Facts",
] as const;

const VISUAL_STYLES = [
  "Cinematic",
  "Realistic",
  "Corporate",
  "3D Render",
  "Cyberpunk",
  "Minimalist",
] as const;

const RESOLUTIONS = ["720p HD", "1080p Full HD"] as const;
const FRAME_RATES = ["30 FPS", "60 FPS"] as const;
const VOICE_GENDERS = ["Male", "Female"] as const;
const CAPTION_STYLES = ["Minimal", "Bold", "Dynamic"] as const;
const CAPTION_SIZES = ["Small", "Medium", "Large"] as const;

type LogLine = { time: string; text: string; tone?: "ok" | "warn" | "err" };

function Console({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div className="max-h-48 overflow-y-auto rounded-xl bg-surface-2/50 p-3 font-mono text-[11px] leading-relaxed border border-border/60">
      {lines.map((l, i) => (
        <p
          key={i}
          className={cn(
            "whitespace-pre-wrap",
            l.tone === "err"
              ? "text-destructive"
              : l.tone === "ok"
                ? "text-emerald-400"
                : l.tone === "warn"
                  ? "text-amber-400/90"
                  : "text-foreground/80",
          )}
        >
          <span className="text-muted-foreground/60">[{l.time}] </span>
          {l.text}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function VideoAgent() {
  const [mode, setMode] = useState<"short" | "long">("long");
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [showNegative, setShowNegative] = useState(false);

  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("1080p Full HD");
  const [fps, setFps] = useState<(typeof FRAME_RATES)[number]>("60 FPS");
  const [durationMinutes, setDurationMinutes] = useState(3);
  const [durationSecondsShort, setDurationSecondsShort] = useState(15);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Documentary");
  const [visualStyle, setVisualStyle] = useState<(typeof VISUAL_STYLES)[number]>("Cinematic");

  const [voiceGender, setVoiceGender] = useState<(typeof VOICE_GENDERS)[number]>("Male");
  const [bgm, setBgm] = useState(true);

  const [captions, setCaptions] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<(typeof CAPTION_STYLES)[number]>("Dynamic");
  const [captionSize, setCaptionSize] = useState<(typeof CAPTION_SIZES)[number]>("Medium");

  const [busy, setBusy] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "processing" | "completed" | "failed" | null>(
    null,
  );
  const [step, setStep] = useState<string>("queued");
  const [progress, setProgress] = useState<number>(0);
  const [showLogs, setShowLogs] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const seenLogs = useRef(0);

  const queryClient = useQueryClient();
  const start = useServerFn(startVideoRender);
  const resolvePlaybackUrl = useServerFn(getVideoPlaybackUrl);

  const log = useCallback((text: string, tone?: LogLine["tone"]) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLines((l) => [...l, tone ? { time, text, tone } : { time, text }]);
  }, []);

  const getActiveStage = (): number => {
    if (status === "completed" || progress === 100) return 4;
    const s = step.toLowerCase();
    if (s.includes("script") || s.includes("queued") || s.includes("prompt")) return 1;
    if (s.includes("voice") || s.includes("tts") || s.includes("speech") || s.includes("audio"))
      return 2;
    if (
      s.includes("render") ||
      s.includes("engine") ||
      s.includes("c++") ||
      s.includes("asset") ||
      s.includes("source")
    )
      return 3;
    if (
      s.includes("download") ||
      s.includes("complete") ||
      s.includes("finish") ||
      s.includes("export")
    )
      return 4;
    return progress > 60 ? 3 : progress > 30 ? 2 : 1;
  };

  useEffect(() => {
    if (!videoId) return;
    const activeId = videoId;

    const apply = (row: Record<string, unknown> | null) => {
      if (!row) return;

      const rowLogs = Array.isArray(row["logs"])
        ? (row["logs"] as unknown[])
        : typeof row["logs"] === "string" && row["logs"]
          ? [row["logs"]]
          : [];

      if (rowLogs.length > seenLogs.current) {
        const fresh = rowLogs.slice(seenLogs.current);
        seenLogs.current = rowLogs.length;
        for (const entry of fresh) {
          const text =
            typeof entry === "string"
              ? entry
              : typeof entry === "object" && entry && "text" in entry
                ? String((entry as { text: unknown }).text)
                : JSON.stringify(entry);
          log(text);
        }
      }

      if (typeof row["step"] === "string" && row["step"]) {
        setStep(row["step"]);
      }
      if (typeof row["progress"] === "number") {
        setProgress(row["progress"]);
      }

      const rowStatus = String(row["status"] ?? "");
      if (
        rowStatus === "pending" ||
        rowStatus === "processing" ||
        rowStatus === "completed" ||
        rowStatus === "failed"
      ) {
        setStatus(rowStatus);
      }

      if (rowStatus === "completed") {
        setProgress(100);
        const raw = typeof row["video_url"] === "string" ? row["video_url"] : null;
        if (raw && /^https?:\/\//i.test(raw)) {
          setClipUrl(raw);
        } else if (raw) {
          void resolvePlaybackUrl({ data: { videoId: activeId } }).then(({ url }) =>
            setClipUrl(url),
          );
        }

        if (typeof row["drive_url"] === "string" && row["drive_url"]) {
          setDriveUrl(row["drive_url"]);
        } else {
          for (const entry of rowLogs) {
            const text = String(entry);
            const match = text.match(/https:\/\/drive\.google\.com\/[^\s"')]+/);
            if (match) {
              setDriveUrl(match[0]);
              break;
            }
          }
        }

        log("Video ready", "ok");
        setBusy(false);
        setVideoId(null);
        void queryClient.invalidateQueries({ queryKey: ["generations"] });
        toast.success("Video ready!");
      } else if (rowStatus === "failed") {
        const msg =
          typeof row["error"] === "string" && row["error"] ? row["error"] : "Generation failed";
        log(msg, "err");
        setBusy(false);
        setVideoId(null);
        toast.error(msg);
      }
    };

    const channel = supabase
      .channel(`videos:${videoId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "videos", filter: `id=eq.${videoId}` },
        (payload) => apply(payload.new as Record<string, unknown>),
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void supabase
        .from("videos")
        .select("status, step, progress, logs, video_url, error")
        .eq("id", videoId)
        .maybeSingle()
        .then(({ data }) => apply(data as Record<string, unknown> | null));
    }, 4000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [videoId, log, queryClient, resolvePlaybackUrl]);

  const handleGenerateVideo = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a video topic or instruction.");
      return;
    }

    setBusy(true);
    setClipUrl(null);
    setDriveUrl(null);
    setStatus("pending");
    setStep("Scripting");
    setProgress(5);
    setLines([]);
    seenLogs.current = 0;

    const resToken = resolution.includes("720") ? "720p" : "1080p";
    const fpsToken = fps.includes("30") ? "30" : "60";
    const durationSeconds = mode === "long" ? durationMinutes * 60 : durationSecondsShort;

    try {
      log(`Starting render: ${category} (${visualStyle})`);
      const { videoId: id } = await start({
        data: {
          mode,
          prompt: prompt.trim(),
          negative_prompt: negative.trim(),
          category,
          visual_style: visualStyle,
          resolution: resToken,
          fps: fpsToken,
          duration_minutes: mode === "long" ? durationMinutes : undefined,
          duration_seconds: durationSeconds,
          voice_gender: voiceGender.toLowerCase(),
          bgm,
          captions,
          caption_style: captionStyle,
          caption_size: captionSize,
          aspect_ratio: mode === "long" ? "16:9" : "9:16",
        },
      });

      setStatus("processing");
      setVideoId(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start generation";
      log(msg, "err");
      toast.error(msg);
      setStatus("failed");
      setBusy(false);
    }
  };

  const activeStage = getActiveStage();

  return (
    <StudioLayout>
      <div className="mx-auto max-w-2xl space-y-4 pb-12">
        {/* Mode Toggle Header */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-base font-bold text-foreground">Video Generator</h1>
          </div>

          <div className="flex items-center rounded-full border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => setMode("short")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
                mode === "short"
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Film className="h-3.5 w-3.5" />
              <span>Short-Form</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("long")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
                mode === "long"
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Long-Form</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm">
          {/* Describe / Topic Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="video-topic-prompt" className="text-xs font-semibold text-foreground">
                Documentary Idea / Topic
              </label>
              <span className="text-[11px] text-muted-foreground">
                {mode === "long" ? "16:9 Landscape" : "9:16 Reel"}
              </span>
            </div>
            <textarea
              id="video-topic-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              placeholder={
                mode === "long"
                  ? "Describe your documentary idea or topic (e.g., Deep ocean trenches and marine biology)..."
                  : "Enter your short-form video idea..."
              }
              className="w-full resize-none rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50"
            />

            {/* Negative Prompt Accordion */}
            <div>
              <button
                type="button"
                id="negative-prompt-toggle"
                onClick={() => setShowNegative(!showNegative)}
                className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNegative ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span>{showNegative ? "Hide negative prompt" : "Negative prompt (exclude)"}</span>
              </button>

              {showNegative && (
                <div className="pt-2">
                  <input
                    id="negative-prompt-input"
                    type="text"
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    disabled={busy}
                    placeholder="e.g. blurry, glitch, text watermarks, cartoon"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-border/60" />

          {/* Specs: Resolution, FPS, Duration */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Resolution */}
              <div className="space-y-1.5">
                <span className="text-[11.5px] font-semibold text-muted-foreground">
                  Resolution
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {RESOLUTIONS.map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setResolution(res)}
                      className={cn(
                        "rounded-xl border py-2 text-xs font-semibold transition-all text-center",
                        resolution === res
                          ? "border-foreground bg-foreground text-background shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {res.replace(" Full HD", "").replace(" HD", "")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Rate */}
              <div className="space-y-1.5">
                <span className="text-[11.5px] font-semibold text-muted-foreground">
                  Frame Rate
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {FRAME_RATES.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFps(f)}
                      className={cn(
                        "rounded-xl border py-2 text-xs font-semibold transition-all text-center",
                        fps === f
                          ? "border-foreground bg-foreground text-background shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Duration Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Duration</span>
                <span className="text-foreground">
                  {mode === "long" ? `${durationMinutes} min` : `${durationSecondsShort} sec`}
                </span>
              </div>
              {mode === "long" ? (
                <Slider
                  value={[durationMinutes]}
                  onValueChange={([val]) => setDurationMinutes(val || 3)}
                  min={1}
                  max={15}
                  step={1}
                  disabled={busy}
                  className="py-1"
                />
              ) : (
                <Slider
                  value={[durationSecondsShort]}
                  onValueChange={([val]) => setDurationSecondsShort(val || 15)}
                  min={5}
                  max={60}
                  step={5}
                  disabled={busy}
                  className="py-1"
                />
              )}
            </div>
          </div>

          <div className="h-px bg-border/60" />

          {/* Category & Visual Style */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[11.5px] font-semibold text-muted-foreground">Category</span>
              <Select
                value={category}
                onValueChange={(val) => setCategory(val as (typeof CATEGORIES)[number])}
              >
                <SelectTrigger
                  id="category-selector"
                  className="h-10 w-full rounded-xl border-border bg-background text-xs font-semibold"
                >
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border bg-surface shadow-lg">
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs font-medium py-2">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                Visual Style
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {VISUAL_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setVisualStyle(style)}
                    className={cn(
                      "rounded-xl border py-2 px-2 text-xs font-semibold transition-all text-center truncate",
                      visualStyle === style
                        ? "border-foreground bg-foreground text-background shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-px bg-border/60" />

          {/* Voiceover & Audio Configuration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                Voice Gender
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {VOICE_GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setVoiceGender(g)}
                    className={cn(
                      "rounded-xl border py-2 text-xs font-semibold transition-all text-center",
                      voiceGender === g
                        ? "border-foreground bg-foreground text-background shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                Background Music
              </span>
              <div className="flex h-10 items-center justify-between rounded-xl border border-border bg-background px-3">
                <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                  <Music className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Music</span>
                </div>
                <Switch checked={bgm} onCheckedChange={setBgm} />
              </div>
            </div>
          </div>

          <div className="h-px bg-border/60" />

          {/* Captions & Subtitles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Subtitles className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Captions</span>
              </div>
              <Switch checked={captions} onCheckedChange={setCaptions} />
            </div>

            {captions && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Style</span>
                  <div className="grid grid-cols-3 gap-1">
                    {CAPTION_STYLES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setCaptionStyle(st)}
                        className={cn(
                          "rounded-lg border py-1.5 text-[11px] font-semibold transition-all text-center",
                          captionStyle === st
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Size</span>
                  <div className="grid grid-cols-3 gap-1">
                    {CAPTION_SIZES.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setCaptionSize(sz)}
                        className={cn(
                          "rounded-lg border py-1.5 text-[11px] font-semibold transition-all text-center",
                          captionSize === sz
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Real-Time Progress / Output Tracker */}
        {(busy || status || lines.length > 0) && (
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-foreground">Status</div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase",
                  status === "completed"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : status === "failed"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-foreground/10 text-foreground",
                )}
              >
                {status || "Queued"}
              </span>
            </div>

            {/* Stage Indicators */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { stage: 1, label: "Scripting" },
                { stage: 2, label: "Voiceover" },
                { stage: 3, label: "Render" },
                { stage: 4, label: "Complete" },
              ].map((s) => {
                const isPassed = activeStage > s.stage || status === "completed";
                const isCurrent = activeStage === s.stage && status !== "completed";
                return (
                  <div
                    key={s.stage}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-xl border py-2 px-1 text-[11px] font-semibold transition-all text-center",
                      isPassed
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : isCurrent
                          ? "border-foreground bg-foreground/10 text-foreground"
                          : "border-border/50 bg-background/50 text-muted-foreground/50",
                    )}
                  >
                    {isPassed ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    ) : (
                      <Clock className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{s.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="truncate">{step}</span>
                <span className="font-semibold tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5 rounded-full" />
            </div>

            {/* Collapsible Log Stream */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Terminal className="h-3 w-3" />
                <span>{showLogs ? "Hide logs" : "View terminal logs"}</span>
                {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showLogs && (
                <div className="pt-2">
                  <Console lines={lines} />
                </div>
              )}
            </div>

            {/* Video Playback & Downloads */}
            {clipUrl && (
              <div className="space-y-3 pt-2 border-t border-border">
                <video
                  src={clipUrl}
                  controls
                  playsInline
                  className="w-full rounded-xl border border-border bg-black aspect-video max-h-[320px] object-contain shadow"
                />
                <div className="flex gap-2">
                  <a
                    href={clipUrl}
                    download="rendered-video.mp4"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground text-background py-2.5 text-xs font-bold transition-opacity hover:opacity-90"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download MP4
                  </a>
                  {driveUrl && (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Google Drive
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="pt-1">
          <button
            type="button"
            id="generate-video-action-btn"
            disabled={busy}
            onClick={() => void handleGenerateVideo()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60 shadow-sm"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating ({progress}%)…</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>
                  {mode === "long"
                    ? `Generate Video (${durationMinutes} min)`
                    : `Generate Video (${durationSecondsShort}s)`}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Historical Creations */}
        <div className="pt-4">
          <RecentCreations />
        </div>
      </div>
    </StudioLayout>
  );
}

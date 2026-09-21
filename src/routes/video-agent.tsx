import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  Play,
  Sparkles,
  Film,
  Clapperboard,
  Layers,
  Sliders,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { pageHead } from "@/lib/seo";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import {
  Panel,
  Segment,
  SliderRow,
  SwitchRow,
  TextRow,
  Chips,
} from "@/components/hyper/StudioControls";
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
import { CAPTION_TEMPLATES } from "@/lib/social.shared";
import { ART_STYLES, IMAGE_STYLES, visualStylePrompt } from "@/lib/style-presets";

export const Route = createFileRoute("/video-agent")({
  head: () =>
    pageHead({
      path: "/video-agent",
      title: "Video Agent — Dual-Engine AI Video Pipeline | Hyper Copilot",
      description:
        "Dual-engine video studio: fast short-form 9:16 reels with mini-editor, or 16:9 full HD long-form documentaries powered by the native C++ headless editor.",
      ogTitle: "Video Agent — Dual-Engine Short & Long-Form Video Studio",
      keywords: [
        "AI nature video generator",
        "cosmic story video AI",
        "long-form documentary AI video",
        "C++ headless video editor",
        "AI narrated nature shorts",
        "people free AI video",
      ],
      breadcrumbs: [{ name: "Video Agent", path: "/video-agent" }],
    }),
  component: VideoAgent,
});

const genders = ["Male", "Female"] as const;
const voicePresets = [
  "Cosmic Documentary",
  "Calm Nature Guide",
  "Deep Storyteller",
  "Awe & Wonder",
] as const;

const artStyles = ART_STYLES;
const imageStyles = IMAGE_STYLES;
const motionTemplates = [
  "Auto Zoom-In",
  "Pan & Scan",
  "Dynamic Keyframe",
  "Fade Transitions",
] as const;

const ratios = ["9:16", "16:9"] as const;
const ratioLabels: Record<(typeof ratios)[number], string> = {
  "9:16": "Shorts / Reels",
  "16:9": "Landscape / Cinema",
};

const qualities = ["720p", "1080p"] as const;
const bitrates = ["Standard", "High"] as const;

const guidanceTags = [
  "8K nature detail",
  "deep space",
  "volumetric light",
  "golden hour",
  "aerial drone",
  "macro texture",
  "star field",
] as const;

/**
 * Story themes for humanless nature / cosmic storytelling.
 */
const storyThemes = [
  {
    id: "cosmic",
    name: "Cosmic Universe",
    style: "Photorealistic",
    motion: "Auto Zoom-In",
    voice: "Cosmic Documentary",
    tags: ["deep space", "star field", "volumetric light"],
  },
  {
    id: "nature",
    name: "Nature Beauty",
    style: "Cinematic Film",
    motion: "Pan & Scan",
    voice: "Calm Nature Guide",
    tags: ["8K nature detail", "golden hour", "aerial drone"],
  },
  {
    id: "ocean",
    name: "Ocean & Sky",
    style: "Studio Photography",
    motion: "Fade Transitions",
    voice: "Deep Storyteller",
    tags: ["aerial drone", "volumetric light"],
  },
  {
    id: "micro",
    name: "Micro World",
    style: "Photorealistic",
    motion: "Dynamic Keyframe",
    voice: "Awe & Wonder",
    tags: ["macro texture", "8K nature detail"],
  },
] as const;

type StoryTheme = (typeof storyThemes)[number];

type LogLine = { time: string; text: string; tone?: "ok" | "warn" | "err" };

function Console({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div className="max-h-56 overflow-y-auto rounded-xl bg-surface-2/40 p-3 font-mono text-[11.5px] leading-relaxed">
      {lines.map((l, i) => (
        <p
          key={i}
          className={cn(
            "whitespace-pre-wrap",
            l.tone === "err"
              ? "text-destructive"
              : l.tone === "ok"
                ? "text-spectral-2"
                : l.tone === "warn"
                  ? "text-muted-foreground"
                  : "text-foreground/80",
          )}
        >
          <span className="text-muted-foreground">[{l.time}] </span>
          {l.text}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-11 w-full rounded-2xl border-border bg-background text-[13px] font-semibold focus:ring-ring">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-2xl border-border bg-surface">
          {options.map((o) => (
            <SelectItem
              key={o}
              value={o}
              className="rounded-xl text-[13px] focus:bg-surface-2 focus:text-foreground"
            >
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RatioBlocksWithLabels<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
  disabledOption,
}: {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
  disabledOption?: T;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{label}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = value === o;
          const isDisabled = disabledOption === o;
          return (
            <button
              key={o}
              type="button"
              disabled={isDisabled}
              aria-pressed={active}
              onClick={() => !isDisabled && onChange(o)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 transition-colors",
                isDisabled
                  ? "cursor-not-allowed opacity-40 border-border bg-background"
                  : active
                    ? "border-foreground/25 bg-surface-2 text-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-border-strong hover:bg-surface-2/60",
              )}
            >
              <span className="text-[13px] font-bold">{o}</span>
              <span className="text-[10.5px] font-semibold opacity-70">{labels[o]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VideoAgent() {
  // Mode state: short vs long
  const [mode, setMode] = useState<"short" | "long">("short");

  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [tags, setTags] = useState<string[]>([...storyThemes[0].tags]);

  // Duration: seconds for short-form (1-60s), minutes for long-form (1-15 min)
  const [duration, setDuration] = useState(15);
  const [durationMinutes, setDurationMinutes] = useState(5);

  const [theme, setTheme] = useState<StoryTheme["id"]>(storyThemes[0].id);
  const [gender, setGender] = useState<(typeof genders)[number]>("Male");
  const [preset, setPreset] = useState<(typeof voicePresets)[number]>("Cosmic Documentary");
  const [speed, setSpeed] = useState(110);
  const [pitch, setPitch] = useState(52);
  const [artStyle, setArtStyle] = useState<(typeof artStyles)[number]>(ART_STYLES[0]);
  const [imageStyle, setImageStyle] = useState<(typeof imageStyles)[number]>(IMAGE_STYLES[0]);
  const [motion, setMotion] = useState<(typeof motionTemplates)[number]>("Auto Zoom-In");
  const [captions, setCaptions] = useState(true);
  const [captionTemplate, setCaptionTemplate] = useState<(typeof CAPTION_TEMPLATES)[number]>(
    CAPTION_TEMPLATES[0],
  );
  const [captionScale, setCaptionScale] = useState(4);

  // Aspect ratio: automatically 9:16 for short, 16:9 for long
  const [ratio, setRatio] = useState<(typeof ratios)[number]>("9:16");
  const [quality, setQuality] = useState<(typeof qualities)[number]>("1080p");
  const [bitrate, setBitrate] = useState<(typeof bitrates)[number]>("High");

  const [busy, setBusy] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const queryClient = useQueryClient();

  const log = useCallback((text: string, tone?: LogLine["tone"]) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLines((l) => [...l, tone ? { time, text, tone } : { time, text }]);
  }, []);

  const [videoId, setVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "processing" | "completed" | "failed" | null>(
    null,
  );
  const seenLogs = useRef(0);

  const start = useServerFn(startVideoRender);
  const resolvePlaybackUrl = useServerFn(getVideoPlaybackUrl);

  // Content Mode Selector handler: auto-adjusts aspect ratio and defaults
  const handleModeChange = (nextMode: "short" | "long") => {
    setMode(nextMode);
    if (nextMode === "short") {
      setRatio("9:16");
      if (duration > 60) setDuration(15);
    } else {
      setRatio("16:9");
    }
  };

  // Follow the render row the render pipeline writes progress into.
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
      } else if (typeof row["step"] === "string" && row["step"]) {
        log(`${row["step"]}…`);
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
        const raw = typeof row["video_url"] === "string" ? row["video_url"] : null;
        if (raw && /^https?:\/\//i.test(raw)) {
          setClipUrl(raw);
        } else if (raw) {
          void resolvePlaybackUrl({ data: { videoId: activeId } }).then(({ url }) =>
            setClipUrl(url),
          );
        }

        // Detect Google Drive export link
        if (typeof row["drive_url"] === "string" && row["drive_url"]) {
          setDriveUrl(row["drive_url"]);
        } else {
          for (const entry of rowLogs) {
            const text =
              typeof entry === "string"
                ? entry
                : typeof entry === "object" && entry && "text" in entry
                  ? String((entry as { text: unknown }).text)
                  : JSON.stringify(entry);
            const match = text.match(/https:\/\/drive\.google\.com\/[^\s"')]+/);
            if (match) {
              setDriveUrl(match[0]);
              break;
            }
          }
        }

        log("Render completed successfully!", "ok");
        setBusy(false);
        setVideoId(null);
        void queryClient.invalidateQueries({ queryKey: ["generations"] });
        toast.success("Video ready");
      } else if (rowStatus === "failed") {
        const msg =
          typeof row["error"] === "string" && row["error"] ? row["error"] : "Render failed";
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

    // Safety net: Realtime polling backup
    const poll = window.setInterval(() => {
      void supabase
        .from("videos")
        .select("status, step, logs, video_url, error")
        .eq("id", videoId)
        .maybeSingle()
        .then(({ data }) => apply(data as Record<string, unknown> | null));
    }, 5000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [videoId, log, queryClient, resolvePlaybackUrl]);

  const applyTheme = (next: StoryTheme) => {
    setTheme(next.id);
    setImageStyle(next.style);
    setMotion(next.motion);
    setPreset(next.voice);
    setTags([...next.tags]);
  };

  const activeTheme = storyThemes.find((t) => t.id === theme) ?? storyThemes[0];

  // Flexible duration calculation text helper
  const getFlexibleDurationWindow = (mins: number) => {
    if (mins <= 1) {
      return {
        summary: "1.0 to 1.5 min output window",
        range: "1.0 – 1.5 min (60s – 90s)",
      };
    }
    return {
      summary: `${mins - 1}.0 to ${mins + 1}.0 min output window`,
      range: `${mins - 1}.0 – ${mins + 1}.0 min (${(mins - 1) * 60}s – ${(mins + 1) * 60}s)`,
    };
  };

  const render = async () => {
    if (!prompt.trim()) {
      toast.error("Write the story you want the agent to build first.");
      return;
    }

    setBusy(true);
    setClipUrl(null);
    setDriveUrl(null);
    setStatus("pending");
    setLines([]);
    seenLogs.current = 0;

    const calculatedDurationSec = mode === "long" ? durationMinutes * 60 : duration;

    try {
      log(`$ agent render --mode ${mode} --canvas ${ratio} --target-res ${quality}`);
      if (mode === "long") {
        log(`engine: editor/ (C++ Headless Engine) · 1080p target @ 60 FPS (30 FPS fallback)`);
        log(
          `runtime: target ${durationMinutes} min · window: ${getFlexibleDurationWindow(durationMinutes).range}`,
        );
        log(`asset sourcing: Pexels & Pixabay 1080p API integration`);
        log(`audio dsp: voiceover narration + auto-ducking ambient score`);
      } else {
        log(`engine: mini-editor/ (Short-form Fast Render) · ${duration}s`);
      }
      log(`voice: ${gender} · ${preset} · speed ${speed}% · pitch ${pitch}%`);
      log(`theme: ${activeTheme.name} · humanless visuals enforced`);
      log(`visuals: ${artStyle} · ${imageStyle} · motion ${motion}`);
      log(
        captions ? `captions: ON · ${captionTemplate} · size ${captionScale}` : "captions: OFF",
        captions ? undefined : "warn",
      );

      log("Initializing Video Dispatcher…");

      const enrichedPrompt = prompt.trim();
      const { videoId: id } = await start({
        data: {
          mode,
          prompt: enrichedPrompt,
          negative_prompt: negative.trim(),
          voice_gender: gender.toLowerCase(),
          voice_persona: preset,
          voice_speed: speed,
          voice_pitch: pitch,
          image_style: visualStylePrompt(imageStyle, artStyle),
          motion_template: motion,
          captions,
          caption_style: captionTemplate,
          caption_scale: captionScale,
          aspect_ratio: ratio,
          quality,
          bitrate,
          duration_seconds: calculatedDurationSec,
          duration_minutes: mode === "long" ? durationMinutes : undefined,
        },
      });

      log(`job accepted · id ${id}`, "ok");
      log("waiting for the render pipeline to report back…", "warn");
      setStatus("processing");
      setVideoId(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Render failed";
      log(msg, "err");
      toast.error(msg);
      setStatus("failed");
      setBusy(false);
    }
  };

  return (
    <StudioLayout>
      <div className="space-y-3.5">
        {/* Content Mode Selector: Short-Form vs Long-Form */}
        <div className="rounded-3xl border border-border bg-surface/80 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-primary" />
                <span className="text-[14px] font-bold text-foreground">Content Mode</span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {mode === "short"
                  ? "Short-Form (9:16 Canvas · Fast AI Render via mini-editor)"
                  : "Long-Form (16:9 Canvas · Full HD 1080p C++ Headless Engine)"}
              </p>
            </div>
            <span
              className={cn(
                "hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                mode === "short"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-primary/15 text-primary border border-primary/20",
              )}
            >
              {mode === "short" ? "mini-editor" : "editor (C++)"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleModeChange("short")}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-2xl border p-3.5 text-center transition-all",
                mode === "short"
                  ? "border-foreground/30 bg-surface-2 text-foreground shadow-sm ring-1 ring-foreground/10"
                  : "border-border bg-background text-muted-foreground hover:border-border-strong hover:bg-surface-2/60",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5" />
                <span className="text-[13px] font-bold">Short-Form</span>
              </div>
              <span className="text-[11px] font-medium opacity-70">
                9:16 Aspect · 1-60s Duration
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange("long")}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-2xl border p-3.5 text-center transition-all",
                mode === "long"
                  ? "border-primary/50 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                  : "border-border bg-background text-muted-foreground hover:border-border-strong hover:bg-surface-2/60",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-[13px] font-bold">Long-Form</span>
              </div>
              <span className="text-[11px] font-medium opacity-70">
                16:9 Canvas · 1-15 min Documentary
              </span>
            </button>
          </div>
        </div>

        {/* Story Prompt */}
        <div className="rounded-2xl border border-border bg-surface/60 p-4 sm:p-5">
          <TextRow
            label={mode === "long" ? "Documentary Story Prompt" : "Story prompt"}
            value={prompt}
            onChange={setPrompt}
            rows={4}
            placeholder={
              mode === "long"
                ? "Describe your full-length nature or cosmic documentary (e.g. 'Deep ocean trenches and bioluminescent life in the midnight zone')…"
                : "Tell a short story about the universe or nature…"
            }
          />
        </div>

        {/* Dynamic Duration Panel: Short-Form (1-60s) vs Long-Form (1-15 min with flexible logic) */}
        {mode === "short" ? (
          <Panel title="Video length" summary={`${duration} seconds`}>
            <SliderRow
              label="Seconds"
              value={duration}
              onChange={setDuration}
              min={1}
              max={60}
              suffix="s"
            />
          </Panel>
        ) : (
          <Panel
            title="Documentary Duration"
            summary={`${durationMinutes} min target · ${getFlexibleDurationWindow(durationMinutes).summary}`}
          >
            <div className="space-y-3.5">
              <SliderRow
                label="Target Runtime"
                value={durationMinutes}
                onChange={setDurationMinutes}
                min={1}
                max={15}
                suffix=" min"
              />

              <div className="rounded-2xl border border-border/80 bg-background/80 p-3.5 text-[12px] space-y-2">
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-muted-foreground">Flexible Duration Window</span>
                  <span className="text-primary font-bold">
                    {getFlexibleDurationWindow(durationMinutes).range}
                  </span>
                </div>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                  {durationMinutes === 1
                    ? "Target 1 min output dynamically scales between 1.0 to 1.5 minutes (60s – 90s) to preserve complete narration phrases."
                    : `Target ${durationMinutes} min output dynamically operates within the ±1.0 min window (${durationMinutes - 1}.0 to ${durationMinutes + 1}.0 min) for natural narrative pacing.`}
                </p>
              </div>
            </div>
          </Panel>
        )}

        {/* Long-Form Advanced Engine Controls & Architecture Badge */}
        {mode === "long" ? (
          <div className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <Sliders className="h-4 w-4" />
              <span className="text-[13.5px] font-bold">Headless C++ Engine Architecture</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11.5px]">
              <div className="rounded-xl border border-border bg-surface/70 p-2.5">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>1080p Canvas</span>
                </div>
                <p className="text-muted-foreground mt-1">
                  16:9 native canvas with Pexels & Pixabay HD asset sourcing.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface/70 p-2.5">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Volume2 className="h-3.5 w-3.5 text-primary" />
                  <span>DSP Audio Ducking</span>
                </div>
                <p className="text-muted-foreground mt-1">
                  Auto-attenuates ambient soundtrack under narration speech.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface/70 p-2.5">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>60 FPS Target</span>
                </div>
                <p className="text-muted-foreground mt-1">
                  Ultra-smooth 60 FPS master render with 30 FPS safety fallback.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Themes */}
        <Panel title="Theme" summary={activeTheme.name}>
          <div className="grid grid-cols-2 gap-2">
            {storyThemes.map((t) => {
              const active = t.id === theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyTheme(t)}
                  className={cn(
                    "rounded-2xl border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-foreground/25 bg-surface-2 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-border-strong hover:bg-surface-2/60",
                  )}
                >
                  <span className="block text-[12.5px] font-bold">{t.name}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Negative Prompt */}
        <Panel title="Negative prompt" summary={negative ? "Custom" : "None"}>
          <TextRow
            label="Exclude"
            value={negative}
            onChange={setNegative}
            rows={2}
            placeholder="Buildings, cities, cartoon look, jitter, text watermark…"
          />
        </Panel>

        {/* Visual Guidance Chips */}
        <Panel title="Visual guidance" summary={`${tags.length} selected`}>
          <Chips
            options={guidanceTags}
            values={tags}
            onToggle={(t) =>
              setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
            }
          />
        </Panel>

        {/* Aspect Ratio: highlights active mode canvas */}
        <Panel
          title="Aspect ratio"
          summary={`${ratio} · ${ratioLabels[ratio]} ${mode === "long" ? "(Cinema Mode)" : "(Shorts Mode)"}`}
        >
          <RatioBlocksWithLabels
            options={ratios}
            value={ratio}
            onChange={setRatio}
            labels={ratioLabels}
          />
        </Panel>

        {/* Art & Image Style */}
        <Panel title="Art style" summary={artStyle}>
          <Segment options={artStyles} value={artStyle} onChange={setArtStyle} />
        </Panel>

        <Panel title="Image style" summary={imageStyle}>
          <Segment options={imageStyles} value={imageStyle} onChange={setImageStyle} />
        </Panel>

        {/* Motion */}
        <Panel title="Camera motion" summary={motion}>
          <Segment options={motionTemplates} value={motion} onChange={setMotion} />
        </Panel>

        {/* Narrator Voice */}
        <Panel title="Narrator" summary={`${gender} · ${preset}`}>
          <Segment label="Voice gender" options={genders} value={gender} onChange={setGender} />
          <SelectRow
            label="Narrator persona"
            value={preset}
            options={voicePresets}
            onChange={setPreset}
          />
        </Panel>

        <Panel title="Voice speed" summary={`${speed}%`}>
          <SliderRow
            label="Speed"
            value={speed}
            onChange={setSpeed}
            min={50}
            max={150}
            suffix="%"
          />
        </Panel>

        <Panel title="Voice pitch" summary={`${pitch}%`}>
          <SliderRow label="Pitch" value={pitch} onChange={setPitch} suffix="%" />
        </Panel>

        {/* Captions */}
        <Panel title="Captions" summary={captions ? `${captionTemplate} · ${captionScale}` : "Off"}>
          <SwitchRow label="Captions" checked={captions} onCheckedChange={setCaptions} />
          <SelectRow
            label="Caption template"
            value={captionTemplate}
            options={CAPTION_TEMPLATES}
            onChange={setCaptionTemplate}
          />
          {captions ? (
            <div className="space-y-3 rounded-2xl border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Caption size</span>
                <span className="text-xs font-bold tabular-nums">{captionScale}</span>
              </div>
              <Slider
                value={[captionScale]}
                onValueChange={([value]) =>
                  setCaptionScale(Math.min(10, Math.max(1, Math.round(value ?? 4))))
                }
                min={1}
                max={10}
                step={1}
                aria-label="Caption size"
              />
              <div className="flex items-center justify-center rounded-xl border border-border bg-background p-4">
                <span
                  className="font-bold uppercase tracking-wide"
                  style={{ fontSize: `${10 + captionScale * 5}px`, lineHeight: 1.2 }}
                >
                  CAPTION TEXT
                </span>
              </div>
            </div>
          ) : null}
        </Panel>

        {/* Quality & Bitrate */}
        <Panel title="Quality" summary={quality}>
          <SelectRow label="Quality" value={quality} options={qualities} onChange={setQuality} />
        </Panel>

        <Panel title="Bitrate" summary={bitrate}>
          <SelectRow label="Bitrate" value={bitrate} options={bitrates} onChange={setBitrate} />
        </Panel>

        {/* Live Build & Progress Log */}
        {lines.length > 0 ? (
          <Panel
            title="Render log"
            summary={
              status === "pending"
                ? "Queued"
                : status === "processing"
                  ? "Rendering"
                  : status === "completed"
                    ? "Finished"
                    : status === "failed"
                      ? "Error"
                      : "Ready"
            }
          >
            <Console lines={lines} />
          </Panel>
        ) : null}

        {/* Submit Button */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void render()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 shadow-sm"
        >
          <Play className="h-4 w-4" strokeWidth={2.2} />
          {busy
            ? "Generating…"
            : mode === "long"
              ? `Generate Long-Form (${durationMinutes} min)`
              : `Generate Video (${duration}s)`}
        </button>

        {/* Video Playback & Download */}
        {clipUrl ? (
          <div className="space-y-3">
            <video
              src={clipUrl}
              controls
              playsInline
              className="w-full rounded-2xl border border-border bg-surface"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={clipUrl}
                download="hyper-copilot-video.mp4"
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-[13px] font-bold transition-colors hover:bg-surface-2"
              >
                <Download className="h-4 w-4" strokeWidth={2.2} />
                Download MP4
              </a>
              {driveUrl ? (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-[13px] font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={2.2} />
                  Google Drive
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        <RecentCreations />
      </div>
    </StudioLayout>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Play } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { getVideoPlaybackUrl, startVideoRender } from "@/lib/video-agent.functions";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/video-agent")({
  head: () =>
    pageHead({
      path: "/video-agent",
      title: "Video Agent \u2014 Nature & Cosmic Story Videos | Hyper Copilot",
      description:
        "Turn one idea into a narrated nature or cosmic story video: people-free visuals, documentary voices, motion presets, captions and a live build log.",
      ogTitle: "Video Agent \u2014 Nature & Cosmic AI Story Videos",
      keywords: [
        "AI nature video generator",
        "cosmic story video AI",
        "space documentary AI video",
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
const artStyles = [
  "Cinematic Realism",
  "Anime / Manga",
  "3D Animated",
  "Dark Fantasy",
  "Retro VHS",
] as const;
/** Quality enhancers appended for space / cosmic / nature scenes. */
const sceneEnhancers =
  "photorealistic, IMAX film grain, cinematic volumetric lighting, hyper-detailed textures, Unreal Engine 5 render style, fine optical details";
const imageStyles = [
  "Cosmic Realism",
  "Cinematic Nature",
  "Macro Micro-Detail",
  "Aerial Landscape",
  "Dreamy Painterly",
] as const;
const motionTemplates = [
  "Auto Zoom-In",
  "Pan & Scan",
  "Dynamic Keyframe",
  "Fade Transitions",
] as const;
/** Captions are always clean white text; only the size is selectable. */
const captionSizes = ["Small", "Medium", "Large"] as const;
const ratios = ["9:16", "16:9"] as const;
const ratioLabels: Record<(typeof ratios)[number], string> = {
  "9:16": "Shorts / Reels",
  "16:9": "Landscape",
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
 * Story themes for the humanless nature / cosmic storytelling flow the render
 * pipeline is tuned for: picking one primes the script idea, visual style,
 * motion and guidance tags in a single tap.
 */
const storyThemes = [
  {
    id: "cosmic",
    name: "Cosmic Universe",
    style: "Cosmic Realism",
    motion: "Auto Zoom-In",
    voice: "Cosmic Documentary",
    tags: ["deep space", "star field", "volumetric light"],
  },
  {
    id: "nature",
    name: "Nature Beauty",
    style: "Cinematic Nature",
    motion: "Pan & Scan",
    voice: "Calm Nature Guide",
    tags: ["8K nature detail", "golden hour", "aerial drone"],
  },
  {
    id: "ocean",
    name: "Ocean & Sky",
    style: "Aerial Landscape",
    motion: "Fade Transitions",
    voice: "Deep Storyteller",
    tags: ["aerial drone", "volumetric light"],
  },
  {
    id: "micro",
    name: "Micro World",
    style: "Macro Micro-Detail",
    motion: "Dynamic Keyframe",
    voice: "Awe & Wonder",
    tags: ["macro texture", "8K nature detail"],
  },
] as const;

type StoryTheme = (typeof storyThemes)[number];

const mockPrompt = "";
const mockNegative = "";

type LogLine = { time: string; text: string; tone?: "ok" | "warn" | "err" };

function Console({ lines }: { lines: LogLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);
  return (
    <div className="max-h-52 overflow-y-auto rounded-xl bg-surface-2/40 p-3 font-mono text-[11.5px] leading-relaxed">
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
}: {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{label}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 transition-colors",
                active
                  ? "border-foreground/25 bg-surface-2 text-foreground"
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
  const [prompt, setPrompt] = useState(mockPrompt);
  const [negative, setNegative] = useState(mockNegative);
  const [tags, setTags] = useState<string[]>([...storyThemes[0].tags]);
  const [duration, setDuration] = useState(15);
  const [theme, setTheme] = useState<StoryTheme["id"]>(storyThemes[0].id);

  const [gender, setGender] = useState<(typeof genders)[number]>("Male");
  const [preset, setPreset] = useState<(typeof voicePresets)[number]>("Cosmic Documentary");
  const [speed, setSpeed] = useState(110);
  const [pitch, setPitch] = useState(52);

  const [artStyle, setArtStyle] = useState<(typeof artStyles)[number]>("Cinematic Realism");
  const [imageStyle, setImageStyle] = useState<(typeof imageStyles)[number]>("Cosmic Realism");
  const [motion, setMotion] = useState<(typeof motionTemplates)[number]>("Auto Zoom-In");

  const [captions, setCaptions] = useState(true);
  const [captionSize, setCaptionSize] = useState<(typeof captionSizes)[number]>("Small");

  const [ratio, setRatio] = useState<(typeof ratios)[number]>("9:16");
  const [quality, setQuality] = useState<(typeof qualities)[number]>("1080p");
  const [bitrate, setBitrate] = useState<(typeof bitrates)[number]>("High");

  const [busy, setBusy] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
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

  // Follow the render row the GitHub Actions pipeline writes progress into.
  useEffect(() => {
    if (!videoId) return;
    const activeId = videoId;

    const apply = (row: Record<string, unknown> | null) => {
      if (!row) return;
      const rowLogs = Array.isArray(row["logs"]) ? (row["logs"] as unknown[]) : [];
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

      const status = String(row["status"] ?? "");
      if (
        status === "pending" ||
        status === "processing" ||
        status === "completed" ||
        status === "failed"
      ) {
        setStatus(status);
      }
      if (status === "completed") {
        const raw = typeof row["video_url"] === "string" ? row["video_url"] : null;
        if (raw && /^https?:\/\//i.test(raw)) {
          setClipUrl(raw);
        } else if (raw) {
          void resolvePlaybackUrl({ data: { videoId: activeId } }).then(({ url }) =>
            setClipUrl(url),
          );
        }
        log("render complete", "ok");
        setBusy(false);
        setVideoId(null);
        void queryClient.invalidateQueries({ queryKey: ["generations"] });
        toast.success("Video ready");
      } else if (status === "failed") {
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

    // Safety net: Realtime can miss an update while the tab is backgrounded.
    const poll = window.setInterval(() => {
      void supabase
        .from("videos")
        .select("status, step, logs, video_url, error")
        .eq("id", videoId)
        .maybeSingle()
        .then(({ data }) => apply(data as Record<string, unknown> | null));
    }, 6000);

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

  const render = async () => {
    if (!prompt.trim()) {
      toast.error("Write the story you want the agent to build first.");
      return;
    }
    setBusy(true);
    setClipUrl(null);
    setStatus("pending");
    setLines([]);
    seenLogs.current = 0;
    try {
      log(`$ agent render --duration ${duration}s --ratio ${ratio} --quality ${quality}`);
      log(`voice: ${gender} · ${preset} · speed ${speed}% · pitch ${pitch}%`);
      log(`theme: ${activeTheme.name} · humanless visuals enforced`);
      log(`visuals: ${artStyle} · ${imageStyle} · motion ${motion}`);
      log(
        captions ? `captions: ON · white · ${captionSize}` : "captions: OFF",
        captions ? undefined : "warn",
      );
      log(`encoder: ${quality} · ${bitrate} bitrate`);
      if (tags.length) log(`guidance tags: ${tags.join(", ")}`);
      log("Initializing Video Engine…");

      const isSceneTheme = ["cosmic", "nature", "ocean", "micro"].includes(activeTheme.id);
      const enrichedPrompt = isSceneTheme
        ? `${prompt.trim()}, ${sceneEnhancers}`
        : prompt.trim();

      const { videoId: id } = await start({
        data: {
          prompt: enrichedPrompt,
          negative_prompt: negative.trim(),
          voice_gender: gender.toLowerCase(),
          voice_persona: preset,
          voice_speed: speed,
          voice_pitch: pitch,
          image_style: `${artStyle} · ${imageStyle}`,
          motion_template: motion,
          captions,
          caption_style: `White · ${captionSize}`,
          caption_scale: 4,
          aspect_ratio: ratio,
          quality,
          bitrate,
          duration_seconds: duration,
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
        <div className="rounded-2xl border border-border bg-surface/60 p-4 sm:p-5">
          <TextRow
            label="Story prompt"
            value={prompt}
            onChange={setPrompt}
            rows={4}
            placeholder="Tell a story about the universe or nature…"
          />
        </div>

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

        <Panel title="Negative prompt" summary={negative ? "Custom" : "None"}>
          <TextRow
            label="Exclude"
            value={negative}
            onChange={setNegative}
            rows={2}
            placeholder="Buildings, cities, cartoon look, jitter…"
          />
        </Panel>

        <Panel title="Visual guidance" summary={`${tags.length} selected`}>
          <Chips
            options={guidanceTags}
            values={tags}
            onToggle={(t) =>
              setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
            }
          />
        </Panel>

        <Panel title="Aspect ratio" summary={`${ratio} · ${ratioLabels[ratio]}`}>
          <RatioBlocksWithLabels
            options={ratios}
            value={ratio}
            onChange={setRatio}
            labels={ratioLabels}
          />
        </Panel>

        <Panel title="Art style" summary={artStyle}>
          <Segment options={artStyles} value={artStyle} onChange={setArtStyle} />
        </Panel>

        <Panel title="Image style" summary={imageStyle}>
          <Segment
            options={imageStyles}
            value={imageStyle}
            onChange={setImageStyle}
          />
        </Panel>

        <Panel title="Camera motion" summary={motion}>
          <Segment
            options={motionTemplates}
            value={motion}
            onChange={setMotion}
          />
        </Panel>

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
          <SliderRow label="Speed" value={speed} onChange={setSpeed} min={50} max={150} suffix="%" />
        </Panel>

        <Panel title="Voice pitch" summary={`${pitch}%`}>
          <SliderRow label="Pitch" value={pitch} onChange={setPitch} suffix="%" />
        </Panel>

        <Panel title="Captions" summary={captions ? `White · ${captionSize}` : "Off"}>
          <SwitchRow
            label="Captions"
            checked={captions}
            onCheckedChange={setCaptions}
          />
          {captions ? (
            <Segment
              label="Font size"
              options={captionSizes}
              value={captionSize}
              onChange={setCaptionSize}
            />
          ) : null}
        </Panel>

        <Panel title="Quality" summary={quality}>
          <SelectRow label="Quality" value={quality} options={qualities} onChange={setQuality} />
        </Panel>

        <Panel title="Bitrate" summary={bitrate}>
          <SelectRow label="Bitrate" value={bitrate} options={bitrates} onChange={setBitrate} />
        </Panel>

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

        <button
          type="button"
          disabled={busy}
          onClick={() => void render()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Play className="h-4 w-4" strokeWidth={2.2} />
          {busy ? "Generating…" : "Generate"}
        </button>

        {clipUrl ? (
          <div className="space-y-3">
            <video
              src={clipUrl}
              controls
              playsInline
              className="w-full rounded-2xl border border-border bg-surface"
            />
            <a
              href={clipUrl}
              download="hyper-copilot-video.mp4"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border py-2.5 text-[13px] font-bold transition-colors hover:bg-surface-2"
            >
              <Download className="h-4 w-4" strokeWidth={2.2} />
              Download MP4
            </a>
          </div>
        ) : null}

        <RecentCreations />
      </div>
    </StudioLayout>
  );
}

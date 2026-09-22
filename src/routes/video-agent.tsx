import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Loader2,
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
import { Panel, Segment, SliderRow, SwitchRow, TextRow } from "@/components/hyper/StudioControls";
import { Button } from "@/components/ui/button";
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
const MODES = ["Long-form", "Short-form"] as const;
const STAGES = [
  { stage: 1, label: "Scripting" },
  { stage: 2, label: "Voiceover" },
  { stage: 3, label: "Render" },
  { stage: 4, label: "Complete" },
] as const;

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
        const direct =
          typeof row["direct_download_url"] === "string" ? row["direct_download_url"] : null;
        const raw = direct || (typeof row["video_url"] === "string" ? row["video_url"] : null);
        if (raw && /^https?:\/\//i.test(raw)) {
          setClipUrl(raw);
        } else if (raw) {
          void resolvePlaybackUrl({ data: { videoId: activeId } }).then(({ url }) =>
            setClipUrl(url),
          );
        }

        const fileId = typeof row["file_id"] === "string" ? row["file_id"] : null;
        if (typeof row["drive_url"] === "string" && row["drive_url"]) {
          setDriveUrl(row["drive_url"]);
        } else if (fileId) {
          setDriveUrl(`https://drive.google.com/file/d/${fileId}/view`);
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
      <div className="space-y-3.5">
        <div className="rounded-2xl border border-border bg-surface/50 p-3.5">
          <Segment
            options={MODES}
            value={mode === "long" ? "Long-form" : "Short-form"}
            onChange={(v) => setMode(v === "Long-form" ? "long" : "short")}
          />
          <div className="mt-3.5">
            <TextRow
              label={mode === "long" ? "Documentary idea / topic" : "Short-form idea"}
              value={prompt}
              onChange={setPrompt}
              rows={3}
              placeholder={
                mode === "long"
                  ? "Deep ocean trenches and the creatures that survive there…"
                  : "A 15-second hook about the deepest place on Earth…"
              }
            />
          </div>
          <div className="mt-3.5">
            <TextRow
              label="Negative prompt"
              value={negative}
              onChange={setNegative}
              rows={2}
              placeholder="blurry, glitch, text watermarks, cartoon"
            />
          </div>
        </div>

        <Panel
          title="Format"
          summary={`${mode === "long" ? "16:9" : "9:16"} · ${resolution.replace(" Full HD", "").replace(" HD", "")} · ${fps} · ${mode === "long" ? `${durationMinutes} min` : `${durationSecondsShort}s`}`}
          defaultOpen
        >
          <Segment
            label="Resolution"
            options={RESOLUTIONS}
            value={resolution}
            onChange={setResolution}
          />
          <Segment label="Frame rate" options={FRAME_RATES} value={fps} onChange={setFps} />
          {mode === "long" ? (
            <SliderRow
              label="Duration"
              value={durationMinutes}
              onChange={setDurationMinutes}
              min={1}
              max={15}
              suffix=" min"
            />
          ) : (
            <SliderRow
              label="Duration"
              value={durationSecondsShort}
              onChange={setDurationSecondsShort}
              min={5}
              max={60}
              step={5}
              suffix="s"
            />
          )}
        </Panel>

        <Panel title="Story & style" summary={`${category} · ${visualStyle}`}>
          <Segment label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
          <Segment
            label="Visual style"
            options={VISUAL_STYLES}
            value={visualStyle}
            onChange={setVisualStyle}
          />
        </Panel>

        <Panel title="Audio" summary={`${voiceGender} voice · ${bgm ? "Music on" : "No music"}`}>
          <Segment
            label="Voice gender"
            options={VOICE_GENDERS}
            value={voiceGender}
            onChange={setVoiceGender}
          />
          <SwitchRow
            label="Background music"
            desc="Adds a licensed score under the voiceover"
            checked={bgm}
            onCheckedChange={setBgm}
          />
        </Panel>

        <Panel title="Captions" summary={captions ? `${captionStyle} · ${captionSize}` : "Off"}>
          <SwitchRow
            label="Burn-in captions"
            desc="Word-synced subtitles on the final video"
            checked={captions}
            onCheckedChange={setCaptions}
          />
          {captions ? (
            <>
              <Segment
                label="Style"
                options={CAPTION_STYLES}
                value={captionStyle}
                onChange={setCaptionStyle}
              />
              <Segment
                label="Size"
                options={CAPTION_SIZES}
                value={captionSize}
                onChange={setCaptionSize}
              />
            </>
          ) : null}
        </Panel>

        <Button
          type="button"
          id="generate-video-action-btn"
          disabled={busy}
          onClick={() => void handleGenerateVideo()}
          className="h-11 w-full rounded-full text-[14px] font-bold"
        >
          {busy ? `Generating… ${progress}%` : "Generate"}
        </Button>

        {busy || status || lines.length > 0 ? (
          <div className="space-y-3.5 rounded-2xl border border-border bg-surface/50 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-bold tracking-tight">Render status</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase",
                  status === "completed"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : status === "failed"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-foreground/10 text-foreground",
                )}
              >
                {status ?? "Queued"}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {STAGES.map((s) => {
                const isPassed = activeStage > s.stage || status === "completed";
                const isCurrent = activeStage === s.stage && status !== "completed";
                return (
                  <div
                    key={s.stage}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold",
                      isPassed
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : isCurrent
                          ? "border-border-strong bg-background text-foreground"
                          : "border-border bg-background text-muted-foreground/60",
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

            <div className="space-y-1.5">
              <div className="flex justify-between text-[11.5px] text-muted-foreground">
                <span className="truncate">{step}</span>
                <span className="font-bold tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5 rounded-full" />
            </div>

            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowLogs(!showLogs)}
                className="h-7 px-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>{showLogs ? "Hide logs" : "View logs"}</span>
                {showLogs ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
              {showLogs ? (
                <div className="pt-2">
                  <Console lines={lines} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {clipUrl ? (
          <div className="space-y-2.5">
            <video
              src={clipUrl}
              controls
              playsInline
              className="w-full rounded-2xl border border-border bg-surface"
            />
            <div className="flex gap-2">
              <a
                href={clipUrl}
                download="rendered-video.mp4"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-surface-2"
              >
                <Download className="h-3.5 w-3.5" />
                Download MP4
              </a>
              {driveUrl ? (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-surface-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
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

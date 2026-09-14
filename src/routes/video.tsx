import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { X } from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { Panel, RatioBlocks, Segment, SliderRow, SwitchRow, TextRow } from "@/components/hyper/StudioControls";
import { RecentCreations } from "@/components/hyper/RecentCreations";
import { uploadReference } from "@/lib/generation.functions";
import { runJob } from "@/lib/jobs-runner";
import {
  MAX_SELECTABLE_VIDEO_DURATION,
  VIDEO_DURATIONS,
  VIDEO_FPS,
  VIDEO_RESOLUTIONS,
} from "@/lib/media.shared";

export const Route = createFileRoute("/video")({
  head: () =>
    pageHead({
      path: "/video",
      title: "AI Video Generator \u2014 Video Studio | Hyper Copilot",
      description:
        "Create cinematic AI videos from text or start and end frames with duration, frame rate, camera motion and aspect ratio control.",
      ogTitle: "AI Video Generator \u2014 Hyper Copilot Video Studio",
      keywords: [
        "AI video generator",
        "text to video",
        "image to video AI",
        "cinematic AI video",
        "AI video maker free",
        "start and end frame video AI",
        "AI reels generator",
        "short form video AI",
        "1080p AI video",
      ],
      breadcrumbs: [
        { name: "Video Studio", path: "/video" },
      ],
    }),
  component: VideoStudio,
});

const models = ["Hyper Video Omni"] as const;
const ratios = ["16:9", "9:16", "1:1"] as const;
const resolutions = VIDEO_RESOLUTIONS;
const durations = VIDEO_DURATIONS.map((d) => `${d}s`) as unknown as readonly string[];
const lockedDurations = VIDEO_DURATIONS.filter((d) => d > MAX_SELECTABLE_VIDEO_DURATION).map(
  (d) => `${d}s`,
) as unknown as readonly string[];
const frameRates = VIDEO_FPS.map((f) => `${f} fps`) as unknown as readonly string[];
const cameraMoves = ["Static", "Pan", "Tilt", "Dolly In", "Dolly Out", "Orbit", "Crane", "Handheld"] as const;
const styles = ["Cinematic", "Photoreal", "Anime", "3D Render", "Documentary", "Neon Noir"] as const;

type FrameSlot = "start" | "end";
type FrameFile = { name: string; previewUrl: string; dataUrl: string };

function FrameUpload({
  label,
  note,
  file,
  onPick,
  onClear,
}: {
  label: string;
  note: string;
  file: FrameFile | null;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{label}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{note}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-surface-2"
        >
          {file ? "Replace" : "Upload"}
        </button>
      </div>
      {file ? (
        <div className="relative mt-3 h-24 w-24 overflow-hidden rounded-xl border border-border">
          <img src={file.previewUrl} alt={file.name} className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={onClear}
            className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/85"
          >
            <X className="h-3 w-3" strokeWidth={2.6} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VideoStudio() {
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [model, setModel] = useState<(typeof models)[number]>(models[0]);
  const [ratio, setRatio] = useState<(typeof ratios)[number]>(ratios[0]);
  const [res, setRes] = useState<string>(resolutions[1] ?? "720p");
  const [duration, setDuration] = useState<string>("5s");
  const [fps, setFps] = useState<string>(frameRates[0] ?? "24 fps");
  const [camera, setCamera] = useState<(typeof cameraMoves)[number]>(cameraMoves[0]);
  const [motion, setMotion] = useState(55);
  const [style, setStyle] = useState<(typeof styles)[number]>(styles[0]);
  const [styleStrength, setStyleStrength] = useState(60);
  const [frames, setFrames] = useState<Record<FrameSlot, FrameFile | null>>({
    start: null,
    end: null,
  });
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 999999));
  const [seedLock, setSeedLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const pickFrame = (slot: FrameSlot, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () =>
      setFrames((f) => ({
        ...f,
        [slot]: { name: file.name, previewUrl, dataUrl: String(reader.result ?? "") },
      }));
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the scene you want to create first.");
      return;
    }
    setBusy(true);
    setClipUrl(null);
    toast.success("Generating video…", { description: "This can take a few minutes." });
    try {
      const seconds = Number(duration.replace("s", "")) || 6;
      const frameRate = Number(fps.replace(" fps", "")) || 24;
      const nextSeed = seedLock ? seed : Math.floor(Math.random() * 999999);
      if (!seedLock) setSeed(nextSeed);

      const [startUrl, endUrl] = await Promise.all(
        (["start", "end"] as FrameSlot[]).map(async (slot) => {
          const f = frames[slot];
          if (!f) return undefined;
          const up = await uploadReference({ data: { dataUrl: f.dataUrl } });
          return up.url ?? undefined;
        }),
      );

      const out = await runJob("video", prompt.trim(), {
        prompt: `${prompt.trim()}, ${style.toLowerCase()} look (${styleStrength}% style), ${camera.toLowerCase()} camera move, ${motion > 65 ? "high" : motion < 35 ? "subtle" : "moderate"} motion`,
        negative: negative.trim(),
        aspect: ratio,
        resolution: res,
        frames: Math.round(seconds * frameRate),
        frameRate,
        seed: nextSeed,
        ...(startUrl ? { imageUrl: startUrl } : {}),
        ...(endUrl ? { endImageUrl: endUrl } : {}),
      });
      setClipUrl(out.url ?? null);
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
      toast.success("Video ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Video generation failed");
    } finally {
      setBusy(false);
    }
  };

  const refSummary =
    [frames.start ? "Start frame" : null, frames.end ? "End frame" : null]
      .filter(Boolean)
      .join(" · ") || "None";

  return (
    <StudioLayout>
      <div className="space-y-3.5">
        <div className="rounded-2xl border border-border bg-surface/50 p-3.5">
          <TextRow
            label="Prompt"
            value={prompt}
            onChange={setPrompt}
            rows={3}
            placeholder="A chrome heron gliding over a flooded cathedral at dusk, slow dolly in…"
          />
          <div className="mt-3.5">
            <TextRow
              label="Negative prompt"
              value={negative}
              onChange={setNegative}
              rows={2}
              placeholder="text overlays, watermark, jitter"
            />
          </div>
        </div>

        <Panel title="Model" summary={model}>
          <Segment options={models} value={model} onChange={setModel} />
        </Panel>

        <Panel title="Format" summary={`${ratio} · ${res} · ${duration} · ${fps}`} defaultOpen>
          <RatioBlocks label="Aspect ratio" options={ratios} value={ratio} onChange={setRatio} />
          <Segment label="Resolution" options={resolutions} value={res} onChange={setRes} />
          <Segment
            label="Duration"
            options={durations}
            value={duration}
            onChange={setDuration}
            disabledOptions={lockedDurations}
          />
          <Segment label="Frame rate" options={frameRates} value={fps} onChange={setFps} />
        </Panel>

        <Panel title="Motion & camera" summary={`${camera} · ${motion}% motion`}>
          <Segment label="Camera movement" options={cameraMoves} value={camera} onChange={setCamera} />
          <SliderRow label="Motion strength" value={motion} onChange={setMotion} suffix="%" />
        </Panel>

        <Panel title="Style" summary={`${style} · ${styleStrength}%`}>
          <Segment options={styles} value={style} onChange={setStyle} />
          <SliderRow label="Style strength" value={styleStrength} onChange={setStyleStrength} suffix="%" />
        </Panel>

        <Panel title="Frame references" summary={refSummary}>
          <FrameUpload
            label="Start frame"
            note="Animates from this image (image to video)."
            file={frames.start}
            onPick={(f) => pickFrame("start", f)}
            onClear={() => setFrames((s) => ({ ...s, start: null }))}
          />
          <FrameUpload
            label="End frame"
            note="Optional target frame the clip transitions into."
            file={frames.end}
            onPick={(f) => pickFrame("end", f)}
            onClear={() => setFrames((s) => ({ ...s, end: null }))}
          />
        </Panel>

        <Panel title="Output" summary={seedLock ? `Seed #${seed}` : "Random seed"}>
          <SwitchRow
            label="Lock seed"
            desc={`Reuse seed #${seed} for repeatable results`}
            checked={seedLock}
            onCheckedChange={setSeedLock}
          />
        </Panel>

        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="w-full rounded-full bg-primary py-3 text-[14px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Generating…" : "Generate"}
        </button>

        {clipUrl ? (
          <video
            src={clipUrl}
            controls
            playsInline
            className="w-full rounded-2xl border border-border bg-surface"
          />
        ) : null}

        <RecentCreations />
      </div>
    </StudioLayout>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  AudioLines,
  Check,
  ChevronDown,
  ImageIcon,
  PenTool,
  Plus,
  Ratio,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { RatioTile } from "@/components/hyper/StudioControls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { uploadReference } from "@/lib/generation.functions";
import { runJob } from "@/lib/jobs-runner";
import {
  MAX_SELECTABLE_VIDEO_DURATION,
  SPEECH_TONES,
  TTS_MODELS,
  VIDEO_DURATIONS,
  VIDEO_FPS,
  VIDEO_RESOLUTIONS,
  VOICES,
} from "@/lib/media.shared";
import { ResultsGrid, type GenResult } from "./ResultsGrid";


const modalities = [
  { label: "Image", icon: ImageIcon },
  { label: "Video", icon: Video },
  { label: "Audio", icon: AudioLines },
  { label: "Vector", icon: PenTool },
];

const imageModels = [
  {
    id: "hyper-image-speed",
    name: "Hyper Image Speed",
    note: "Fastest drafts · text to image",
  },
  {
    id: "hyper-image-flash",
    name: "Hyper Image Flash",
    note: "Balanced · text & image to image",
  },
  {
    id: "hyper-image-quality",
    name: "Hyper Image Quality",
    note: "Highest fidelity · text & image to image",
  },
];

const modelsByModality: Record<string, { id: string; name: string; note: string }[]> = {
  Image: imageModels,
  Video: [
    { id: "hyper-video-omni", name: "Hyper Video Omni", note: "Text & image to video" },
  ],
  Audio: TTS_MODELS.map((m) => ({ id: m.id, name: m.name, note: m.note })),

  Vector: imageModels,
};


const ratios = [
  { label: "1:1", note: "Square", w: 1, h: 1 },
  { label: "4:5", note: "Portrait", w: 4, h: 5 },
  { label: "2:3", note: "Portrait tall", w: 2, h: 3 },
  { label: "9:16", note: "Story", w: 9, h: 16 },
  { label: "3:4", note: "Classic portrait", w: 3, h: 4 },
  { label: "4:3", note: "Classic landscape", w: 4, h: 3 },
  { label: "3:2", note: "Photo", w: 3, h: 2 },
  { label: "16:9", note: "Widescreen", w: 16, h: 9 },
  { label: "21:9", note: "Cinematic", w: 21, h: 9 },
];

const styles = [
  { id: "heaven", name: "HEAVEN", note: "Signature spinal style", signature: true },
  { id: "none", name: "None", note: "Model default" },
  { id: "photo", name: "Photographic", note: "Realistic lensing" },
  { id: "cinematic", name: "Cinematic", note: "Filmic grade" },
  { id: "anime", name: "Anime", note: "Cel shaded" },
  { id: "3d", name: "3D Render", note: "Studio CGI" },
  { id: "line", name: "Line Art", note: "Single stroke" },
  { id: "noir", name: "Noir", note: "High contrast B&W" },
];

const advancedModes = [
  { id: "reference", name: "Reference", note: "Match subject from an image" },
  { id: "transform", name: "Transform", note: "Restyle an existing image" },
  { id: "composition", name: "Composition", note: "Keep layout & framing" },
  { id: "palette", name: "Color palette", note: "Borrow colors only" },
  { id: "character", name: "Character", note: "Keep identity consistent" },
  { id: "inpaint", name: "Inpaint", note: "Edit a masked region" },
];

const suggestionsByModality: Record<string, string[]> = {
  Image: [
    "a chrome jellyfish drifting through a neon canyon",
    "editorial product shot of a matte black perfume bottle",
    "isometric cyberpunk apartment, warm rim light",
  ],
  Video: [
    "slow dolly through a rain-soaked neon alley",
    "macro shot of coffee swirling into milk",
    "drone rise over misty mountain ridges at dawn",
  ],
  Audio: [
    "Welcome back — your studio is ready when you are.",
    "A calm lo-fi beat with warm tape hiss",
    "Energetic sports highlight bed with big drums",
  ],
  Vector: [
    "hand-drawn botanical vector set, single line",
    "flat vector app icon of a paper plane",
    "minimal geometric logo mark, two colors",
  ],
};


function Chip({
  icon: Icon,
  glyph,
  children,
  active,
  caret = true,
  onClick,
}: {
  icon?: typeof Ratio;
  glyph?: React.ReactNode;
  children: React.ReactNode;
  active?: boolean;
  caret?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
        active
          ? "border-border-strong bg-surface-2 text-foreground"
          : "border-border bg-surface-2/70 text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {glyph ?? (Icon ? <Icon className="h-[15px] w-[15px]" strokeWidth={1.9} /> : null)}
      <span className="whitespace-nowrap">{children}</span>
      {caret ? <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={2.2} /> : null}
    </button>
  );
}

/** Small dynamic outline that mirrors the selected aspect ratio's shape. */
function RatioGlyph({ w, h }: { w: number; h: number }) {
  const max = 15;
  const scale = Math.min(max / w, max / h);
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-[3px] border-[1.6px] border-current"
      style={{
        width: Math.max(6, Math.round(w * scale)),
        height: Math.max(6, Math.round(h * scale)),
      }}
    />
  );
}

function OptionRow({
  title,
  note,
  selected,
  onClick,
  accent,
}: {
  title: string;
  note?: string | undefined;
  selected?: boolean | undefined;
  onClick: () => void;
  accent?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-2",
        selected && "bg-surface-2",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-semibold",
            accent ? "text-spectral" : "text-foreground",
          )}
        >
          {title}
        </span>
        {note ? (
          <span className="block truncate text-[11px] text-muted-foreground">{note}</span>
        ) : null}
      </span>
      {selected ? <Check className="h-4 w-4 shrink-0 text-foreground" strokeWidth={2.4} /> : null}
    </button>
  );
}

export function PromptComposer() {
  const [active, setActive] = useState("Image");
  const models = modelsByModality[active] ?? imageModels;
  const [value, setValue] = useState("");
  const [model, setModel] = useState(models[0]!);
  const [ratio, setRatio] = useState(ratios[0]!);
  const [style, setStyle] = useState(styles[0]!);
  const [styleStrength, setStyleStrength] = useState([65]);
  const [modes, setModes] = useState<string[]>([]);
  const [referenceWeight, setReferenceWeight] = useState([50]);
  const [refs, setRefs] = useState<
    { id: string; name: string; url: string; dataUrl?: string }[]
  >([]);
  const [count, setCount] = useState([4]);
  const [seedLocked, setSeedLocked] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 999999));
  const [results, setResults] = useState<GenResult[]>([]);
  const [generating, setGenerating] = useState(false);
  // Video settings
  const [videoDuration, setVideoDuration] = useState<number>(MAX_SELECTABLE_VIDEO_DURATION);
  const [videoFps, setVideoFps] = useState<number>(VIDEO_FPS[0] ?? 24);
  const [videoRes, setVideoRes] = useState<string>(VIDEO_RESOLUTIONS[1] ?? "720p");
  // Audio settings
  const [audioMode, setAudioMode] = useState<"speech" | "music">("speech");
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [tone, setTone] = useState<string>(SPEECH_TONES[0]);
  const [pace, setPace] = useState([100]);
  const [musicTempo, setMusicTempo] = useState([120]);
  const [musicSeconds, setMusicSeconds] = useState([30]);
  const [instrumental, setInstrumental] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const startFrameRef = useRef<HTMLInputElement>(null);
  const endFrameRef = useRef<HTMLInputElement>(null);

  /** Video frames: slot 0 = start frame, slot 1 = end frame. */
  const onFrameFile = (slot: 0 | 1, files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const id = `${f.name}-${f.size}-${Math.random()}`;
    setRefs((r) => {
      const next = [...r];
      next[slot] = { id, name: f.name, url: URL.createObjectURL(f) };
      return next.filter(Boolean).slice(0, 2);
    });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setRefs((r) => r.map((x) => (x.id === id ? { ...x, dataUrl } : x)));
    };
    reader.readAsDataURL(f);
  };



  const toggleMode = (id: string) =>
    setModes((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  /** Only surface controls the active modality + model actually supports. */
  const supportsRatio = active !== "Audio";
  const supportsStyle = active !== "Audio";
  const supportsReferences =
    active === "Video" ||
    ((active === "Image" || active === "Vector") && model.id !== "hyper-image-speed");

  const availableModes = useMemo(() => {
    if (active !== "Image" && active !== "Vector") return [];
    if (!supportsReferences) return [];
    if (active === "Vector") return advancedModes.filter((m) => m.id !== "inpaint");
    return advancedModes;
  }, [active, supportsReferences]);

  const activeRatios = useMemo(
    () => (active === "Video" ? ratios.filter((r) => r.label !== "21:9") : ratios),
    [active],
  );

  const activeSuggestions = suggestionsByModality[active] ?? suggestionsByModality["Image"]!;

  const settingsIcon = active === "Audio" ? AudioLines : SlidersHorizontal;
  const settingsLabel = useMemo(() => {
    if (active === "Video") return `${videoDuration}s · ${videoFps}fps · ${videoRes}`;
    if (active === "Audio") return audioMode === "speech" ? `Speech · ${voice}` : "Music";
    if (modes.length === 0) return `${count[0]}× output`;
    const first = advancedModes.find((m) => m.id === modes[0])?.name ?? "Advanced";
    return modes.length > 1 ? `${first} +${modes.length - 1}` : first;
  }, [active, videoDuration, videoFps, videoRes, audioMode, voice, modes, count]);
  const settingsActive = active === "Video" || active === "Audio" || modes.length > 0;

  useEffect(() => {
    if (!activeRatios.some((r) => r.label === ratio.label)) setRatio(activeRatios[0]!);
    if (!supportsReferences && active !== "Audio" && modes.length) setModes([]);
  }, [activeRatios, ratio.label, supportsReferences, active, modes.length]);


  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const chosen = Array.from(files).slice(0, 4);
    chosen.forEach((f) => {
      const id = `${f.name}-${f.size}-${Math.random()}`;
      setRefs((r) => [...r, { id, name: f.name, url: URL.createObjectURL(f) }].slice(0, 4));
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        setRefs((r) => r.map((x) => (x.id === id ? { ...x, dataUrl } : x)));
      };
      reader.readAsDataURL(f);
    });
    if (chosen.length && modes.length === 0) setModes(["reference"]);
  };

  const referenceUrls = async () => {
    const withData = refs.filter((r) => r.dataUrl);
    const uploaded = await Promise.all(
      withData.map((r) => uploadReference({ data: { dataUrl: r.dataUrl! } })),
    );
    return uploaded.map((u) => u.url).filter((u): u is string => !!u);
  };

  const promptWithStyle = (prompt: string) =>
    style.name && style.name !== "None" ? `${prompt}. ${style.name} style` : prompt;

  const generate = async () => {
    if (!value.trim()) {
      toast.error("Describe what you want to create first.");
      return;
    }
    const prompt = value.trim();
    const nextSeed = seedLocked ? seed : Math.floor(Math.random() * 999999);
    if (!seedLocked) setSeed(nextSeed);
    setGenerating(true);

    try {
      if (active === "Audio") {
        const ph: GenResult = {
          id: `${Date.now()}`,
          prompt,
          dataUrl: "",
          isFinal: false,
          kind: "audio",
          model: model.name,
          ratioLabel: audioMode === "speech" ? `Speech · ${voice}` : "Music",
          styleName: audioMode === "speech" ? tone : "Music",
        };
        setResults((r) => [ph, ...r]);
        toast.success(audioMode === "speech" ? "Generating speech…" : "Composing music…");
        const res =
          audioMode === "speech"
            ? await runJob("speech", prompt, {
                text: prompt,
                voice,
                model: model.id,
                tone,
                pace: pace[0] ?? 100,
              })
            : await runJob("music", prompt, {
                prompt,
                tempo: musicTempo[0] ?? 120,
                seconds: musicSeconds[0] ?? 30,
                instrumental,
              });
        setResults((list) =>
          list.map((r) => (r.id === ph.id ? { ...r, dataUrl: res.url ?? "", isFinal: true } : r)),
        );
        return;
      }

      if (active === "Video") {
        const ph: GenResult = {
          id: `${Date.now()}`,
          prompt,
          dataUrl: "",
          isFinal: false,
          kind: "video",
          model: model.name,
          ratioLabel: `${ratio.label} · ${videoRes} · ${videoDuration}s`,
          styleName: style.name,
        };
        setResults((r) => [ph, ...r]);
        toast.success("Generating video…", { description: "This can take a few minutes." });
        const urls = await referenceUrls();
        const res = await runJob("video", prompt, {
          prompt: promptWithStyle(prompt),
          aspect: ratio.label,
          resolution: videoRes,
          frames: Math.round(videoDuration * videoFps),
          frameRate: videoFps,
          seed: nextSeed,
          ...(urls[0] ? { imageUrl: urls[0] } : {}),
          ...(urls[1] ? { endImageUrl: urls[1] } : {}),
        });
        setResults((list) =>
          list.map((r) => (r.id === ph.id ? { ...r, dataUrl: res.url ?? "", isFinal: true } : r)),
        );
        return;
      }

      // Image / Vector
      const n = count[0] ?? 4;
      const baseId = `${Date.now()}`;
      const placeholders: GenResult[] = Array.from({ length: n }, (_, i) => ({
        id: `${baseId}-${i}`,
        prompt,
        dataUrl: "",
        isFinal: false,
        kind: "image" as const,
        model: model.name,
        ratioLabel: ratio.label,
        styleName: style.name,
      }));
      setResults((r) => [...placeholders, ...r]);
      toast.success(`Generating ${n} image${n === 1 ? "" : "s"}…`, {
        description: `${model.name} · ${ratio.label} · ${style.name}`,
      });

      const urls = model.id === "hyper-image-speed" ? [] : await referenceUrls();
      if (urls.length && model.id === "hyper-image-speed") {
        toast.info("Hyper Image Speed is text to image only — references were ignored.");
      }

      await Promise.all(
        placeholders.map(async (ph, i) => {
          try {
            const res = await runJob("image", prompt, {
              prompt: active === "Vector" ? `${prompt}. flat vector illustration, clean shapes` : prompt,
              model: model.id,
              aspect: ratio.label,
              seed: nextSeed + i,
              referenceUrls: urls,
              style: style.name,
              styleStrength: styleStrength[0] ?? 65,
              referenceModes: modes,
              referenceWeight: referenceWeight[0] ?? 50,
            });
            setResults((list) =>
              list.map((r) => (r.id === ph.id ? { ...r, dataUrl: res.url ?? "", isFinal: true } : r)),
            );
          } catch (err) {
            setResults((list) =>
              list.map((r) =>
                r.id === ph.id
                  ? {
                      ...r,
                      prompt: `Failed to generate (${err instanceof Error ? err.message : "error"})`,
                    }
                  : r,
              ),
            );
          }
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };


  return (
    <div className="w-full">
      {/* Modality switcher */}
      <div className="mx-auto mb-4 flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface/70 p-1 backdrop-blur-xl sm:w-fit [&::-webkit-scrollbar]:hidden">
        {modalities.map((m) => {
          const Icon = m.icon;
          const isActive = active === m.label;
          return (
            <button
              key={m.label}
              type="button"
              onClick={() => {
                setActive(m.label);
                setModel((modelsByModality[m.label] ?? imageModels)[0]!);
              }}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.9} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Composer */}
      <div className="ring-spectral shadow-glow rounded-3xl">
        <div className="glass rounded-3xl p-2.5 sm:p-3">
          {refs.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2 px-1.5 pt-1.5">
              {refs.map((r) => (
                <span
                  key={r.id}
                  className="group relative h-14 w-14 overflow-hidden rounded-xl border border-border"
                >
                  <img src={r.url} alt={r.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${r.name}`}
                    onClick={() => setRefs((list) => list.filter((x) => x.id !== r.id))}
                    className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground"
                  >
                    <X className="h-3 w-3" strokeWidth={2.6} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-start gap-2.5 px-1.5 pt-1.5">
            <Sparkles className="mt-0.5 h-[18px] w-[18px] shrink-0 text-spectral-2" strokeWidth={2} />
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  generate();
                }
              }}
              rows={2}
              placeholder={`Describe the ${active.toLowerCase()} you want to generate…`}
              className="min-h-[52px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground sm:text-base"
            />
          </div>

          <div className="mt-2 flex items-end gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
              {active === "Video" ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <input
                    ref={startFrameRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onFrameFile(0, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={endFrameRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onFrameFile(1, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {([0, 1] as const).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      aria-label={slot === 0 ? "Upload start frame" : "Upload end frame"}
                      title={slot === 0 ? "Start frame" : "End frame"}
                      onClick={() =>
                        (slot === 0 ? startFrameRef : endFrameRef).current?.click()
                      }
                      className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-2/70 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                    >
                      {refs[slot] ? (
                        <img
                          src={refs[slot]!.url}
                          alt={slot === 0 ? "Start frame" : "End frame"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex items-center gap-px">
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                          <span className="text-[10px] font-bold">{slot + 1}</span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : supportsReferences ? (
                <button
                  type="button"
                  aria-label="Add reference image"
                  onClick={() => fileRef.current?.click()}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2/70 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.2} />
                </button>
              ) : null}

              {/* Model */}
              <Popover>
                <PopoverTrigger asChild>
                  <span>
                    <Chip icon={Wand2}>{model.name}</Chip>
                  </span>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(17rem,calc(100vw-2rem))] p-1.5">
                  <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {active} model
                  </p>
                  {models.map((m) => (
                    <OptionRow
                      key={m.id}
                      title={m.name}
                      note={m.note}
                      selected={m.id === model.id}
                      onClick={() => setModel(m)}
                    />
                  ))}
                </PopoverContent>
              </Popover>

              {/* Aspect ratio — visual */}
              {supportsRatio ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <span>
                      <Chip glyph={<RatioGlyph w={ratio.w} h={ratio.h} />}>{ratio.label}</Chip>
                    </span>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[min(20rem,calc(100vw-2rem))] p-2.5"
                  >
                    <p className="pb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Aspect ratio
                    </p>
                    <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex w-max snap-x snap-mandatory gap-2">
                        {activeRatios.map((r) => (
                          <RatioTile
                            key={r.label}
                            ratio={r.label}
                            active={r.label === ratio.label}
                            onClick={() => setRatio(r)}
                          />
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}

              {/* Style */}
              {supportsStyle ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <span>
                      <Chip icon={Sparkles} active={style.id === "heaven"}>
                        {style.name}
                      </Chip>
                    </span>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] p-1.5">
                    <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Style
                    </p>
                    <div className="max-h-56 overflow-y-auto">
                      {styles.map((s) => (
                        <OptionRow
                          key={s.id}
                          title={s.name}
                          note={s.note}
                          accent={s.signature}
                          selected={s.id === style.id}
                          onClick={() => setStyle(s)}
                        />
                      ))}
                    </div>
                    <div className="mt-1 border-t border-border px-2.5 pb-1 pt-3">
                      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-foreground">
                        <span>Style strength</span>
                        <span className="text-muted-foreground">{styleStrength[0]}%</span>
                      </div>
                      <Slider
                        value={styleStrength}
                        onValueChange={setStyleStrength}
                        max={100}
                        step={1}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}

              {/* Per-modality settings */}
              <Popover>
                <PopoverTrigger asChild>
                  <span>
                    <Chip icon={settingsIcon} active={settingsActive}>
                      {settingsLabel}
                    </Chip>
                  </span>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-h-[70vh] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto p-2.5"
                >
                  <p className="pb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {active} settings
                  </p>

                  {active === "Video" ? (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1.5 text-[12px] font-semibold">Duration</p>
                        <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          <div className="flex w-max gap-1.5">
                            {VIDEO_DURATIONS.map((d) => {
                              const locked = d > MAX_SELECTABLE_VIDEO_DURATION;
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  disabled={locked}
                                  onClick={() => !locked && setVideoDuration(d)}
                                  className={cn(
                                    "shrink-0 rounded-xl border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                                    locked
                                      ? "cursor-not-allowed border-border opacity-40"
                                      : videoDuration === d
                                        ? "border-border-strong bg-surface-2"
                                        : "border-border hover:bg-surface-2",
                                  )}
                                >
                                  {d}s
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[12px] font-semibold">Frame rate</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {VIDEO_FPS.map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setVideoFps(f)}
                              className={cn(
                                "rounded-xl border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                                videoFps === f
                                  ? "border-border-strong bg-surface-2"
                                  : "border-border hover:bg-surface-2",
                              )}
                            >
                              {f} fps
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[12px] font-semibold">Resolution</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {VIDEO_RESOLUTIONS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setVideoRes(r)}
                              className={cn(
                                "rounded-xl border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                                videoRes === r
                                  ? "border-border-strong bg-surface-2"
                                  : "border-border hover:bg-surface-2",
                              )}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {active === "Audio" ? (
                    <div>
                      <div className="mb-3 grid grid-cols-2 gap-1.5">
                        {(["speech", "music"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setAudioMode(m)}
                            className={cn(
                              "rounded-xl border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                              audioMode === m
                                ? "border-border-strong bg-surface-2"
                                : "border-border hover:bg-surface-2",
                            )}
                          >
                            {m === "speech" ? "Text to speech" : "Text to music"}
                          </button>
                        ))}
                      </div>
                      {audioMode === "speech" ? (
                        <div className="space-y-3">
                          <div>
                            <p className="mb-1.5 text-[12px] font-semibold">Voice</p>
                            <div className="max-h-44 overflow-y-auto rounded-xl border border-border p-1">
                              {VOICES.map((v) => (
                                <OptionRow
                                  key={v.id}
                                  title={v.label}
                                  note={v.note}
                                  selected={voice === v.id}
                                  onClick={() => setVoice(v.id)}
                                />
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[12px] font-semibold">Tone</p>
                            <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              <div className="flex w-max snap-x snap-mandatory gap-1.5">
                                {SPEECH_TONES.map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTone(t)}
                                    className={cn(
                                      "shrink-0 snap-start whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                                      tone === t
                                        ? "border-border-strong bg-surface-2"
                                        : "border-border hover:bg-surface-2",
                                    )}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between text-[12px] font-semibold">
                              <span>Pace</span>
                              <span className="text-muted-foreground">{pace[0]}%</span>
                            </div>
                            <Slider
                              value={pace}
                              onValueChange={setPace}
                              min={70}
                              max={130}
                              step={1}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <div className="mb-2 flex items-center justify-between text-[12px] font-semibold">
                              <span>Tempo</span>
                              <span className="text-muted-foreground">{musicTempo[0]} BPM</span>
                            </div>
                            <Slider
                              value={musicTempo}
                              onValueChange={setMusicTempo}
                              min={40}
                              max={220}
                              step={1}
                            />
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between text-[12px] font-semibold">
                              <span>Duration</span>
                              <span className="text-muted-foreground">{musicSeconds[0]}s</span>
                            </div>
                            <Slider
                              value={musicSeconds}
                              onValueChange={setMusicSeconds}
                              min={10}
                              max={120}
                              step={5}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold">Instrumental only</span>
                            <Switch checked={instrumental} onCheckedChange={setInstrumental} />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {active === "Image" || active === "Vector" ? (
                    <div>
                      {availableModes.length ? (
                        <div className="mb-1">
                          {availableModes.map((m) => (
                            <OptionRow
                              key={m.id}
                              title={m.name}
                              note={m.note}
                              selected={modes.includes(m.id)}
                              onClick={() => toggleMode(m.id)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="pb-2 text-[11px] text-muted-foreground">
                          {model.name} is text to image only.
                        </p>
                      )}
                      <div className="space-y-3 border-t border-border pt-3">
                        <div>
                          <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-foreground">
                            <span>Variations</span>
                            <span className="text-muted-foreground">{count[0]}</span>
                          </div>
                          <Slider value={count} onValueChange={setCount} min={1} max={8} step={1} />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-foreground">
                            Lock seed
                            <span className="ml-1.5 font-normal text-muted-foreground">#{seed}</span>
                          </span>
                          <Switch checked={seedLocked} onCheckedChange={setSeedLocked} />
                        </div>
                        {supportsReferences ? (
                          <>
                            <div>
                              <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-foreground">
                                <span>Reference influence</span>
                                <span className="text-muted-foreground">{referenceWeight[0]}%</span>
                              </div>
                              <Slider value={referenceWeight} onValueChange={setReferenceWeight} min={0} max={100} step={1} />
                            </div>
                            <button
                              type="button"
                              onClick={() => fileRef.current?.click()}
                              className="w-full rounded-xl border border-border px-3 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-surface-2"
                            >
                              Upload image {refs.length ? `(${refs.length})` : ""}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>

              <Chip
                icon={Shuffle}
                caret={false}
                onClick={() =>
                  setValue(activeSuggestions[Math.floor(Math.random() * activeSuggestions.length)]!)
                }
              >
                Surprise me
              </Chip>
            </div>


            <button
              type="button"
              aria-label="Generate"
              onClick={generate}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-[1.04] active:scale-95"
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {activeSuggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(s)}
            className="max-w-full truncate rounded-full border border-border bg-surface/60 px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:text-[12px]"
          >
            {s}
          </button>
        ))}
      </div>


      <ResultsGrid results={results} generating={generating} />
    </div>
  );
}

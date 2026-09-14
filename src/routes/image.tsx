import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { Chips, Panel, RatioBlocks, Segment, SliderRow, TextRow } from "@/components/hyper/StudioControls";
import { RecentCreations } from "@/components/hyper/RecentCreations";
import { Button } from "@/components/ui/button";
import { uploadReference } from "@/lib/generation.functions";
import { runJob } from "@/lib/jobs-runner";

export const Route = createFileRoute("/image")({
  head: () =>
    pageHead({
      path: "/image",
      title: "AI Image Generator \u2014 Image Studio | Hyper Copilot",
      description:
        "Generate photoreal AI images from text with aspect ratio, style, reference image and variation controls in Hyper Copilot's Image Studio.",
      ogTitle: "AI Image Generator \u2014 Hyper Copilot Image Studio",
      keywords: [
        "AI image generator",
        "text to image",
        "photoreal AI images",
        "image to image AI",
        "AI art generator",
        "free AI image maker",
        "4K AI image",
        "product photo AI",
        "AI reference image generator",
        "stable diffusion alternative",
        "AI poster generator",
        "aspect ratio image AI",
      ],
      breadcrumbs: [
        { name: "Image Studio", path: "/image" },
      ],
    }),
  component: ImageStudio,
});

const ratios = ["1:1", "4:5", "3:2", "16:9", "9:16", "21:9", "2:3", "3:4", "5:4"] as const;
const resolutions = ["1K", "2K", "4K", "8K"] as const;
const styles = ["HEAVEN", "Photoreal", "Cinematic", "Anime", "3D Render", "Line Art", "Neon Noir"] as const;
const refModes = ["Reference", "Transform", "Composition", "Palette", "Character", "Inpaint", "Depth", "Pose"];

function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [ratio, setRatio] = useState<(typeof ratios)[number]>(ratios[0]);
  const [res, setRes] = useState<(typeof resolutions)[number]>(resolutions[1]);
  const [style, setStyle] = useState<(typeof styles)[number]>(styles[0]);
  const [strength, setStrength] = useState(65);
  const [modes, setModes] = useState<string[]>(["Reference"]);
  const [refWeight, setRefWeight] = useState(50);
  const [count, setCount] = useState(4);
  const [references, setReferences] = useState<{ id: string; name: string; url: string; dataUrl: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const onFiles = (files: FileList | null) => {
    for (const file of Array.from(files ?? []).slice(0, 4 - references.length)) {
      const reader = new FileReader();
      const id = `${file.name}-${file.size}-${Math.random()}`;
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        setReferences((current) => [...current, { id, name: file.name, url: URL.createObjectURL(file), dataUrl }].slice(0, 4));
      };
      reader.readAsDataURL(file);
    }
  };

  const generate = useMutation({
    mutationFn: async () => {
      const uploaded = await Promise.all(
        references.map((reference) => uploadReference({ data: { dataUrl: reference.dataUrl } })),
      );
      const referenceUrls = uploaded.map((item) => item.url).filter((url): url is string => Boolean(url));
      return Promise.all(Array.from({ length: count }, (_, index) => runJob("image", prompt.trim(), {
        prompt: prompt.trim(),
        negativePrompt: negative.trim(),
        model: referenceUrls.length ? "hyper-image-flash" : "hyper-image-speed",
        aspect: ratio,
        resolution: res,
        style,
        styleStrength: strength,
        referenceModes: modes,
        referenceWeight: refWeight,
        referenceUrls,
        seed: Math.floor(Math.random() * 999999) + index,
      })));
    },
    onSuccess: () => {
      toast.success(`Generated ${count} render${count === 1 ? "" : "s"}`);
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Generation failed"),
  });

  return (
    <StudioLayout>
      <div className="space-y-3.5">
        <div className="rounded-2xl border border-border bg-surface/50 p-3.5">
          <TextRow
            label="Prompt"
            value={prompt}
            onChange={setPrompt}
            rows={3}
            placeholder="A chrome heron standing in a flooded cathedral, volumetric light…"
          />
          <div className="mt-3.5">
            <TextRow
              label="Negative prompt"
              value={negative}
              onChange={setNegative}
              rows={2}
              placeholder="text, watermark, extra fingers"
            />
          </div>
        </div>

        <Panel title="Canvas" summary={`${ratio} · ${res}`}>
          <RatioBlocks label="Aspect ratio" options={ratios} value={ratio} onChange={setRatio} />
          <Segment label="Resolution" options={resolutions} value={res} onChange={setRes} />
        </Panel>

        <Panel title="Style" summary={`${style} · ${strength}%`}>
          <Segment options={styles} value={style} onChange={setStyle} />
          <SliderRow label="Style strength" value={strength} onChange={setStrength} suffix="%" />
        </Panel>

        <Panel title="Reference & advanced" summary={modes.join(", ") || "None"}>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {references.map((reference) => (
              <div key={reference.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border">
                <img src={reference.url} alt={reference.name} className="h-full w-full object-cover" />
                <Button type="button" variant="secondary" size="icon" aria-label={`Remove ${reference.name}`} onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))} className="absolute right-1 top-1 h-6 w-6 rounded-full">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {references.length < 4 ? (
              <Button type="button" variant="outline" size="icon" aria-label="Add reference image" onClick={() => fileRef.current?.click()} className="h-16 w-16 shrink-0">
                <Plus />
              </Button>
            ) : null}
          </div>
          <Chips
            options={refModes}
            values={modes}
            onToggle={(v) => setModes((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]))}
          />
          <SliderRow label="Reference influence" value={refWeight} onChange={setRefWeight} suffix="%" />
        </Panel>

        <Panel title="Output" summary={`${count} variations`}>
          <SliderRow label="Variations" value={count} onChange={setCount} min={1} max={8} />
        </Panel>

        <Button
          type="button"
          disabled={generate.isPending}
          onClick={() => prompt.trim() ? generate.mutate() : toast.error("Describe what you want to create first.")}
          className="h-11 w-full rounded-full text-[14px] font-bold"
        >
          {generate.isPending ? "Generating…" : "Generate"}
        </Button>

        <RecentCreations />
      </div>
    </StudioLayout>
  );
}

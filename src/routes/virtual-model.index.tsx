import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import {
  Chips,
  Panel,
  RatioBlocks,
  Segment,
  SliderRow,
  SwitchRow,
  TextRow,
} from "@/components/hyper/StudioControls";
import { ModelRail, type VirtualModel } from "@/components/hyper/ModelRail";
import { RecentCreations } from "@/components/hyper/RecentCreations";
import { deleteVirtualModel, listVirtualModels } from "@/lib/virtual-model.functions";
import { runJob } from "@/lib/jobs-runner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/virtual-model/")({
  head: () =>
    pageHead({
      path: "/virtual-model",
      title: "AI Influencer Generator \u2014 Virtual Model Studio | Hyper Copilot",
      description:
        "Create face-consistent AI influencers and virtual models with wardrobe, scene, lighting, lens and framing control from a reusable character profile.",
      ogTitle: "AI Influencer Generator \u2014 Virtual Model Studio",
      keywords: [
        "AI influencer generator",
        "virtual model AI",
        "consistent character AI",
        "AI fashion model",
        "virtual influencer creator",
        "AI UGC model",
        "face consistent AI images",
        "AI model photoshoot",
      ],
      breadcrumbs: [
        { name: "Virtual Model", path: "/virtual-model" },
      ],
    }),
  component: VirtualModelStudio,
});

const ratios = ["1:1", "4:5", "3:2", "16:9", "9:16", "2:3", "3:4"] as const;
const resolutions = ["1K", "2K", "4K", "8K"] as const;
const outfits = ["Streetwear", "Couture", "Denim", "Business", "Athleisure", "Gown", "Traditional"];
const accessories = ["Sunglasses", "Earrings", "Necklace", "Watch", "Cap", "Handbag"];
const backgrounds = ["Studio", "City", "Café", "Beach", "Rooftop", "Interior", "Nature", "Neon"] as const;
const lighting = ["Softbox", "Golden hour", "Rembrandt", "Ring", "Neon", "Flash", "Backlit"] as const;
const shots = ["Portrait", "Half body", "Full body", "Close-up", "Wide"] as const;
const lenses = ["24mm", "35mm", "50mm", "85mm", "135mm"] as const;

function VirtualModelStudio() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: saved } = useQuery({
    queryKey: ["virtual-models"],
    queryFn: () => listVirtualModels(),
    // While a profile is still being built, keep the processing card fresh.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((m) => m.status !== "ready" && m.status !== "failed") ? 5000 : false,
  });
  const models: VirtualModel[] = (saved ?? [])
    .filter((m) => m.status !== "failed")
    .map((m) => ({
      id: m.id,
      name: m.name,
      meta: m.description,
      headshotUrl: m.headshotUrl,
      status: m.status,
    }));

  const [selected, setSelected] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VirtualModel | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const remove = useMutation({
    mutationFn: (id: string) => deleteVirtualModel({ data: { id } }),
    onSuccess: (_r, id) => {
      toast.success("Model deleted");
      if (selected === id) setSelected(null);
      setPendingDelete(null);
      setConfirmName("");
      void queryClient.invalidateQueries({ queryKey: ["virtual-models"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [ratio, setRatio] = useState<(typeof ratios)[number]>("4:5");
  const [res, setRes] = useState<(typeof resolutions)[number]>("2K");
  const [outfit, setOutfit] = useState<string[]>(["Streetwear"]);
  const [acc, setAcc] = useState<string[]>([]);
  const [bg, setBg] = useState<(typeof backgrounds)[number]>(backgrounds[0]);
  const [light, setLight] = useState<(typeof lighting)[number]>(lighting[0]);
  const [shot, setShot] = useState<(typeof shots)[number]>(shots[2]);
  const [lens, setLens] = useState<(typeof lenses)[number]>(lenses[3]);
  const [depth, setDepth] = useState(35);
  const [detail, setDetail] = useState(85);
  const [consistency, setConsistency] = useState(92);
  const [count, setCount] = useState(4);
  const [upscale, setUpscale] = useState(true);
  const [faceLock, setFaceLock] = useState(true);

  const model = models.find((m) => m.id === selected) ?? null;
  // Wardrobe, scene, camera and output settings are sent as structured fields
  // and turned into prompt clauses server-side, so each control has real effect.
  const scenePrompt = () => prompt.trim();


  const render = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a model first.");
      const runs = Array.from({ length: count }, (_, i) =>
        runJob("character-image", scenePrompt(), {
          modelId: selected,
          prompt: scenePrompt(),
          negativePrompt: negative.trim(),
          aspect: ratio,
          shot,
          consistency,
          detail,
          faceLock,
          variation: i,
          outfit,
          accessories: acc,
          background: bg,
          lighting: light,
          lens,
          depth,
          resolution: res,
          upscale,
        }),
      );
      return Promise.all(runs);
    },

    onSuccess: () => {
      toast.success(`Generated ${count} render${count === 1 ? "" : "s"}`);
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Generation failed"),
  });

  const toggle = (setter: (fn: (v: string[]) => string[]) => void) => (v: string) =>
    setter((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));

  return (
    <StudioLayout>
      <div className="space-y-3.5">
        <div>
          <ModelRail
            models={models}
            selectedId={selected}
            onSelect={setSelected}
            onCreate={() => navigate({ to: "/virtual-model/create-model" })}
            onLongPress={(m) => {
              setConfirmName("");
              setPendingDelete(m);
            }}
          />
        </div>

        <div className="rounded-2xl border border-border bg-surface/50 p-3.5">
          <TextRow
            label="Prompt"
            value={prompt}
            onChange={setPrompt}
            rows={3}
            placeholder="Walking through Tokyo at dusk, oversized leather jacket, candid editorial energy…"
          />
          <div className="mt-3.5">
            <TextRow
              label="Negative prompt"
              value={negative}
              onChange={setNegative}
              rows={2}
              placeholder="plastic skin, extra fingers, text, watermark"
            />
          </div>
        </div>

        <Panel title="Canvas" summary={`${ratio} · ${res}`}>
          <RatioBlocks label="Aspect ratio" options={ratios} value={ratio} onChange={setRatio} />
          <Segment label="Resolution" options={resolutions} value={res} onChange={setRes} />
        </Panel>

        <Panel title="Wardrobe" summary={[...outfit, ...acc].join(", ") || "None"}>
          <Chips label="Outfit" options={outfits} values={outfit} onToggle={toggle(setOutfit)} />
          <Chips label="Accessories" options={accessories} values={acc} onToggle={toggle(setAcc)} />
        </Panel>

        <Panel title="Scene" summary={`${bg} · ${light}`}>
          <Segment label="Background" options={backgrounds} value={bg} onChange={setBg} />
          <Segment label="Lighting" options={lighting} value={light} onChange={setLight} />
        </Panel>

        <Panel title="Camera" summary={`${shot} · ${lens}`}>
          <Segment label="Shot" options={shots} value={shot} onChange={setShot} />
          <Segment label="Lens" options={lenses} value={lens} onChange={setLens} />
          <SliderRow label="Depth of field" value={depth} onChange={setDepth} suffix="%" />
        </Panel>

        <Panel title="Output" summary={`${count} variations · ${consistency}% consistency`}>
          <SliderRow label="Micro detail" value={detail} onChange={setDetail} suffix="%" />
          <SliderRow label="Identity consistency" value={consistency} onChange={setConsistency} suffix="%" />
          <SliderRow label="Variations" value={count} onChange={setCount} min={1} max={8} />
          <SwitchRow label="Face lock" checked={faceLock} onCheckedChange={setFaceLock} />
          <SwitchRow label="Auto upscale" checked={upscale} onCheckedChange={setUpscale} />
        </Panel>

        <button
          type="button"
          disabled={render.isPending}
          onClick={() => {
            if (!model) {
              toast.error("Select a model first.");
              return;
            }
            if (!prompt.trim()) {
              toast.error("Describe the shot first.");
              return;
            }
            render.mutate();
          }}
          className="w-full rounded-full bg-primary py-3 text-[14px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {render.isPending ? "Generating…" : "Generate"}
        </button>

        <RecentCreations />
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setConfirmName("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the model and all its generated images. Type{" "}
              <span className="font-semibold text-foreground">{pendingDelete?.name}</span>{" "}
              exactly to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={pendingDelete?.name ?? "Model name"}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              disabled={remove.isPending || confirmName !== pendingDelete?.name}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
              className="inline-flex items-center justify-center rounded-full bg-destructive px-4 py-2 text-[13px] font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StudioLayout>
  );
}

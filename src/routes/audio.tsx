import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { StudioLayout } from "@/components/hyper/StudioLayout";
import { Chips, Panel, Segment, SliderRow, SwitchRow, TextRow } from "@/components/hyper/StudioControls";
import { RecentCreations } from "@/components/hyper/RecentCreations";
import { runJob } from "@/lib/jobs-runner";
import { SPEECH_TONES, TTS_MODELS, VOICES } from "@/lib/media.shared";

export const Route = createFileRoute("/audio")({
  head: () =>
    pageHead({
      path: "/audio",
      title: "AI Voice & Music Generator \u2014 Audio Studio | Hyper Copilot",
      description:
        "Generate AI speech and music with 30 voices plus tone, pace, genre, tempo and duration controls in Hyper Copilot's Audio Studio.",
      ogTitle: "AI Voice & Music Generator \u2014 Hyper Copilot Audio Studio",
      keywords: [
        "AI voice generator",
        "text to speech online",
        "AI music generator",
        "AI voiceover",
        "realistic TTS voices",
        "royalty free AI music",
        "AI narration generator",
        "AI song maker",
      ],
      breadcrumbs: [
        { name: "Audio Studio", path: "/audio" },
      ],
    }),
  component: AudioStudio,
});

const modes = ["Text to speech", "Text to music"] as const;
const genres = ["Cinematic", "Electronic", "Lo-Fi", "Orchestral", "Hip-Hop", "Ambient", "Rock", "Jazz"] as const;
const moods = ["Epic", "Calm", "Dark", "Uplifting", "Melancholic", "Tense"] as const;
const musicDurations = ["15s", "30s", "60s", "120s"] as const;
const voiceIds = VOICES.map((v) => v.id) as unknown as readonly string[];
const ttsModelNames = TTS_MODELS.map((m) => m.name) as unknown as readonly string[];

function AudioStudio() {
  const [mode, setMode] = useState<(typeof modes)[number]>(modes[0]);
  const [script, setScript] = useState("");
  const [ttsModelName, setTtsModelName] = useState<string>(TTS_MODELS[0].name);
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [tone, setTone] = useState<string>(SPEECH_TONES[0]);
  const [pace, setPace] = useState(100);

  const [genre, setGenre] = useState<(typeof genres)[number]>(genres[0]);
  const [mood, setMood] = useState<(typeof moods)[number]>(moods[0]);
  const [tempo, setTempo] = useState(120);
  const [musicDuration, setMusicDuration] = useState<string>(musicDurations[1]);
  const [instrumental, setInstrumental] = useState(true);

  const [busy, setBusy] = useState(false);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const ttsModel = TTS_MODELS.find((m) => m.name === ttsModelName) ?? TTS_MODELS[0];
  const voiceNote = VOICES.find((v) => v.id === voice)?.note ?? "";

  const generate = async () => {
    const text = script.trim();
    if (!text) {
      toast.error(
        mode === "Text to speech"
          ? "Write the script you want spoken first."
          : "Describe the track you want to compose first.",
      );
      return;
    }
    setBusy(true);
    setTrackUrl(null);
    try {
      if (mode === "Text to speech") {
        const res = await runJob("speech", text, {
          text,
          voice,
          model: ttsModel.id,
          tone,
          pace,
        });
        setTrackUrl(res.url ?? null);
        toast.success("Speech ready");
      } else {
        const res = await runJob("music", text, {
          prompt: text,
          genre,
          mood,
          tempo,
          seconds: Number(musicDuration.replace("s", "")) || 30,
          instrumental,
        });
        setTrackUrl(res.url ?? null);
        toast.success("Track ready");
      }
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audio generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StudioLayout>
      <div className="space-y-3.5">
        <Panel title="Mode" summary={mode} defaultOpen>
          <Segment options={modes} value={mode} onChange={setMode} />
        </Panel>

        <div className="rounded-2xl border border-border bg-surface/50 p-3.5">
          <TextRow
            label={mode === "Text to speech" ? "Script" : "Music brief"}
            value={script}
            onChange={setScript}
            rows={4}
            placeholder={
              mode === "Text to speech"
                ? "Welcome to Hyper Copilot — everything you imagine, generated in seconds."
                : "A brooding synthwave score with analog arpeggios building to a soaring chorus…"
            }
          />
        </div>

        {mode === "Text to speech" ? (
          <>
            <Panel title="Voice model" summary={ttsModel.name} defaultOpen>
              <Segment options={ttsModelNames} value={ttsModelName} onChange={setTtsModelName} />
              <p className="text-[11.5px] text-muted-foreground">{ttsModel.note}</p>
            </Panel>

            <Panel title="Voice" summary={`${voice}${voiceNote ? ` · ${voiceNote}` : ""}`} defaultOpen>
              <Segment options={voiceIds} value={voice} onChange={setVoice} />
              <p className="text-[11.5px] text-muted-foreground">{voiceNote}</p>
            </Panel>

            <Panel title="Delivery" summary={`${tone} · ${pace}% pace`}>
              <Chips label="Tone" options={SPEECH_TONES} values={[tone]} onToggle={setTone} />
              <SliderRow label="Pace" value={pace} onChange={setPace} min={70} max={130} suffix="%" />
            </Panel>
          </>
        ) : (
          <>
            <Panel title="Style" summary={`${genre} · ${mood}`} defaultOpen>
              <Segment label="Genre" options={genres} value={genre} onChange={setGenre} />
              <Chips
                label="Mood"
                options={moods}
                values={[mood]}
                onToggle={(v) => setMood(v as (typeof moods)[number])}
              />
            </Panel>

            <Panel title="Composition" summary={`${tempo} BPM · ${musicDuration}`} defaultOpen>
              <SliderRow label="Tempo" value={tempo} onChange={setTempo} min={40} max={220} suffix=" BPM" />
              <Segment
                label="Duration"
                options={musicDurations}
                value={musicDuration}
                onChange={setMusicDuration}
              />
              <SwitchRow
                label="Instrumental only"
                desc="No vocals in the generated track"
                checked={instrumental}
                onCheckedChange={setInstrumental}
              />
            </Panel>
          </>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="w-full rounded-full bg-primary py-3 text-[14px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Generating…" : "Generate"}
        </button>

        {trackUrl ? (
          <audio src={trackUrl} controls className="w-full rounded-full border border-border bg-surface" />
        ) : null}

        <RecentCreations />
      </div>
    </StudioLayout>
  );
}

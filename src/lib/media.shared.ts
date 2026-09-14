/** Shared, client-safe option catalogs for the video and audio studios. */

export const TTS_MODELS = [
  { id: "google/gemini-2.5-flash-tts", name: "Hyper Audio Omni", note: "Balanced speech" },
  { id: "google/gemini-2.5-pro-tts", name: "Hyper Audio Omni Pro", note: "Highest fidelity speech" },
  {
    id: "google/gemini-3.1-flash-tts-preview",
    name: "Hyper Audio Omni Next",
    note: "Newest voice engine",
  },
] as const;

export type TtsModelId = (typeof TTS_MODELS)[number]["id"];

/** Prebuilt Gemini TTS voices, grouped by character. */
export const VOICES = [
  { id: "Kore", label: "Kore", note: "Warm · firm" },
  { id: "Puck", label: "Puck", note: "Bright · upbeat" },
  { id: "Charon", label: "Charon", note: "Deep · informative" },
  { id: "Aoede", label: "Aoede", note: "Calm · breezy" },
  { id: "Fenrir", label: "Fenrir", note: "Energetic · gravelly" },
  { id: "Leda", label: "Leda", note: "Youthful · light" },
  { id: "Orus", label: "Orus", note: "Confident · firm" },
  { id: "Zephyr", label: "Zephyr", note: "Bright · airy" },
  { id: "Callirrhoe", label: "Callirrhoe", note: "Easy-going" },
  { id: "Autonoe", label: "Autonoe", note: "Bright · clear" },
  { id: "Enceladus", label: "Enceladus", note: "Breathy · soft" },
  { id: "Iapetus", label: "Iapetus", note: "Clear · neutral" },
  { id: "Umbriel", label: "Umbriel", note: "Easy · mellow" },
  { id: "Algieba", label: "Algieba", note: "Smooth" },
  { id: "Despina", label: "Despina", note: "Smooth · friendly" },
  { id: "Erinome", label: "Erinome", note: "Clear · crisp" },
  { id: "Algenib", label: "Algenib", note: "Gravelly" },
  { id: "Rasalgethi", label: "Rasalgethi", note: "Informative" },
  { id: "Laomedeia", label: "Laomedeia", note: "Upbeat" },
  { id: "Achernar", label: "Achernar", note: "Soft" },
  { id: "Alnilam", label: "Alnilam", note: "Firm" },
  { id: "Schedar", label: "Schedar", note: "Even · steady" },
  { id: "Gacrux", label: "Gacrux", note: "Mature" },
  { id: "Pulcherrima", label: "Pulcherrima", note: "Forward" },
  { id: "Achird", label: "Achird", note: "Friendly" },
  { id: "Zubenelgenubi", label: "Zubenelgenubi", note: "Casual" },
  { id: "Vindemiatrix", label: "Vindemiatrix", note: "Gentle" },
  { id: "Sadachbia", label: "Sadachbia", note: "Lively" },
  { id: "Sadaltager", label: "Sadaltager", note: "Knowledgeable" },
  { id: "Sulafat", label: "Sulafat", note: "Warm" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export const SPEECH_TONES = [
  "Neutral",
  "Cheerful",
  "Calm",
  "Serious",
  "Excited",
  "Whisper",
  "Dramatic",
  "Newsreader",
] as const;

export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const VIDEO_DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
/** Durations above this are shown but locked (not selectable). */
export const MAX_SELECTABLE_VIDEO_DURATION = 5;
export const VIDEO_FPS = [24, 30, 60] as const;

/** Longest edge in pixels for a video resolution label. */
export function videoLongEdge(resolution: string): number {
  if (resolution === "1080p") return 1920;
  if (resolution === "480p") return 854;
  return 1280;
}

/** Pixel size for a video aspect ratio at a resolution, rounded to /32. */
export function videoSize(aspect: string, resolution: string): { width: number; height: number } {
  const [wRaw = 16, hRaw = 9] = aspect.split(":").map(Number);
  const w = wRaw || 16;
  const h = hRaw || 9;
  const long = videoLongEdge(resolution);
  const scale = long / Math.max(w, h);
  const round = (v: number) => Math.max(256, Math.round((v * scale) / 32) * 32);
  return { width: round(w), height: round(h) };
}

/** Builds the tone-prefixed script Gemini TTS expects for styled speech. */
export function styledSpeechText(text: string, tone?: string, pace?: number): string {
  const bits: string[] = [];
  if (tone && tone !== "Neutral") bits.push(`in a ${tone.toLowerCase()} tone`);
  if (pace !== undefined && pace !== 100) {
    bits.push(pace < 100 ? "slowly" : "quickly");
  }
  return bits.length ? `Say ${bits.join(" and ")}: ${text}` : text;
}

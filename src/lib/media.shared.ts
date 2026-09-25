/** Shared, client-safe option catalogs for the video and audio studios. */

export const TTS_MODELS = [
  { id: "edge-tts", name: "Edge TTS (Default)", note: "Natural neural speech" },
  { id: "google/gemini-2.5-flash-tts", name: "Hyper Audio Omni", note: "Balanced speech" },
  {
    id: "google/gemini-2.5-pro-tts",
    name: "Hyper Audio Omni Pro",
    note: "Highest fidelity speech",
  },
] as const;

export type TtsModelId = (typeof TTS_MODELS)[number]["id"];

/** Edge TTS and Studio Neural voices */
export const VOICES = [
  { id: "en-US-ChristopherNeural", label: "Christopher", note: "Conversational · natural male" },
  { id: "en-US-JennyNeural", label: "Jenny", note: "Friendly · bright female" },
  { id: "en-US-GuyNeural", label: "Guy", note: "Professional · clear male" },
  { id: "en-US-AriaNeural", label: "Aria", note: "Expressive · versatile female" },
  { id: "en-US-EricNeural", label: "Eric", note: "Authentic · relatable male" },
  { id: "en-US-AnaNeural", label: "Ana", note: "Warm · youthful female" },
  { id: "en-US-MichelleNeural", label: "Michelle", note: "Clear · narrator female" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK)", note: "British · polished female" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK)", note: "British · crisp male" },
  { id: "en-AU-NatashaNeural", label: "Natasha (AU)", note: "Australian · cheerful female" },
  { id: "en-IN-NeerjaNeural", label: "Neerja (IN)", note: "Indian · clear female" },
  { id: "en-IN-PrabhatNeural", label: "Prabhat (IN)", note: "Indian · confident male" },
  { id: "Kore", label: "Kore", note: "Warm · firm" },
  { id: "Puck", label: "Puck", note: "Bright · upbeat" },
  { id: "Charon", label: "Charon", note: "Deep · informative" },
  { id: "Aoede", label: "Aoede", note: "Calm · breezy" },
  { id: "Fenrir", label: "Fenrir", note: "Energetic · gravelly" },
  { id: "Leda", label: "Leda", note: "Youthful · light" },
  { id: "Orus", label: "Orus", note: "Confident · firm" },
  { id: "Zephyr", label: "Zephyr", note: "Bright · airy" },
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

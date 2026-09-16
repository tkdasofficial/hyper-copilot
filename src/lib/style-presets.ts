export const IMAGE_STYLES = [
  "Photorealistic",
  "Cinematic Film",
  "Studio Photography",
  "Digital Art",
  "3D Animation",
  "Vintage Kodak",
] as const;

export const ART_STYLES = [
  "Natural Sunlight",
  "Soft Studio Light",
  "Moody Low-Light",
  "High Contrast Noir",
  "Warm Sunset",
  "Clean Corporate",
] as const;

export type ImageStyle = (typeof IMAGE_STYLES)[number];
export type ArtStyle = (typeof ART_STYLES)[number];

const IMAGE_STYLE_PROMPTS: Record<ImageStyle, string> = {
  Photorealistic: "realistic photography with natural colors and true-to-life materials",
  "Cinematic Film": "cinematic film photography with balanced framing and subtle film grain",
  "Studio Photography":
    "professional studio photography with a clean backdrop and controlled lighting",
  "Digital Art": "polished digital artwork with clear forms and balanced color",
  "3D Animation": "professional 3D animation with clean materials and believable lighting",
  "Vintage Kodak": "vintage Kodak film photography with gentle grain and authentic color",
};

const ART_STYLE_PROMPTS: Record<ArtStyle, string> = {
  "Natural Sunlight": "lit by natural sunlight with realistic shadows and neutral color",
  "Soft Studio Light": "lit with soft studio light and smooth, flattering shadows",
  "Moody Low-Light": "low-key lighting with restrained highlights and natural dark tones",
  "High Contrast Noir": "high-contrast black-and-white lighting with defined shadows",
  "Warm Sunset": "warm sunset light with soft golden tones and long natural shadows",
  "Clean Corporate": "clean professional lighting with neutral tones and an uncluttered finish",
};

export function normalizeImageStyle(value: unknown): ImageStyle {
  return IMAGE_STYLES.includes(value as ImageStyle) ? (value as ImageStyle) : IMAGE_STYLES[0];
}

export function normalizeArtStyle(value: unknown): ArtStyle {
  return ART_STYLES.includes(value as ArtStyle) ? (value as ArtStyle) : ART_STYLES[0];
}

export function imageStylePrompt(value: unknown): string {
  return IMAGE_STYLE_PROMPTS[normalizeImageStyle(value)];
}

export function artStylePrompt(value: unknown): string {
  return ART_STYLE_PROMPTS[normalizeArtStyle(value)];
}

export function visualStylePrompt(imageStyle: unknown, artStyle?: unknown): string {
  return [imageStylePrompt(imageStyle), artStyle === undefined ? "" : artStylePrompt(artStyle)]
    .filter(Boolean)
    .join(", ");
}

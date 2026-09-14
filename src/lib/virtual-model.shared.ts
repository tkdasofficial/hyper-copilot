/** Prompt building blocks and consistency math for character (virtual model) generation. */

export type VirtualModelImage = { view: string; path: string };

export type VirtualModelRecord = {
  id: string;
  name: string;
  description: string;
  identityPrompt: string;
  seed: number;
  status: string;
  error: string | null;
  headshotUrl: string | null;
  images: { view: string; url: string | null }[];
  createdAt: string;
};

export type ViewId =
  | "headshot"
  | "front-full"
  | "back-full"
  | "left-profile"
  | "right-profile";

/**
 * The five profile views generated for every character.
 *
 * `reference` declares which already-rendered view conditions this one:
 * - `null`  — the anchor, rendered from text so the identity is born once.
 * - `headshot`   — portrait framings inherit the face directly from the anchor.
 * - `front-full` — body framings inherit head-to-toe proportions from the
 *   front full body render, which itself inherits the anchor's face.
 */
export const MODEL_VIEWS: {
  id: ViewId;
  label: string;
  instruction: string;
  reference: ViewId | null;
  portrait: boolean;
}[] = [
  {
    id: "headshot",
    label: "Headshot",
    instruction:
      "tight headshot portrait, head and shoulders only, face perfectly centered and fully visible, neutral relaxed expression, eyes looking straight into the camera, symmetrical framing",
    reference: null,
    portrait: true,
  },
  {
    id: "front-full",
    label: "Front full body",
    instruction:
      "full body shot from the front, standing straight in a neutral A-pose, arms relaxed at the sides, feet together, entire figure visible from head to feet with the whole face clearly visible",
    reference: "headshot",
    portrait: false,
  },
  {
    id: "back-full",
    label: "Back full body",
    instruction:
      "full body shot from directly behind, standing straight, head facing away from the camera, entire figure visible from head to feet, same hair length and body silhouette",
    reference: "front-full",
    portrait: false,
  },
  {
    id: "left-profile",
    label: "Left side",
    instruction:
      "full body shot from the left side, exact 90 degree left profile view, standing straight, entire figure visible from head to feet",
    reference: "front-full",
    portrait: false,
  },
  {
    id: "right-profile",
    label: "Right side",
    instruction:
      "full body shot from the right side, exact 90 degree right profile view, standing straight, entire figure visible from head to feet",
    reference: "front-full",
    portrait: false,
  },
];

/** Non-negotiable identity clause repeated verbatim in every request. */
export const IDENTITY_LOCK =
  "one single consistent person, identical face in every frame, exact same facial bone structure and jawline, same eye shape and iris color, same nose shape, same lip shape, same eyebrow shape, same skin tone and skin texture with the same freckles and marks, same hairline, hair length, hair texture and hair color, same body proportions, same height and same build";

/** Studio conditions that keep the reference set comparable frame to frame. */
export const STUDIO_SUFFIX =
  "plain light grey seamless studio backdrop, even soft diffused studio lighting with no harsh shadows, fitted plain neutral grey outfit, sharp focus, high detail";

/** Art-style clause so every view of a character keeps the chosen style. */
export function styleClause(style?: string) {
  const s = (style ?? "realistic").toLowerCase();
  if (s.includes("cartoon"))
    return "stylised cartoon illustration, clean bold outlines, flat shaded colours";
  if (s.includes("anime"))
    return "anime illustration, cel shaded, crisp line art, expressive anime eyes";
  if (s.includes("3d"))
    return "3D rendered character, physically based rendering, subsurface scattering, octane render";
  if (s.includes("cinematic"))
    return "cinematic photograph, filmic colour grade, shallow depth of field, photorealistic";
  if (s.includes("editorial"))
    return "high fashion editorial photograph, magazine quality, photorealistic";
  if (s.includes("heaven"))
    return "ethereal dreamlike render, soft glowing rim light, luminous highlights, photorealistic base";
  return "full colour photograph, photorealistic, ultra detailed natural skin texture, 85mm lens, shot on a full frame camera";
}

export const IDENTITY_NEGATIVE =
  "different person, another person, changing face, face swap, inconsistent features, multiple people, twins, deformed face, asymmetric eyes, extra fingers, extra limbs, missing limbs, mutated hands, cropped head, cut off feet, blurry, out of focus, lowres, low quality, jpeg artifacts, plastic skin, waxy skin, uncanny, horror, creepy, watermark, text, logo, signature, collage, split image, distorted proportions";

export function viewPrompt(identityPrompt: string, instruction: string, style?: string) {
  return [
    "MANDATORY CHARACTER SPECIFICATION — follow every listed physical attribute exactly",
    identityPrompt,
    "MANDATORY CAMERA VIEW",
    instruction,
    IDENTITY_LOCK,
    STUDIO_SUFFIX,
    styleClause(style),
    "one person only; do not replace, generalize, or omit any requested age, presentation, ethnicity, skin, eye, hair, face, height, build, or art-style attribute",
  ].join(". ");
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Maps a 0-100 identity-consistency dial onto sampler settings.
 *
 * Higher consistency means more sampling steps, stronger prompt adherence and
 * a lower denoise strength, so image-to-image passes stay closer to the
 * reference face instead of drifting into a new person.
 */
export function consistencyProfile(level = 92) {
  const c = clamp(level, 40, 100) / 100;
  return {
    steps: Math.round(26 + c * 22),
    guidance: Number((6.5 + c * 4).toFixed(2)),
    strength: Number((0.9 - c * 0.45).toFixed(2)),
  };
}

/** Deterministic per-view seed so a rerun reproduces the same profile set. */
export function viewSeed(seed: number, viewId: string) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < viewId.length; i++) {
    h = Math.imul(h ^ viewId.charCodeAt(i), 16777619);
  }
  return Math.abs(h) % 1_000_000_000;
}

/** Picks the profile view that best conditions a requested shot framing. */
export function referenceViewForShot(shot?: string): ViewId {
  const s = (shot ?? "").toLowerCase();
  if (s.includes("close")) return "headshot";
  if (s.includes("portrait")) return "headshot";
  if (s.includes("half")) return "front-full";
  if (s.includes("full") || s.includes("wide")) return "front-full";
  return "headshot";
}

type Framing = "close" | "portrait" | "half" | "full" | "wide";

function framingOf(shot?: string): Framing {
  const s = (shot ?? "").toLowerCase();
  if (s.includes("close")) return "close";
  if (s.includes("half") || s.includes("waist") || s.includes("cowboy")) return "half";
  if (s.includes("wide") || s.includes("environment")) return "wide";
  if (s.includes("full")) return "full";
  return "portrait";
}

/** Explicit camera framing instruction — the model ignores "full body" otherwise. */
export function framingClause(shot?: string) {
  switch (framingOf(shot)) {
    case "close":
      return "extreme close-up shot, face fills the frame, cropped just below the chin, shallow depth of field";
    case "half":
      return "half body shot, medium shot framed from the top of the head down to the waist, hands and torso visible, full head inside the frame";
    case "full":
      return "full body shot, the entire person is visible from the top of the head all the way down to the shoes, full length figure standing in frame with headroom above and floor visible below, whole outfit and both feet in frame";
    case "wide":
      return "wide establishing shot, the full figure is small in the frame with lots of surrounding environment visible, entire body from head to feet in frame";
    default:
      return "portrait shot, head and shoulders framing, upper chest visible, face clearly visible";
  }
}

/** Framing-aware negatives — "cropped head" is wrong guidance for a close-up. */
export function framingNegative(shot?: string) {
  const f = framingOf(shot);
  if (f === "close") return "full body, distant subject, tiny face, wide shot";
  if (f === "portrait") return "full body, distant subject, wide shot";
  if (f === "half") return "extreme close-up, only face, cropped head, feet in frame";
  return "close-up, headshot, portrait crop, cropped head, cut off feet, cut off legs, torso only, upper body only, zoomed in face";
}

/**
 * Denoise amount for a character render.
 *
 * The reference exists to carry identity, not framing. Locking every render to
 * a very low strength reproduced the studio reference photo and made the shot,
 * wardrobe, scene and prompt look ignored — so the base strength scales with
 * how far the requested framing is from the reference view, and a mismatched
 * reference (e.g. a headshot conditioning a full body shot) loosens further.
 */
export function denoiseStrength(input: {
  shot?: string | undefined;
  referenceView: ViewId;
  faceLock: boolean;
  consistency?: number | undefined;
}) {
  const f = framingOf(input.shot);
  const base =
    f === "close" ? 0.5 : f === "portrait" ? 0.58 : f === "half" ? 0.7 : f === "full" ? 0.78 : 0.82;
  const wanted = referenceViewForShot(input.shot);
  const mismatch = input.referenceView !== wanted ? 0.08 : 0;
  const consistency = clamp(input.consistency ?? 92, 40, 100);
  // A high consistency dial tightens the render, but never enough to freeze it.
  const tighten = ((consistency - 70) / 30) * 0.08;
  const lock = input.faceLock ? 0.04 : 0;
  return Number(clamp(base + mismatch - tighten - lock, 0.42, 0.88).toFixed(2));
}

/** Compact identity clause for scene renders — the long lock drowns the prompt. */
const IDENTITY_LOCK_SHORT =
  "the exact same person as the reference: identical face, same facial bone structure, same eye shape and colour, same nose and lips, same skin tone, same hair colour and length, same body build";

export type SceneSettings = {
  outfit?: string[] | undefined;
  accessories?: string[] | undefined;
  background?: string | undefined;
  lighting?: string | undefined;
  lens?: string | undefined;
  depth?: number | undefined;
  resolution?: string | undefined;
};

const BACKGROUNDS: Record<string, string> = {
  studio: "in a professional photo studio against a clean seamless backdrop",
  city: "on a busy city street with buildings, traffic and pedestrians behind her",
  "café": "inside a cosy café with tables, cups and warm interior details behind her",
  cafe: "inside a cosy café with tables, cups and warm interior details behind her",
  beach: "on a sandy beach with the sea, surf and open sky behind her",
  rooftop: "on an open city rooftop with a skyline horizon behind her",
  interior: "inside a styled modern interior room with furniture and decor behind her",
  nature: "outdoors in nature with trees, foliage and natural terrain behind her",
  neon: "in a neon-lit night street with glowing coloured signage behind her",
};

const LIGHTING: Record<string, string> = {
  softbox: "soft even softbox studio lighting, gentle wrap-around light, minimal shadows",
  "golden hour": "warm golden hour sunlight, low sun, long soft shadows, glowing skin",
  rembrandt: "dramatic Rembrandt lighting, strong key light from one side, triangle of light on the cheek, deep contrast",
  ring: "ring light beauty lighting, flat frontal illumination, circular catchlights in the eyes",
  neon: "coloured neon lighting, magenta and cyan colour cast, moody night ambience",
  flash: "direct on-camera flash, harsh frontal light, crisp shadow behind the subject, snapshot look",
  backlit: "strong backlight behind the subject, glowing rim light around hair and shoulders, hazy lens flare",
};

/** Focal-length look — a lens choice must change compression and background blur. */
function lensClause(lens?: string, depth?: number) {
  const l = (lens ?? "85mm").toLowerCase();
  const look = l.startsWith("24")
    ? "shot on a 24mm wide angle lens, wide field of view with expanded perspective and visible surroundings"
    : l.startsWith("35")
      ? "shot on a 35mm lens, natural reportage perspective with context around the subject"
      : l.startsWith("50")
        ? "shot on a 50mm lens, natural undistorted perspective"
        : l.startsWith("135")
          ? "shot on a 135mm telephoto lens, strong compression, tightly isolated subject"
          : "shot on an 85mm portrait lens, flattering compression";
  const d = clamp(depth ?? 35, 0, 100);
  const dof =
    d >= 75
      ? "very shallow depth of field, f/1.4, background melted into creamy bokeh"
      : d >= 45
        ? "shallow depth of field, f/2.0, softly blurred background"
        : d >= 20
          ? "moderate depth of field, f/4, background slightly soft but readable"
          : "deep depth of field, f/11, everything from subject to background in sharp focus";
  return `${look}, ${dof}`;
}

/** Resolution dial — real pixels plus a matching fidelity clause. */
export function resolutionBase(resolution?: string) {
  const r = (resolution ?? "2K").toUpperCase();
  if (r === "1K") return 896;
  if (r === "4K") return 1280;
  if (r === "8K") return 1408;
  return 1088;
}

function resolutionClause(resolution?: string) {
  const r = (resolution ?? "2K").toUpperCase();
  if (r === "1K") return "clean high quality render";
  if (r === "4K") return "4K ultra high resolution, razor sharp, tack sharp edge to edge";
  if (r === "8K") return "8K ultra high resolution, maximum sharpness, hyper detailed";
  return "2K high resolution, crisp and sharp";
}

/** Wardrobe / scene clauses so each control visibly changes the picture. */
export function sceneClauses(s: SceneSettings) {
  const outfit = (s.outfit ?? []).filter(Boolean);
  const acc = (s.accessories ?? []).filter(Boolean);
  const bgKey = (s.background ?? "").toLowerCase();
  const lightKey = (s.lighting ?? "").toLowerCase();
  return [
    outfit.length
      ? `wearing a complete ${outfit.join(" and ").toLowerCase()} outfit, the clothing is clearly visible and well fitted`
      : "",
    acc.length ? `wearing ${acc.join(", ").toLowerCase()}, the accessories are clearly visible` : "",
    bgKey ? (BACKGROUNDS[bgKey] ?? `${bgKey} background`) : "",
    lightKey ? (LIGHTING[lightKey] ?? `${lightKey} lighting`) : "",
    lensClause(s.lens, s.depth),
    resolutionClause(s.resolution),
  ].filter(Boolean);
}

/** Negatives derived from the settings — what was NOT chosen must not appear. */
export function sceneNegative(s: SceneSettings) {
  const acc = (s.accessories ?? []).filter(Boolean).map((a) => a.toLowerCase());
  const all = ["sunglasses", "earrings", "necklace", "watch", "cap", "handbag"];
  const unwanted = all.filter((a) => !acc.some((x) => x.includes(a)));
  const bg = (s.background ?? "").toLowerCase();
  const bgNeg =
    bg === "studio"
      ? "outdoor scenery, street, landscape, cluttered background"
      : bg
        ? "plain studio backdrop, empty grey wall"
        : "";
  const d = clamp(s.depth ?? 35, 0, 100);
  const dofNeg = d >= 60 ? "sharp busy background" : d <= 20 ? "blurry background, heavy bokeh" : "";
  return [unwanted.length ? unwanted.join(", ") : "", bgNeg, dofNeg].filter(Boolean).join(", ");
}

/**
 * Builds a scene render prompt.
 *
 * The user's scene description leads and the camera framing is stated twice so
 * the sampler treats it as a hard constraint; identity is a supporting clause,
 * not the headline, otherwise the reference photo is simply reproduced.
 */
export function renderPrompt(input: {
  identityPrompt: string;
  prompt: string;
  faceLock: boolean;
  detail: number;
  shot?: string | undefined;
  style?: string | undefined;
  scene?: SceneSettings | undefined;
}) {
  const detail = clamp(input.detail, 0, 100);
  const detailClause =
    detail >= 80
      ? "extremely fine micro detail, visible skin pores, individual hair strands, crisp fabric weave"
      : detail >= 50
        ? "rich natural detail, realistic skin texture"
        : "soft natural detail";
  const framing = framingClause(input.shot);
  return [
    "MANDATORY IMAGE DIRECTIONS — follow every selected setting exactly",
    `SUBJECT ACTION AND COMPOSITION: ${input.prompt}`,
    `CAMERA FRAMING: ${framing}`,
    ...(input.scene ? sceneClauses(input.scene) : []),
    `CHARACTER IDENTITY: ${input.identityPrompt}`,
    input.faceLock
      ? "keep the face pixel-faithful to the reference person"
      : "keep the same person as the reference",
    IDENTITY_LOCK_SHORT,
    `CAMERA FRAMING: ${framing}`,
    detailClause,
    styleClause(input.style),
  ]
    .filter(Boolean)
    .join(". ");
}



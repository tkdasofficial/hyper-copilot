/**
 * Per-platform title, description, caption and hashtag builder.
 *
 * Every published post gets text that is cleaned of prompt/system noise and
 * shaped for the platform it goes to:
 *
 * | Platform            | Text shape                                            |
 * | ------------------- | ----------------------------------------------------- |
 * | YouTube             | hook title + 2-3 tags, full description + 10-15 tags   |
 * | Instagram, Facebook | caption + 4-5 tags                                     |
 * | Threads             | <=500 chars + 2-3 tags                                 |
 */

import type { SocialProvider } from "@/lib/social.shared";

const NICHE_HASHTAGS: Record<string, string[]> = {
  "Cosmic Universe": [
    "#cosmos",
    "#universe",
    "#space",
    "#astronomy",
    "#nebula",
    "#galaxy",
    "#stars",
    "#deepspace",
    "#astrophotography",
    "#nasa",
    "#spacefacts",
    "#milkyway",
  ],
  "Nature Beauty": [
    "#nature",
    "#wildlife",
    "#naturelovers",
    "#earth",
    "#landscape",
    "#forest",
    "#mountains",
    "#naturephotography",
    "#outdoors",
    "#wilderness",
    "#greenearth",
    "#scenery",
  ],
  "Ocean & Sky": [
    "#ocean",
    "#sky",
    "#seascape",
    "#clouds",
    "#bluehour",
    "#waves",
    "#sunset",
    "#horizon",
    "#coastal",
    "#underwater",
    "#marinelife",
    "#skyline",
  ],
  "Micro World": [
    "#macro",
    "#microworld",
    "#macrophotography",
    "#tinyworld",
    "#details",
    "#closeup",
    "#microscopic",
    "#insects",
    "#texture",
    "#minutiae",
    "#microphotography",
    "#hiddenworld",
  ],
};

const FALLBACK_HOOK = "A moment worth watching.";
const FALLBACK_HASHTAGS = [
  "#viral",
  "#trending",
  "#reels",
  "#shorts",
  "#explore",
  "#fyp",
  "#amazing",
  "#satisfying",
  "#4k",
  "#dailyvideo",
  "#mustwatch",
  "#discover",
];

const CALL_TO_ACTION =
  "Subscribe and turn on notifications for a new clip every day. Follow us on Instagram, Facebook and Threads for more.";

/* ------------------------------------------------------------------ */
/* Sanitization                                                        */
/* ------------------------------------------------------------------ */

const META_LINE =
  /^\s*(negative[_ ]?prompt|prompt|system|instruction[s]?|style|art[_ ]?style|image[_ ]?style|aspect[_ ]?ratio|voice|model|seed|quality|duration|caption[_ ]?style|category)\b\s*[:=].*$/i;

/**
 * Strips prompt engineering leftovers before any text reaches a platform API:
 * bracketed/braced/angled blocks, quotes, `key: value` metadata lines and
 * negative-prompt phrases.
 */
export function sanitizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  const lines = String(raw)
    .split(/\r?\n/)
    .filter((line) => !META_LINE.test(line));

  return lines
    .join("\n")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\((?:no|avoid|without)\s[^)]*\)/gi, " ")
    .replace(/\b(?:negative prompt|system prompt|system instruction[s]?)\b\s*[:-]?\s*/gi, " ")
    .replace(/["“”'‘’`]/g, "")
    .replace(/[|*_#]+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** Sanitizes and reduces text to one punchy line of at most `max` chars. */
export function oneLine(text: string | null | undefined, max = 120): string {
  const clean = sanitizeText(text);
  const first =
    clean
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const sentence = first.split(/(?<=[.!?])\s/)[0] ?? first;
  const picked = sentence.length >= 20 ? sentence : first;
  return picked.length > max ? `${picked.slice(0, max - 1).trimEnd()}…` : picked;
}

/* ------------------------------------------------------------------ */
/* Hashtags                                                            */
/* ------------------------------------------------------------------ */

/** Normalises loose input into `#tag` form and drops duplicates/blanks. */
export function normalizeHashtags(input: unknown, limit = 15): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,]+/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item
      .trim()
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (!tag) continue;
    const key = `#${tag}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${tag}`);
    if (out.length >= limit) break;
  }
  return out;
}

/** Builds a deduplicated tag pool: user tags first, then niche, then generic. */
function hashtagPool(source: ContentSource, want: number): string[] {
  const niche = NICHE_HASHTAGS[source.category ?? ""] ?? [];
  return normalizeHashtags(
    [...normalizeHashtags(source.hashtags, want), ...niche, ...FALLBACK_HASHTAGS],
    want,
  );
}

/* ------------------------------------------------------------------ */
/* Platform content                                                    */
/* ------------------------------------------------------------------ */

export type PlatformTitle = { title: string; hashtags: string[] };

export type GeneratedTitles = {
  youtube: PlatformTitle;
  meta: PlatformTitle;
  threads: PlatformTitle;
};

export type ContentSource = {
  hookTitle?: string | null;
  hashtags?: unknown;
  caption?: string | null;
  name?: string | null;
  category?: string | null;
  script?: string | null;
  story?: string | null;
  prompt?: string | null;
  instructions?: string | null;
  generatedTitles?: GeneratedTitles | null;
};

export type PlatformContent = {
  /** Platform title (YouTube / Facebook video title / Threads statement). */
  title: string;
  /** Long-form description (YouTube / Facebook). */
  description: string;
  /** Post caption or text body (Instagram, Facebook, Threads). */
  caption: string;
  /** Plain tag words (no `#`) for APIs that take a tag list. */
  tags: string[];
  /** Destination provider */
  provider?: SocialProvider;
};

const YOUTUBE_TITLE_MAX = 100;
const THREADS_MAX = 500;

/* ------------------------------------------------------------------ */
/* Story Analysis & Dynamic Narrative Title Generator                 */
/* ------------------------------------------------------------------ */

const PROMPT_NOISE_RE =
  /\b(?:cinematic|photorealistic|hyper-realistic|unreal engine|octane render|8k|4k|high resolution|masterpiece|best quality|trending on artstation|sharp focus|depth of field|aspect ratio|shutter speed|iso \d+|negative prompt|camera|lens|vivid colors|volumetric lighting|ray tracing|award winning|ultra realistic|high definition|natural lighting|studio lighting|render)\b/gi;

/** Strips AI generation prompt noise and camera settings to uncover the raw story text. */
export function extractCleanStory(source: ContentSource): string {
  const raw =
    source.script ||
    source.story ||
    source.prompt ||
    source.caption ||
    source.instructions ||
    source.name ||
    "";
  const sanitized = sanitizeText(raw);
  const clean = sanitized
    .replace(PROMPT_NOISE_RE, "")
    .replace(/[,\s]{2,}/g, " ")
    .trim();
  return clean || "A cinematic journey through an extraordinary moment.";
}

/** Extracts the core narrative subject/entity from the story text. */
function extractCoreSubject(text: string, categoryFallback?: string | null): string {
  // Try to find the leading subject clause before commas/conjunctions
  const firstSentence = text.split(/[.!?\n]/)[0] ?? text;
  const cleaned = firstSentence
    .replace(/^(?:a|an|the|this|in|at|deep inside|close up of|cinematic shot of|exploring)\s+/i, "")
    .trim();

  // If a descriptive noun phrase can be cleanly captured:
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 8) {
    // Capitalize words for title casing
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  if (words.length > 8) {
    const chunk = words.slice(0, 6);
    return chunk.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  return categoryFallback || "The Deep Unknown";
}

/** Determines dynamic context hashtags based on story keywords and theme. */
function extractDynamicHashtags(source: ContentSource): string[] {
  const text =
    `${source.script || ""} ${source.story || ""} ${source.prompt || ""} ${source.caption || ""} ${source.name || ""} ${source.category || ""}`.toLowerCase();
  const pool: string[] = [];

  // 1. User-supplied hashtags first
  if (source.hashtags) {
    pool.push(...normalizeHashtags(source.hashtags, 10));
  }

  // 2. Thematic keyword detection
  if (
    text.includes("space") ||
    text.includes("cosmos") ||
    text.includes("galaxy") ||
    text.includes("planet") ||
    text.includes("star") ||
    text.includes("astronomy") ||
    text.includes("nebula") ||
    text.includes("telescope")
  ) {
    pool.push("#Space", "#Universe", "#Cosmos", "#Astronomy", "#DeepSpace");
  }
  if (
    text.includes("ocean") ||
    text.includes("sea") ||
    text.includes("underwater") ||
    text.includes("marine") ||
    text.includes("whale") ||
    text.includes("abyss") ||
    text.includes("shark") ||
    text.includes("reef") ||
    text.includes("trench")
  ) {
    pool.push("#Ocean", "#DeepSea", "#MarineLife", "#Underwater", "#OceanExploration");
  }
  if (
    text.includes("nature") ||
    text.includes("forest") ||
    text.includes("wildlife") ||
    text.includes("animal") ||
    text.includes("earth") ||
    text.includes("mountain") ||
    text.includes("rainforest")
  ) {
    pool.push("#Nature", "#Wildlife", "#Earth", "#Wilderness", "#NatureLovers");
  }
  if (
    text.includes("macro") ||
    text.includes("micro") ||
    text.includes("insect") ||
    text.includes("crystal") ||
    text.includes("tardigrade") ||
    text.includes("tiny") ||
    text.includes("detail")
  ) {
    pool.push("#MicroWorld", "#Macro", "#TinyWorld", "#NatureDetails", "#Macrophotography");
  }
  if (
    text.includes("tech") ||
    text.includes("ai") ||
    text.includes("future") ||
    text.includes("cyberpunk") ||
    text.includes("quantum") ||
    text.includes("physics") ||
    text.includes("robot")
  ) {
    pool.push("#Technology", "#SciFi", "#Physics", "#Futuristic", "#Science");
  }
  if (
    text.includes("ancient") ||
    text.includes("ruin") ||
    text.includes("temple") ||
    text.includes("history") ||
    text.includes("mystery") ||
    text.includes("myth") ||
    text.includes("lost")
  ) {
    pool.push("#Mystery", "#AncientHistory", "#History", "#Archaeology", "#Legends");
  }

  // Category fallback
  const niche = NICHE_HASHTAGS[source.category ?? ""] ?? [];
  pool.push(...niche, ...FALLBACK_HASHTAGS);

  return normalizeHashtags(pool, 15);
}

/**
 * YouTube Shorts:
 * - Curiosity-inducing, story-driven title based on the video's core theme.
 * - Appends 2 to 3 relevant hashtags directly at the end of the title string (e.g., "The Secret of Deep Space #Space #Universe").
 * - Strict Constraint: Entire title string MUST NOT exceed 100 characters.
 */
function buildYouTubeShortsTitle(
  subject: string,
  cleanStory: string,
  userHook: string | null | undefined,
  tagsPool: string[],
): { title: string; tags: string[] } {
  // Select top 2-3 relevant hashtags
  const targetTags = tagsPool.slice(0, 3);
  let tagsToAppend = targetTags;
  let tagsStr = tagsToAppend.join(" ");

  // Derive story hook
  let baseHook = "";
  if (userHook && userHook.trim() && userHook.length >= 10 && userHook.length <= 70) {
    baseHook = userHook.trim().replace(/[#]/g, "");
  } else {
    // Dynamically generate curiosity-inducing, story-driven title
    const lower = cleanStory.toLowerCase();
    if (
      lower.includes("secret") ||
      lower.includes("hidden") ||
      lower.includes("beneath") ||
      lower.includes("lost")
    ) {
      baseHook = `The Secret of ${subject}`;
    } else if (
      lower.includes("mystery") ||
      lower.includes("unexplained") ||
      lower.includes("strange")
    ) {
      baseHook = `The Unsolved Mystery of ${subject}`;
    } else if (lower.includes("how") || lower.includes("why") || lower.includes("discover")) {
      baseHook = `What Lies Inside ${subject}`;
    } else if (
      lower.includes("collide") ||
      lower.includes("explode") ||
      lower.includes("awaken") ||
      lower.includes("erupt")
    ) {
      baseHook = `The Moment ${subject} Broke Reality`;
    } else {
      baseHook = `The Untold Story of ${subject}`;
    }
  }

  // Ensure entire title string MUST NOT exceed 100 characters
  // If baseHook + " " + tagsStr > 100, try with 2 tags first
  if (`${baseHook} ${tagsStr}`.length > YOUTUBE_TITLE_MAX && tagsToAppend.length > 2) {
    tagsToAppend = tagsToAppend.slice(0, 2);
    tagsStr = tagsToAppend.join(" ");
  }

  // If still > 100 chars, truncate baseHook gracefully at word boundary
  if (`${baseHook} ${tagsStr}`.length > YOUTUBE_TITLE_MAX) {
    const maxHookLen = YOUTUBE_TITLE_MAX - tagsStr.length - 2;
    if (baseHook.length > maxHookLen) {
      const words = baseHook.split(" ");
      let trimmed = "";
      for (const w of words) {
        if (`${trimmed} ${w}`.trim().length <= maxHookLen - 1) {
          trimmed = `${trimmed} ${w}`.trim();
        } else {
          break;
        }
      }
      baseHook = trimmed ? `${trimmed}…` : baseHook.slice(0, maxHookLen);
    }
  }

  const finalTitle = `${baseHook} ${tagsStr}`.trim().slice(0, YOUTUBE_TITLE_MAX);
  return {
    title: finalTitle,
    tags: tagsToAppend.map((t) => t.slice(1)),
  };
}

/**
 * Meta (Instagram Reels & Facebook Reels):
 * - Attention-grabbing title/hook reflecting the narrative.
 * - Includes 4 to 5 highly relevant, targeted hashtags within the title/caption text for optimal reach.
 */
function buildMetaReelsContent(
  subject: string,
  cleanStory: string,
  userHook: string | null | undefined,
  tagsPool: string[],
): { title: string; caption: string; tags: string[] } {
  // Attention-grabbing title / hook
  let hook = "";
  if (userHook && userHook.trim()) {
    hook = oneLine(userHook, 90);
  } else {
    const lower = cleanStory.toLowerCase();
    if (lower.includes("unbelievable") || lower.includes("rare") || lower.includes("first time")) {
      hook = `A rare, unbelievable look into ${subject}`;
    } else if (lower.includes("deep") || lower.includes("abyss") || lower.includes("trench")) {
      hook = `Journey deep into the heart of ${subject}`;
    } else if (lower.includes("danger") || lower.includes("shock") || lower.includes("extreme")) {
      hook = `The incredible power of ${subject} revealed`;
    } else {
      hook = `Witness the breathtaking reality of ${subject}`;
    }
  }

  // 4 to 5 highly relevant targeted hashtags
  const metaTags = tagsPool.slice(0, 5);
  while (metaTags.length < 4 && tagsPool.length > metaTags.length) {
    const next = tagsPool[metaTags.length];
    if (!next) break;
    metaTags.push(next);
  }

  const firstNarrativeSentence = cleanStory.split(/[.!?\n]/)[0]?.trim();
  const storyLead =
    firstNarrativeSentence && firstNarrativeSentence.length > 20 && firstNarrativeSentence !== hook
      ? firstNarrativeSentence
      : cleanStory.slice(0, 200).trimEnd();

  const caption = `${hook}\n\n${storyLead}\n\n${metaTags.join(" ")}`.trim();

  return {
    title: hook.slice(0, 100),
    caption,
    tags: metaTags.map((t) => t.slice(1)),
  };
}

/**
 * Threads:
 * - Generate a short, conversational title statement based on the story.
 * - Append strictly 1 main Topic Tag (e.g., #Space or #Storytelling) as Threads officially supports only 1 active tag per post.
 */
function buildThreadsContent(
  subject: string,
  cleanStory: string,
  userHook: string | null | undefined,
  tagsPool: string[],
): { title: string; caption: string; tags: string[] } {
  // Generate a short, conversational title statement
  let conversationalTitle = "";
  if (userHook && userHook.trim()) {
    conversationalTitle = userHook.trim().replace(/[#]/g, "");
  } else {
    const lower = cleanStory.toLowerCase();
    if (lower.includes("space") || lower.includes("star") || lower.includes("planet")) {
      conversationalTitle = `Still can't wrap my head around how massive ${subject} actually is.`;
    } else if (lower.includes("ocean") || lower.includes("deep") || lower.includes("water")) {
      conversationalTitle = `Exploring ${subject} honestly feels like visiting an alien planet.`;
    } else if (lower.includes("micro") || lower.includes("tardigrade") || lower.includes("tiny")) {
      conversationalTitle = `The details inside ${subject} are genuinely mind-bending.`;
    } else {
      conversationalTitle = `Taking a moment to appreciate the surreal beauty of ${subject}.`;
    }
  }

  // Strictly 1 main Topic Tag
  const singleTopicTag = tagsPool[0] || "#Storytelling";

  const room = THREADS_MAX - singleTopicTag.length - 2;
  const safeTitle =
    conversationalTitle.length > room
      ? `${conversationalTitle.slice(0, room - 1).trimEnd()}…`
      : conversationalTitle;
  const caption = `${safeTitle}\n\n${singleTopicTag}`.trim().slice(0, THREADS_MAX);

  return {
    title: safeTitle.slice(0, 100),
    caption,
    tags: [singleTopicTag.slice(1)],
  };
}

/**
 * Builds the exact text and metadata each destination platform should receive.
 * Dynamically analyzes the underlying script/story to generate unique, context-aware titles.
 */
export function buildPlatformContent(
  provider: SocialProvider,
  source: ContentSource,
): PlatformContent {
  const cleanStory = extractCleanStory(source);
  const subject = extractCoreSubject(cleanStory, source.category);
  const tagsPool = extractDynamicHashtags(source);

  // 1. YouTube Shorts
  if (provider === "youtube") {
    let ytTitle: string;
    let ytTags: string[];

    if (source.generatedTitles?.youtube?.title) {
      ytTitle = source.generatedTitles.youtube.title;
      ytTags = source.generatedTitles.youtube.hashtags.map((t) => t.replace(/^#/, ""));
      const joinedTags = source.generatedTitles.youtube.hashtags.join(" ");
      if (joinedTags && !ytTitle.includes("#")) {
        ytTitle = `${ytTitle} ${joinedTags}`.slice(0, 100).trim();
      }
    } else {
      const yt = buildYouTubeShortsTitle(subject, cleanStory, source.hookTitle, tagsPool);
      ytTitle = yt.title;
      ytTags = yt.tags;
    }

    const descTags = tagsPool.slice(0, 15);
    const description = [ytTitle, cleanStory, CALL_TO_ACTION, descTags.join(" ")]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4900);

    return {
      title: ytTitle,
      description,
      caption: description,
      tags: ytTags,
      provider: "youtube",
    };
  }

  // 2. Threads
  if (provider === "threads") {
    if (source.generatedTitles?.threads?.title) {
      const thTitle = source.generatedTitles.threads.title;
      const thTag = source.generatedTitles.threads.hashtags[0] ?? tagsPool[0] ?? "#Story";
      const formattedTag = thTag.startsWith("#") ? thTag : `#${thTag}`;
      const caption = `${thTitle} ${formattedTag}`.slice(0, 500).trim();
      return {
        title: thTitle,
        description: cleanStory.slice(0, 500),
        caption,
        tags: [formattedTag.replace(/^#/, "")],
        provider: "threads",
      };
    }

    const th = buildThreadsContent(subject, cleanStory, source.hookTitle, tagsPool);
    return {
      title: th.title,
      description: cleanStory.slice(0, 500),
      caption: th.caption,
      tags: th.tags,
      provider: "threads",
    };
  }

  // 3. Meta (Instagram Reels & Facebook Reels)
  if (source.generatedTitles?.meta?.title) {
    const hook = source.generatedTitles.meta.title;
    const metaTags = (source.generatedTitles.meta.hashtags || tagsPool).slice(0, 5);
    const firstNarrativeSentence = cleanStory.split(/[.!?\n]/)[0]?.trim();
    const storyLead =
      firstNarrativeSentence &&
      firstNarrativeSentence.length > 20 &&
      firstNarrativeSentence !== hook
        ? firstNarrativeSentence
        : cleanStory.slice(0, 200).trimEnd();

    const caption = `${hook}\n\n${storyLead}\n\n${metaTags.join(" ")}`.trim();
    return {
      title: hook.slice(0, 100),
      description: cleanStory.slice(0, 1200),
      caption,
      tags: metaTags.map((t) => t.replace(/^#/, "")),
      provider: provider === "facebook_page" ? "facebook_page" : "instagram",
    };
  }

  const meta = buildMetaReelsContent(subject, cleanStory, source.hookTitle, tagsPool);
  return {
    title: meta.title,
    description: cleanStory.slice(0, 1200),
    caption: meta.caption,
    tags: meta.tags,
    provider: provider === "facebook_page" ? "facebook_page" : "instagram",
  };
}

/**
 * Backwards-compatible single-caption builder (Instagram/Facebook shape).
 */
export function buildPublishCaption(source: ContentSource): string {
  return buildPlatformContent("instagram", source).caption;
}

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

export type ContentSource = {
  hookTitle?: string | null;
  hashtags?: unknown;
  caption?: string | null;
  name?: string | null;
  category?: string | null;
};

export type PlatformContent = {
  /** Platform title (YouTube / Facebook video title). */
  title: string;
  /** Long-form description (YouTube / Facebook). */
  description: string;
  /** Post caption or text body (Instagram, Facebook, Threads). */
  caption: string;
  /** Plain tag words (no `#`) for APIs that take a tag list. */
  tags: string[];
};

const YOUTUBE_TITLE_MAX = 100;
const THREADS_MAX = 500;

function hookOf(source: ContentSource): string {
  return (
    oneLine(source.hookTitle) || oneLine(source.caption) || oneLine(source.name) || FALLBACK_HOOK
  );
}

/** A short paragraph summary for description fields. */
function summaryOf(source: ContentSource, hook: string): string {
  const body = sanitizeText(source.caption) || sanitizeText(source.name);
  const topic = sanitizeText(source.category) || "this story";
  const lead = body && body !== hook ? body : `A short cinematic look at ${topic.toLowerCase()}.`;
  return lead.length > 1200 ? `${lead.slice(0, 1199).trimEnd()}…` : lead;
}

/**
 * Builds the exact text each platform should receive.
 * `action` only changes tone, never the rules above.
 */
export function buildPlatformContent(
  provider: SocialProvider,
  source: ContentSource,
): PlatformContent {
  const hook = hookOf(source);
  const pool = hashtagPool(source, 15);
  const tags = pool.map((t) => t.slice(1));

  if (provider === "youtube") {
    const titleTags = pool.slice(0, 3);
    let title = hook;
    for (const tag of titleTags) {
      if (`${title} ${tag}`.length <= YOUTUBE_TITLE_MAX) title = `${title} ${tag}`;
    }
    const descTags = pool.slice(0, Math.max(10, Math.min(15, pool.length)));
    const description = [summaryOf(source, hook), CALL_TO_ACTION, descTags.join(" ")]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4900);
    return { title: title.slice(0, YOUTUBE_TITLE_MAX), description, caption: description, tags };
  }

  if (provider === "threads") {
    const threadTags = pool.slice(0, 3).join(" ");
    const room = THREADS_MAX - threadTags.length - 2;
    const body = oneLine(hook, Math.max(40, room));
    return {
      title: hook.slice(0, 100),
      description: body,
      caption: `${body}\n\n${threadTags}`.slice(0, THREADS_MAX),
      tags: pool.slice(0, 3).map((t) => t.slice(1)),
    };
  }

  // Instagram + Facebook: caption with 4-5 high-engagement hashtags.
  const socialTags = pool.slice(0, 5);
  const caption = `${hook}\n\n${socialTags.join(" ")}`.trim();
  return {
    title: hook.slice(0, 100),
    description: summaryOf(source, hook),
    caption,
    tags: socialTags.map((t) => t.slice(1)),
  };
}

/**
 * Backwards-compatible single-caption builder (Instagram/Facebook shape).
 */
export function buildPublishCaption(source: ContentSource): string {
  return buildPlatformContent("instagram", source).caption;
}

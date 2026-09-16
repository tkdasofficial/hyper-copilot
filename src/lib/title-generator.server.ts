/**
 * Dynamic, story-aware title generation (server-only).
 *
 * Every render gets a fresh set of titles written from its own script/story —
 * never a template. One model call produces all three platform variants:
 *
 * | Platform | Shape                                                   |
 * | -------- | ------------------------------------------------------- |
 * | YouTube  | curiosity hook + 2-3 hashtags, whole string <= 100 chars |
 * | Meta     | attention hook + 4-5 targeted hashtags                   |
 * | Threads  | short conversational line + exactly 1 topic tag          |
 *
 * Any failure returns null and the caller falls back to the deterministic
 * builder in publish-content.ts.
 */

import { sanitizeText, normalizeHashtags } from "@/lib/publish-content";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export type PlatformTitle = { title: string; hashtags: string[] };

export type GeneratedTitles = {
  youtube: PlatformTitle;
  meta: PlatformTitle;
  threads: PlatformTitle;
};

export type StorySource = {
  script?: string | null;
  caption?: string | null;
  name?: string | null;
  category?: string | null;
};

const SYSTEM = `You are a social media copywriter. From the story below write ONE completely unique set of titles.
Never reuse phrasing, never use templates or generic filler.
Return ONLY JSON in this exact shape:
{"youtube":{"title":"...","hashtags":["#a","#b"]},"meta":{"title":"...","hashtags":["#a","#b","#c","#d"]},"threads":{"title":"...","hashtags":["#a"]}}
Rules:
- youtube.title: curiosity-inducing, story-driven, NO hashtags inside it; 2-3 hashtags in the array; title + hashtags joined by spaces must stay under 100 characters.
- meta.title: attention-grabbing hook reflecting the narrative; 4-5 highly relevant hashtags.
- threads.title: short conversational statement; EXACTLY 1 topic hashtag.
- Hashtags are single words, CamelCase allowed, each starting with #.`;

function clean(text: string, max: number): string {
  const line = sanitizeText(text).split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

function pick(raw: unknown, tagLimit: number, titleMax: number): PlatformTitle | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const title = clean(String(obj["title"] ?? ""), titleMax);
  if (!title) return null;
  const hashtags = normalizeHashtags(obj["hashtags"], tagLimit);
  return { title, hashtags };
}

/** Generates a unique per-platform title set, or null when unavailable. */
export async function generatePlatformTitles(
  source: StorySource,
): Promise<GeneratedTitles | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;

  const story = sanitizeText(
    [source.script, source.caption, source.name].filter(Boolean).join("\n\n"),
  ).slice(0, 4000);
  if (!story) return null;

  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 1,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Topic/category: ${sanitizeText(source.category) || "general"}\n\nStory/script:\n${story}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    const youtube = pick(parsed["youtube"], 3, 90);
    const meta = pick(parsed["meta"], 5, 120);
    const threads = pick(parsed["threads"], 1, 200);
    if (!youtube || !meta || !threads) return null;

    // Hard cap: YouTube title + hashtags must fit in 100 characters.
    let ytTitle = youtube.title;
    const ytTags: string[] = [];
    for (const tag of youtube.hashtags) {
      if (`${ytTitle} ${[...ytTags, tag].join(" ")}`.length <= 100) ytTags.push(tag);
    }
    if (`${ytTitle} ${ytTags.join(" ")}`.length > 100) {
      ytTitle = ytTitle.slice(0, Math.max(10, 100 - ytTags.join(" ").length - 1)).trimEnd();
    }

    return {
      youtube: { title: ytTitle, hashtags: ytTags },
      meta,
      threads: { title: threads.title, hashtags: threads.hashtags.slice(0, 1) },
    };
  } catch {
    return null;
  }
}

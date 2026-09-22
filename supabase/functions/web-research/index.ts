import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const GITHUB_REPO_OWNER = "TKDasOfficial";
const GITHUB_REPO_NAME = Deno.env.get("GITHUB_REPO_NAME") || "hyper-copilot-runtime";
const GITHUB_DISPATCH_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`;

interface LightResearchResult {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  headings?: string[];
  snippets?: string[];
  contentSummary?: string;
  sourceUrl?: string;
  fetchedAt: string;
}

/**
 * Lightweight fast HTML metadata parser (zero heavy dependencies).
 * Restricts parsing to the first 256KB to keep memory and execution ultra-light.
 */
function parseLightHtml(html: string, sourceUrl: string): LightResearchResult {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const descMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  const description = descMatch ? descMatch[1].trim() : "";

  const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1].trim() : sourceUrl;

  // Extract top h1/h2 headings
  const headings: string[] = [];
  const headingRegex = /<h[1-2][^>]*>([^<]+)<\/h[1-2]>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 5) {
    const text = hMatch[1].replace(/\s+/g, " ").trim();
    if (text) headings.push(text);
  }

  // Fast text strip for summary snippet (first 1000 chars)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const rawBody = bodyMatch ? bodyMatch[1] : html;
  const stripped = rawBody
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const contentSummary = stripped.slice(0, 1000);

  return {
    title,
    description,
    canonicalUrl,
    headings,
    contentSummary,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fast lightweight search query via DuckDuckGo Instant Answer API
 */
async function executeLightSearch(query: string) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "HyperCopilot-LightweightSDK/1.0" },
  });
  if (!res.ok) {
    return { results: [], query, notice: "Fast search unavailable" };
  }
  const data = await res.json();
  const topics = (data.RelatedTopics || [])
    .slice(0, 5)
    .map((t: { Text?: string; FirstURL?: string }) => ({
      text: t.Text || "",
      url: t.FirstURL || "",
    }));

  return {
    query,
    heading: data.Heading || query,
    abstract: data.AbstractText || "",
    abstractSource: data.AbstractSource || "",
    abstractUrl: data.AbstractURL || "",
    related: topics,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const mode = (body.mode || "light").toLowerCase();

    // Mode 1: Lightweight In-App / Edge Processing
    if (mode === "light" || mode === "quick") {
      if (body.url) {
        // Fast lightweight URL metadata fetch
        const targetUrl = body.url.startsWith("http") ? body.url : `https://${body.url}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout guard

        try {
          const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; HyperCopilotLightweight/1.0)",
              Accept: "text/html,application/xhtml+xml,application/json",
            },
          });
          clearTimeout(timeoutId);

          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const json = await res.json();
            return new Response(
              JSON.stringify({ ok: true, mode: "light", type: "json", data: json }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }

          // Read up to 256KB
          const text = await res.text();
          const truncated = text.slice(0, 262144);
          const parsed = parseLightHtml(truncated, targetUrl);

          return new Response(
            JSON.stringify({ ok: true, mode: "light", type: "html", result: parsed }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          const errMsg = fetchErr instanceof Error ? fetchErr.message : "Timeout";
          return new Response(
            JSON.stringify({
              ok: false,
              mode: "light",
              error: `Lightweight fetch failed: ${errMsg}`,
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      if (body.query) {
        // Fast lightweight search
        const searchResults = await executeLightSearch(body.query);
        return new Response(
          JSON.stringify({ ok: true, mode: "light", type: "search", result: searchResults }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Mode 2: Heavy / Deep / Private Research -> Delegate to GitHub Actions Backend Runner
    const githubPat = (Deno.env.get("GITHUB_PAT") || "").trim();
    if (!githubPat) {
      return new Response(
        JSON.stringify({
          error:
            "Missing GITHUB_PAT secret required for delegating heavy research to HyperCopilot Runtime.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const researchId = body.research_id || `research_${Date.now()}`;
    const clientPayload: Record<string, string> = {
      research_id: String(researchId),
      mode: body.mode === "private" ? "private" : "public",
      query: String(body.query || "").slice(0, 500),
      target_url: String(body.url || body.target_url || "").slice(0, 500),
      auth_flow: String(body.auth_flow || "login"),
      auth_email: String(body.auth_email || "").slice(0, 100),
      otp_code: String(body.otp_code || "").slice(0, 10),
    };

    const ghRes = await fetch(GITHUB_DISPATCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubPat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "hyper-copilot-lightweight-edge",
      },
      body: JSON.stringify({
        event_type: "web_research",
        client_payload: clientPayload,
      }),
    });

    if (!ghRes.ok) {
      const errText = (await ghRes.text()).slice(0, 300);
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Failed to delegate heavy research to backend runtime: ${ghRes.status}`,
          detail: errText,
        }),
        { status: ghRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        delegated: true,
        runner: "hyper-copilot-runtime",
        researchId,
        message: "Heavy research task dispatched to isolated GitHub backend runner.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Lightweight Web SDK
 *
 * In-App / Edge-compatible Web Research & Scraping SDK.
 * - Zero heavy dependencies (no Chromium, Playwright, or C++ native binaries).
 * - Restricts client execution to lightweight API calls, fast data fetching, and minimal payloads.
 * - Seamlessly delegates heavy web scraping, private crawling, and 2FA/OTP handling to the isolated
 *   HyperCopilot Runtime backend repository (GitHub Actions CI/CD runners).
 */

export interface LightMetadataResult {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  headings?: string[];
  contentSummary?: string;
  sourceUrl?: string;
  fetchedAt: string;
}

export interface LightSearchResult {
  query: string;
  heading?: string;
  abstract?: string;
  abstractSource?: string;
  abstractUrl?: string;
  related?: Array<{ text: string; url: string }>;
}

export interface HeavyResearchDispatchParams {
  query: string;
  targetUrl?: string;
  mode?: "public" | "private";
  authFlow?: "login" | "signup" | "none";
  authEmail?: string;
  otpCode?: string;
}

export interface HeavyResearchDispatchResponse {
  ok: boolean;
  delegated: boolean;
  runner: string;
  researchId: string;
  message?: string;
  error?: string;
}

class LightweightWebSdkClient {
  private edgeFunctionUrl: string;

  constructor() {
    const supabaseUrl =
      (import.meta as unknown as { env?: { VITE_SUPABASE_URL?: string } }).env?.VITE_SUPABASE_URL ||
      "";
    this.edgeFunctionUrl = supabaseUrl
      ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/web-research`
      : "/api/web-research";
  }

  /**
   * Performs an ultra-fast in-app/edge metadata extraction from a target URL.
   * Restricts memory overhead and fetches only essential OpenGraph / schema tags.
   */
  async fetchQuickMetadata(url: string): Promise<LightMetadataResult> {
    const res = await fetch(this.edgeFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "light",
        url,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Failed to fetch lightweight metadata");
    }

    return data.result as LightMetadataResult;
  }

  /**
   * Performs an instant lightweight web search query without launching any heavy browser.
   */
  async quickSearch(query: string): Promise<LightSearchResult> {
    const res = await fetch(this.edgeFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "light",
        query,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Failed to execute lightweight search");
    }

    return data.result as LightSearchResult;
  }

  /**
   * Delegates heavy research tasks (deep scraping, private authenticated crawl, 2FA/OTP handling)
   * to the isolated HyperCopilot Runtime backend runners.
   */
  async dispatchHeavyResearch(
    params: HeavyResearchDispatchParams,
  ): Promise<HeavyResearchDispatchResponse> {
    const res = await fetch(this.edgeFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: params.mode || "public",
        query: params.query,
        target_url: params.targetUrl,
        auth_flow: params.authFlow || "login",
        auth_email: params.authEmail,
        otp_code: params.otpCode,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        delegated: false,
        runner: "hyper-copilot-runtime",
        researchId: "",
        error: data.error || data.detail || `Dispatch failed with status ${res.status}`,
      };
    }

    return {
      ok: true,
      delegated: true,
      runner: data.runner || "hyper-copilot-runtime",
      researchId: data.researchId,
      message: data.message,
    };
  }
}

export const LightweightWebSdk = new LightweightWebSdkClient();
export default LightweightWebSdk;

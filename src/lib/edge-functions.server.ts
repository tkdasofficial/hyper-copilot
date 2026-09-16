/**
 * Server-only utility for standardizing Supabase Edge Function invocations.
 *
 * All requests route strictly from the backend server to the target Edge Functions
 * via supabaseAdmin.functions.invoke, attaching required backend credentials.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getWorkerToken(): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("job_runner")
      .select("worker_token")
      .eq("id", "default")
      .maybeSingle();
    return (data?.worker_token ?? "").trim();
  } catch {
    return "";
  }
}

export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const token = await getWorkerToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["x-worker-secret"] = token;
    }

    const res = await supabaseAdmin.functions.invoke<T>(functionName, {
      body,
      headers,
    });

    if (res.error) {
      return {
        data: null,
        error: new Error(res.error.message || `Edge function ${functionName} invocation failed`),
      };
    }

    return { data: res.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

import { fetch } from "undici";
import { getLogger } from "../logging.js";

const log = getLogger("qmd-client");
const QMD_URL = process.env.QMD_URL || "http://localhost:8100";

export type Insight = {
  trigger: string;
  details: {
    match: {
      path: string;
      title: string;
      content: string;
      memory_tier: string;
      sentiment: string;
    };
    type: string;
  };
  score: number;
  created_at: string;
};

export async function fetchRecentInsights(limit: number = 5, since?: number): Promise<Insight[]> {
  try {
    const url = new URL("/insights", QMD_URL);
    url.searchParams.append("limit", limit.toString());
    if (since) {
      url.searchParams.append("since", since.toString());
    }

    const res = await fetch(url.toString(), { 
        headers: { "X-Instance-ID": "default" },
        signal: AbortSignal.timeout(2000) 
    });
    
    if (!res.ok) {
        // Silent fail if QMD is not up (Dark Deployment)
        return [];
    }

    const data = await res.json() as { insights: Insight[] };
    return data.insights || [];
  } catch (err) {
    // Log debug only to avoid noise if QMD is disabled
    log.debug("Failed to fetch QMD insights", { error: String(err) });
    return [];
  }
}

/**
 * Phase 3: Post a live conversation snippet to QMD for realtime recall.
 * Fire-and-forget — silent fail if QMD is down or recall is disabled.
 */
export async function postSnippet(sessionKey: string, text: string): Promise<void> {
  try {
    await fetch(new URL("/v1/snippets", QMD_URL).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Instance-ID": "default",
      },
      body: JSON.stringify({ session_key: sessionKey, text }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Silent — QMD may be disabled or recall not enabled
  }
}

/**
 * Reset signal counters for a session (call at turn/session end).
 */
export async function resetSnippetSession(sessionKey: string): Promise<void> {
  try {
    const url = new URL("/v1/snippets/reset", QMD_URL);
    url.searchParams.append("session_key", sessionKey);
    await fetch(url.toString(), {
      method: "POST",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Silent
  }
}

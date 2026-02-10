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

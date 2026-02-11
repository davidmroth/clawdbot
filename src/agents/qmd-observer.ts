import { getLogger } from "../logging.js";
import { queueEmbeddedPiMessage } from "./pi-embedded-runner/runs.js";

const log = getLogger("qmd-observer");

export interface Broadcaster {
  broadcast: (event: string, payload: unknown) => void;
}

// Track which sessions have already received a recall this turn (max 1 per turn)
const recalledSessions = new Set<string>();

export function resetRecallForSession(sessionKey: string) {
  recalledSessions.delete(sessionKey);
}

export function startQmdObserver(broadcaster: Broadcaster): { stop: () => void } {
  let ws: WebSocket | null = null;
  let retryTimeout: NodeJS.Timeout | null = null;
  let statusInterval: NodeJS.Timeout | null = null;
  let active = true;
  let connected = false;
  
  const QMD_URL = process.env.QMD_URL || "http://memory-service:8100";
  // Convert http(s) to ws(s)
  const WS_URL = QMD_URL.replace(/^http/, "ws") + "/ws";

  // Periodically re-broadcast connection status so late-joining UI clients get it
  statusInterval = setInterval(() => {
    broadcaster.broadcast("qmd/status", { connected });
  }, 10_000);

  function connect() {
    if (!active) return;
    
    // Check if we are stuck in a fast fail loop
    const now = Date.now();
    
    try {
      log.debug("Connecting to QMD stream", { url: WS_URL });
      ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        log.info("Connected to QMD stream");
        connected = true;
        broadcaster.broadcast("qmd/status", { connected: true });
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          // Only forward actual events, filter pongs/acks if needed
          if (data.type === "pong" || data.type === "ack") return;
          
          // Phase 3: Handle recall signals from snippet processor
          if (data.type === "snippet.signal") {
            handleRecallSignal(data.data, broadcaster);
          }

          // Broadcast to UI
          // We wrap the raw QMD event in a qmd/stream event for the UI
          broadcaster.broadcast("qmd/stream", data);
        } catch (err) {
          log.warn("Failed to parse QMD message", { error: String(err) });
        }
      };
      
      ws.onclose = () => {
        log.debug("QMD stream closed");
        connected = false;
        broadcaster.broadcast("qmd/status", { connected: false });
        scheduleReconnect();
      };
      
      ws.onerror = (err: Event) => {
        // Just log, onclose will trigger reconnect
        // log.debug("QMD stream error", { error: "WebSocket error" });
      };
      
    } catch (err) {
      log.error("Failed to create WebSocket", { error: String(err) });
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (!active) return;
    if (retryTimeout) clearTimeout(retryTimeout);
    retryTimeout = setTimeout(connect, 5000);
  }

  connect();

  function handleRecallSignal(
    signal: {
      type: string;
      memory_tier?: string;
      matched_text?: string;
      matched_path?: string;
      similarity_score?: number;
      session_key?: string;
    },
    broadcaster: Broadcaster,
  ) {
    const sessionKey = signal.session_key;
    if (!sessionKey) return;

    // Max 1 recall injection per turn per session
    if (recalledSessions.has(sessionKey)) {
      log.debug("Recall already sent for session, skipping", { sessionKey });
      return;
    }

    const score = signal.similarity_score ?? 0;
    const path = signal.matched_path ?? "unknown";
    const title = signal.matched_text ?? "unknown";
    const tier = signal.memory_tier ?? "unknown";

    const recallMessage = [
      `⚡ [MEMORY RECALL] A highly relevant memory was found in your knowledge base.`,
      `File: ${path} | Tier: ${tier} | Title: "${title}" | Confidence: ${Math.round(score * 100)}%`,
      `Please consider this context in your response.`,
    ].join("\n");

    const queued = queueEmbeddedPiMessage(sessionKey, recallMessage);
    if (queued) {
      recalledSessions.add(sessionKey);
      log.info("Memory recall injected", { sessionKey, path, score: score.toFixed(3) });
      
      // Broadcast to UI for Cortex visualization
      broadcaster.broadcast("qmd/signal", signal);
    } else {
      log.debug("Could not queue recall — no active run or not streaming", { sessionKey });
    }
  }

  return {
    stop: () => {
      active = false;
      connected = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (statusInterval) clearInterval(statusInterval);
      if (ws) {
         ws.close(); 
         ws = null;
      }
    }
  };
}

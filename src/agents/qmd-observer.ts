import { createSubsystemLogger } from "../logging.js";
import { getActiveEmbeddedRunKeys, queueEmbeddedPiMessage, tagRunWithRecall } from "./pi-embedded-runner/runs.js";

const log = createSubsystemLogger("qmd-observer");

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
            log.info("Received snippet.signal from QMD", {
              sessionKey: data.data?.session_key,
              score: data.data?.similarity_score,
              path: data.data?.matched_path,
            });
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
        log.info("QMD stream closed, will reconnect in 5s");
        connected = false;
        broadcaster.broadcast("qmd/status", { connected: false });
        scheduleReconnect();
      };
      
      ws.onerror = (err: Event) => {
        log.warn("QMD stream error", { url: WS_URL });
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
      matched_content?: string;
      similarity_score?: number;
      session_key?: string;
    },
    broadcaster: Broadcaster,
  ) {
    const sessionKey = signal.session_key;
    if (!sessionKey) {
      log.warn("Recall signal missing session_key, dropping", { signal });
      return;
    }

    const activeKeys = getActiveEmbeddedRunKeys();
    log.debug("Recall signal received", {
      sessionKey,
      path: signal.matched_path,
      score: signal.similarity_score?.toFixed(3),
      activeRunKeys: activeKeys,
      alreadyRecalled: recalledSessions.has(sessionKey),
    });

    // Max 1 recall injection per turn per session
    if (recalledSessions.has(sessionKey)) {
      log.debug("Recall already sent for session this turn, skipping", { sessionKey });
      return;
    }

    const score = signal.similarity_score ?? 0;
    const path = signal.matched_path ?? "unknown";
    const title = signal.matched_text ?? "unknown";
    const tier = signal.memory_tier ?? "unknown";
    const content = signal.matched_content;

    const recallLines = [
      `⚡ [MEMORY RECALL] A highly relevant memory was found in your knowledge base.`,
      `File: ${path} | Tier: ${tier} | Title: "${title}" | Confidence: ${Math.round(score * 100)}%`,
    ];
    if (content) {
      recallLines.push(`--- BEGIN RECALLED CONTENT ---`, content, `--- END RECALLED CONTENT ---`);
      recallLines.push(`Use the above content to inform your response.`);
    } else {
      recallLines.push(`You MUST read the file "${path}" using your file-read tool to retrieve the relevant context before responding.`);
    }
    const recallMessage = recallLines.join("\n");

    const queued = queueEmbeddedPiMessage(sessionKey, recallMessage, "system");
    if (queued) {
      tagRunWithRecall(sessionKey);
      recalledSessions.add(sessionKey);
      log.info("Memory recall injected", { sessionKey, path, score: score.toFixed(3) });

      // Broadcast to UI for Cortex visualization
      broadcaster.broadcast("qmd/signal", signal);
    } else {
      log.warn("Could not queue recall — queueEmbeddedPiMessage returned false", {
        sessionKey,
        activeRunKeys: getActiveEmbeddedRunKeys(),
        path,
        score: score.toFixed(3),
      });
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

import type { VerboseLevel } from "../auto-reply/thinking.js";

export type AgentEventStream =
  | "lifecycle"
  | "tool"
  | "assistant"
  | "error"
  | "llm-req"
  | "llm-res"
  | (string & {});

export type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: AgentEventStream;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
};

export type RecallMeta = {
  injectedAt: number; // Date.now() when recall was queued
  deliveryMode: "pre-prompt" | "steer"; // Whether LLM was streaming
  score: number; // Similarity score (0-1)
  path: string; // Matched QMD file path
  tier: string; // Memory tier (semantic, episodic, etc.)
  title: string; // Matched document title
};

export type AgentRunContext = {
  sessionKey?: string;
  verboseLevel?: VerboseLevel;
  runSource?: string; // "user" | "recall" | "heartbeat" | "cron" | "consciousness"
  recallMeta?: RecallMeta;
};

// Keep per-run counters so streams stay strictly monotonic per runId.
const seqByRun = new Map<string, number>();
const listeners = new Set<(evt: AgentEventPayload) => void>();
const runContextById = new Map<string, AgentRunContext>();

export function registerAgentRunContext(
  runId: string,
  context: AgentRunContext,
) {
  if (!runId) return;
  const existing = runContextById.get(runId);
  if (!existing) {
    runContextById.set(runId, { ...context });
    return;
  }
  if (context.sessionKey && existing.sessionKey !== context.sessionKey) {
    existing.sessionKey = context.sessionKey;
  }
  if (context.verboseLevel && existing.verboseLevel !== context.verboseLevel) {
    existing.verboseLevel = context.verboseLevel;
  }
  if (context.runSource) {
    existing.runSource = context.runSource;
  }
  if (context.recallMeta) {
    existing.recallMeta = context.recallMeta;
  }
}

export function getAgentRunContext(runId: string) {
  return runContextById.get(runId);
}

export function clearAgentRunContext(runId: string) {
  runContextById.delete(runId);
}

export function resetAgentRunContextForTest() {
  runContextById.clear();
}

export function emitAgentEvent(event: Omit<AgentEventPayload, "seq" | "ts">) {
  const nextSeq = (seqByRun.get(event.runId) ?? 0) + 1;
  seqByRun.set(event.runId, nextSeq);
  const context = runContextById.get(event.runId);
  const sessionKey =
    typeof event.sessionKey === "string" && event.sessionKey.trim()
      ? event.sessionKey
      : context?.sessionKey;
  const enriched: AgentEventPayload = {
    ...event,
    sessionKey,
    seq: nextSeq,
    ts: Date.now(),
  };
  for (const listener of listeners) {
    try {
      listener(enriched);
    } catch {
      /* ignore */
    }
  }
}

export function onAgentEvent(listener: (evt: AgentEventPayload) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

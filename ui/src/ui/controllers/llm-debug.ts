import type { ClawdbotApp } from "../app";

export type LlmInteraction = {
  id: string; // timestamp + runId
  ts: number;
  runId: string;
  provider: string;
  model: string;
  system: string;
  messages: unknown[];
  tools?: unknown[];
  config?: unknown;
  durationMs?: number;
  responseError?: string;
  responseUsage?: unknown;
  chunksCount?: number;
  responseText?: string; // Actual LLM response content
  status: "pending" | "complete" | "error";
  // True for intermediate tool-call-only LLM responses (no user-facing text)
  // These occur during tool loops before the final response
  isToolCallOnly?: boolean;
};

// Partial definition of the event payload we expect from the gateway
type AgentEventPayload = {
  runId: string;
  stream: string;
  data: any;
};

export function handleLlmEvent(state: ClawdbotApp, evt: AgentEventPayload) {
  if (evt.stream === "llm-req") {
    const data = evt.data;
    const entry: LlmInteraction = {
      id: `${Date.now()}-${evt.runId}`,
      ts: Date.now(),
      runId: evt.runId,
      provider: data.provider,
      model: data.model,
      system:
        typeof data.system === "string"
          ? data.system
          : JSON.stringify(data.system),
      messages: data.messages ?? [],
      tools: data.tools,
      config: data.config,
      status: "pending",
    };
    // Keep last 50
    state.llmDebugHistory = [entry, ...state.llmDebugHistory].slice(0, 50);
  } else if (evt.stream === "llm-res") {
    const data = evt.data;
    const index = state.llmDebugHistory.findIndex(
      (x) => x.runId === evt.runId && x.status === "pending",
    );
    if (index !== -1) {
      // If this is a tool-call-only response (intermediate LLM call during tool loop),
      // remove it from the history instead of keeping it as a confusing trace
      if (data.isToolCallOnly) {
        const history = [...state.llmDebugHistory];
        history.splice(index, 1);
        state.llmDebugHistory = history;
        return;
      }

      const history = [...state.llmDebugHistory];
      history[index] = {
        ...history[index],
        durationMs: data.durationMs,
        responseError: data.error,
        responseUsage: data.usage,
        chunksCount: data.chunksCount,
        responseText: data.responseText, // Store the actual response text
        status: data.error ? "error" : "complete",
      };
      state.llmDebugHistory = history;
    }
  }
}

export function loadLlmDebug(state: ClawdbotApp) {
  // No-op for now
}

import type { ClawdbotApp } from "../app";

// Tool call details captured from LLM response and tool execution events
export type ToolCallInfo = {
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
  // Tool result fields (populated from stream: "tool" events)
  result?: string;       // Stringified result
  isError?: boolean;     // Whether result is an error
  status?: "pending" | "running" | "complete";
};

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
  // Aggregated tool calls from all intermediate LLM responses in this turn
  toolCalls?: ToolCallInfo[];
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
    // Check if we already have an entry for this runId (from previous intermediate call)
    // If so, don't create a new entry - we aggregate into the existing one
    const existingIndex = state.llmDebugHistory.findIndex(
      (x) => x.runId === evt.runId,
    );
    if (existingIndex !== -1) {
      // Entry already exists for this turn, don't create duplicate
      return;
    }

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
      toolCalls: [], // Initialize empty array for aggregation
    };
    // Keep last 50
    state.llmDebugHistory = [entry, ...state.llmDebugHistory].slice(0, 50);
  } else if (evt.stream === "llm-res") {
    const data = evt.data;
    // Find entry by runId (any status, not just pending)
    const index = state.llmDebugHistory.findIndex(
      (x) => x.runId === evt.runId,
    );
    if (index !== -1) {
      const history = [...state.llmDebugHistory];
      const existing = history[index];

      // Aggregate tool calls from this response
      const newToolCalls: ToolCallInfo[] = data.toolCalls || [];
      const aggregatedToolCalls = [
        ...(existing.toolCalls || []),
        ...newToolCalls,
      ];

      // Accumulate duration
      const totalDuration = (existing.durationMs || 0) + (data.durationMs || 0);

      if (data.isToolCallOnly) {
        // Intermediate response: aggregate tool calls, keep status pending
        history[index] = {
          ...existing,
          durationMs: totalDuration,
          toolCalls: aggregatedToolCalls,
          // Keep status as pending until final response
        };
      } else {
        // Final response: set final text, usage, and mark complete
        history[index] = {
          ...existing,
          durationMs: totalDuration,
          responseError: data.error,
          responseUsage: data.usage,
          chunksCount: (existing.chunksCount || 0) + (data.chunksCount || 0),
          responseText: data.responseText,
          toolCalls: aggregatedToolCalls,
          status: data.error ? "error" : "complete",
        };
      }
      state.llmDebugHistory = history;
    }
  } else if (evt.stream === "tool") {
    // Handle real-time tool execution events
    const data = evt.data ?? {};
    const toolCallId = data.toolCallId as string | undefined;
    const phase = data.phase as string | undefined;

    // Find the interaction by runId
    const index = state.llmDebugHistory.findIndex((x) => x.runId === evt.runId);
    if (index === -1 || !toolCallId) return;

    const history = [...state.llmDebugHistory];
    const existing = history[index];
    const toolCalls = [...(existing.toolCalls || [])];

    // Find existing tool call entry by toolCallId
    const tcIndex = toolCalls.findIndex((tc) => tc.toolCallId === toolCallId);

    if (phase === "start") {
      // Tool execution starting - add or update entry with running status
      const newTc: ToolCallInfo = {
        toolCallId,
        toolName: data.name as string,
        toolArgs: data.args ? JSON.stringify(data.args) : undefined,
        status: "running",
      };
      if (tcIndex === -1) {
        toolCalls.push(newTc);
      } else {
        toolCalls[tcIndex] = { ...toolCalls[tcIndex], ...newTc };
      }
    } else if (phase === "result") {
      // Tool execution complete - update with result
      if (tcIndex !== -1) {
        toolCalls[tcIndex] = {
          ...toolCalls[tcIndex],
          result: data.result ? JSON.stringify(data.result) : undefined,
          isError: data.isError as boolean | undefined,
          status: "complete",
        };
      } else {
        // Tool call not found, create new entry with result
        toolCalls.push({
          toolCallId,
          toolName: data.name as string,
          result: data.result ? JSON.stringify(data.result) : undefined,
          isError: data.isError as boolean | undefined,
          status: "complete",
        });
      }
    }

    history[index] = { ...existing, toolCalls };
    state.llmDebugHistory = history;
  }
}

export function loadLlmDebug(state: ClawdbotApp) {
  // No-op for now
}

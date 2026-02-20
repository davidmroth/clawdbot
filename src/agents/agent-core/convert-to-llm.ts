/**
 * Enhanced convertToLlm — converts `role: "system"` messages to synthetic
 * `toolCall`/`toolResult` pairs so the content reaches all LLM provider
 * adapters with proper "system returned data" semantics.
 *
 * **Problem**: The upstream pi-agent-core `defaultConvertToLlm` filters to only
 * `user | assistant | toolResult`, silently dropping system messages. Even when
 * preserved, the pi-ai Google adapter (`google-shared.js` → `convertMessages`)
 * also only handles those three roles — system messages are silently dropped by
 * its `if/else if` chain before reaching the Gemini API.
 *
 * **Solution**: Convert each system message into a toolCall/toolResult pair:
 *   1. Append a synthetic `toolCall` to the preceding assistant message
 *   2. Emit a `toolResult` containing the system message content
 *
 * This avoids consecutive same-role messages (Gemini requires alternating turns)
 * and gives the content proper "system returned data" semantics — the LLM sees
 * it as data returned from a tool, not as user input or its own prior output.
 *
 * The original `role: "system"` is preserved in the internal agent message history
 * for tracing and UI display; only the LLM-facing copy gets the conversion.
 *
 * When `CLAWDBOT_LOCAL_AGENT_CORE=true`, this replaces the default
 * converter on the Agent instance via `applyEnhancedConvertToLlm`.
 */

import type { AgentMessage } from "./types.js";

type LlmMessage = AgentMessage & { role: string };

/** Tool name used for synthetic system-context injection. */
const SYSTEM_CONTEXT_TOOL = "system_context";

/** Counter for generating unique synthetic tool call IDs within a process. */
let syntheticIdCounter = 0;

/**
 * Generate a unique ID for synthetic tool calls.
 * Uses a monotonic counter + timestamp to avoid collisions.
 */
function makeSyntheticToolCallId(): string {
  return `${SYSTEM_CONTEXT_TOOL}_${Date.now()}_${++syntheticIdCounter}`;
}

/**
 * Convert `role: "system"` messages into synthetic `toolCall`/`toolResult` pairs.
 *
 * For each system message:
 *   - A synthetic `toolCall` is appended to the last preceding assistant message
 *     (or a new synthetic assistant is created if none exists)
 *   - A `toolResult` is emitted with the system message's content
 *
 * All other roles (`user`, `assistant`, `toolResult`) pass through unchanged.
 *
 * This matches the upstream signature: `(messages: AgentMessage[]) => Message[]`.
 */
export function convertToLlmEnhanced(messages: AgentMessage[]): LlmMessage[] {
  const result: LlmMessage[] = [];

  for (const m of messages as LlmMessage[]) {
    // Pass through standard roles unchanged
    if (
      m.role === "user" ||
      m.role === "assistant" ||
      m.role === "toolResult"
    ) {
      result.push(m);
      continue;
    }

    // Skip non-standard, non-system roles
    if (m.role !== "system") continue;

    // --- Convert system → synthetic toolCall + toolResult ---

    const toolCallId = makeSyntheticToolCallId();
    const systemText =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter((c: { type: string; text?: string }) => c.type === "text")
              .map((c: { text: string }) => c.text)
              .join("\n")
          : String(m.content);

    const toolCall = {
      type: "toolCall" as const,
      id: toolCallId,
      name: SYSTEM_CONTEXT_TOOL,
      arguments: {},
    };

    // Append the synthetic toolCall to the last assistant message.
    // This avoids consecutive assistant messages which violate Gemini's
    // alternating turn requirement.
    const lastAssistantIdx = findLastIndex(
      result,
      (msg) => msg.role === "assistant",
    );

    if (lastAssistantIdx >= 0) {
      const prev = result[lastAssistantIdx];
      const prevContent = Array.isArray(prev.content) ? prev.content : [];
      result[lastAssistantIdx] = {
        ...prev,
        content: [...prevContent, toolCall],
      } as LlmMessage;
    } else {
      // No preceding assistant — this system message will become the first
      // entry in the conversation. Gemini requires function calls to come
      // AFTER a user turn, so we prepend a user bootstrap before the
      // synthetic assistant. (Same pattern as sanitizeGoogleTurnOrdering.)
      const ts = (m as any).timestamp || Date.now();
      result.push({
        role: "user",
        content: "(system context)",
        timestamp: ts,
      } as LlmMessage);
      result.push({
        role: "assistant",
        content: [toolCall],
        timestamp: ts,
      } as LlmMessage);
    }

    // Emit the toolResult with the system message content
    result.push({
      role: "toolResult",
      toolCallId,
      toolName: SYSTEM_CONTEXT_TOOL,
      content: [{ type: "text", text: systemText }],
      isError: false,
      timestamp: (m as any).timestamp || Date.now(),
    } as LlmMessage);
  }

  return result;
}

/** Find the last index in an array matching a predicate. */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

/**
 * Apply the enhanced convertToLlm to an Agent instance.
 *
 * `convertToLlm` is a private field on the `Agent` class, so we
 * access it via bracket notation. This is intentionally scoped to the
 * feature flag and will be removed when the full local Agent replaces
 * the upstream dependency.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyEnhancedConvertToLlm(agent: any): void {
  if (agent && typeof agent === "object") {
    agent.convertToLlm = convertToLlmEnhanced;
  }
}

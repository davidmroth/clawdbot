/**
 * Enhanced convertToLlm — preserves `role: "system"` messages and `_meta` tags.
 *
 * The upstream pi-agent-core `defaultConvertToLlm` filters to only
 * `user | assistant | toolResult`, silently dropping system messages.
 * This version keeps system messages so they actually reach the LLM,
 * enabling proper heartbeat instructions, recall context injection,
 * and any other system-initiated content.
 *
 * When `CLAWDBOT_LOCAL_AGENT_CORE=true`, this replaces the default
 * converter on the Agent instance via `applyEnhancedConvertToLlm`.
 */

import type { AgentMessage } from "./types.js";

type LlmMessage = AgentMessage & { role: string };

/**
 * Keep user, assistant, toolResult **and** system messages.
 * This matches the upstream signature: `(messages: AgentMessage[]) => Message[]`.
 */
export function convertToLlmEnhanced(messages: AgentMessage[]): LlmMessage[] {
  return (messages as LlmMessage[]).filter(
    (m) =>
      m.role === "user" ||
      m.role === "assistant" ||
      m.role === "toolResult" ||
      m.role === "system",
  );
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

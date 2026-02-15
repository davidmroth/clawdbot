/**
 * Local agent-core module — full replacement for @mariozechner/pi-agent-core.
 *
 * This module contains a local copy of pi-agent-core (v0.49.3) with
 * Clawdbot-specific enhancements:
 *  - `defaultConvertToLlm` preserves `role: "system"` messages
 *  - All types are locally owned for independent evolution
 *
 * The re-export shim allows consuming files to gradually migrate from
 * `@mariozechner/pi-agent-core` to `../agent-core/index.js`.
 *
 * Once all imports are migrated, `@mariozechner/pi-agent-core` can be
 * removed from package.json (it will remain as a transitive dep of
 * pi-coding-agent).
 */

// Core Agent
export { Agent } from "./agent.js";
export type { AgentOptions } from "./agent.js";

// Loop functions
export { agentLoop, agentLoopContinue } from "./agent-loop.js";

// Types
export type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentState,
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
  CustomAgentMessages,
  StreamFn,
  ThinkingLevel,
} from "./types.js";

// Local enhancements
export {
  convertToLlmEnhanced,
  applyEnhancedConvertToLlm,
} from "./convert-to-llm.js";

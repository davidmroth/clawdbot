/**
 * Feature flag: when `CLAWDBOT_LOCAL_AGENT_CORE=true`, the enhanced local
 * `convertToLlm` is applied — preserving system messages and `_meta` tags
 * that the upstream pi-agent-core silently drops.
 *
 * Default: false (original pi-agent-core behavior).
 */
export function useLocalAgentCore(): boolean {
  return process.env.CLAWDBOT_LOCAL_AGENT_CORE === "true";
}

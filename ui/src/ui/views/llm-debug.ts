// LLM Trace View - Variant A Edition
// A clean, intuitive, developer-oriented visualization tool for LLM conversation turns

import { html, nothing, TemplateResult } from "lit";
import type { LlmInteraction } from "../controllers/llm-debug";

// ============================================================================
// Types
// ============================================================================

type PhaseType =
  | "user"
  | "context"
  | "reasoning"
  | "tools"
  | "continuation"
  | "final_answer";

type TurnPhase = {
  type: PhaseType;
  icon: string;
  label: string;
  tooltip: string;
  content: unknown;
  visible: boolean;
  count?: number;
  status?: "success" | "failure" | "pending";
};

type Turn = {
  id: string;
  turnNumber: number;
  turnId: string;
  timestamp: string;
  status: "pending" | "complete" | "error";
  durationMs?: number;
  provider: string;
  model: string;
  phases: TurnPhase[];
  raw: LlmInteraction;
  isSystemInitiated: boolean;
  sourceLabel: string;
  // Extracted data for context modal
  systemPrompt?: string;
  historyMessages: any[];
  lastUserMessage?: any;
  toolDefinitions?: any[];
  usage?: any;
};

// ============================================================================
// Icon Definitions
// ============================================================================

const ICONS: Record<string, string> = {
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  context: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  reasoning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 2.76 1.12 5.26 2.93 7.07L12 22l5.07-4.93A8 8 0 0 0 12 2z"/><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 16v-2"/></svg>`,
  tools: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  continuation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  final_answer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  arrow: `<svg class="flow-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
};

// ============================================================================
// Export Helpers
// ============================================================================

function downloadJson(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function turnToExportFormat(turn: Turn) {
  // Map phase types to export key names (following UI structure)
  const phaseTypeToKey: Record<string, string> = {
    user: 'user_message',
    context: 'context',
    continuation: 'model_continuation',
    final_answer: 'final_answer',
    reasoning: 'reasoning',
    tools: 'tools',
  };

  // Core metadata (NOT duplicating context fields which are in the context phase)
  const formattedTurn: Record<string, any> = {
    id: turn.id,
    turnId: turn.turnId,
    timestamp: turn.timestamp,
    status: turn.status,
    durationMs: turn.durationMs,
    provider: turn.provider,
    model: turn.model,
    sourceLabel: turn.sourceLabel,
    isSystemInitiated: turn.isSystemInitiated,
    usage: turn.usage,
  };

  // Dynamically add visible phase contents as top-level properties
  // This follows the UI structure - if UI phases change, export changes too
  for (const phase of turn.phases) {
    if (phase.visible) {
      const key = phaseTypeToKey[phase.type] ?? phase.type;
      // For user_message, extract text content instead of raw message object
      if (phase.type === 'user') {
        formattedTurn[key] = extractTextContent(phase.content);
      } else {
        formattedTurn[key] = phase.content;
      }
    }
  }

  // Include raw interaction data at the end
  formattedTurn.raw = turn.raw;

  return formattedTurn;
}

// ============================================================================
// Data Transformation
// ============================================================================

function extractTextContent(msg: any): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text || "")
      .join(" ");
  }
  return "";
}

function stringifyToolArgs(args: unknown): string | undefined {
  if (args === undefined || args === null) return undefined;
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

function extractToolCallsFromMessages(messages: any[]): Array<{
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
}> {
  const toolCalls: Array<{ toolName?: string; toolArgs?: string; toolCallId?: string }> = [];

  for (const message of messages) {
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const item of content) {
      const itemType = item?.type;
      if (itemType === "toolCall" || itemType === "tool_call") {
        toolCalls.push({
          toolName: item?.name,
          toolArgs: stringifyToolArgs(item?.arguments),
          toolCallId: item?.id ?? item?.toolCallId,
        });
      }
    }
  }

  return toolCalls;
}

function dedupeToolCalls(toolCalls: Array<{
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
}>): Array<{
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
}> {
  const seen = new Set<string>();
  const deduped: Array<{ toolName?: string; toolArgs?: string; toolCallId?: string }> = [];

  for (const call of toolCalls) {
    const key = call.toolCallId
      ? `id:${call.toolCallId}`
      : `sig:${call.toolName ?? ""}|${call.toolArgs ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(call);
  }

  return deduped;
}

function interactionToTurn(interaction: LlmInteraction, index: number): Turn {
  const messages = interaction.messages || [];
  
  // Identify user vs system initiated
  // This logic is preserved from original file as it seems app-specific
  const userMessages = messages.filter((m: any) => m.role === "user");
  const isSystemInitiated = userMessages.some((msg: any) => {
    const content = extractTextContent(msg);
    return (
      content.includes("[cron:") ||
      content.includes("Consciousness Stream") ||
      content.includes("System Event") ||
      content.includes("Gateway Ready") ||
      content.includes("GatewayRestart") ||
      content.includes("[reminder:")
    );
  });
  const sourceLabel = isSystemInitiated ? "System" : "User";

  // Data extraction
  const systemPrompt = interaction.system;
  
  // Find the actual last user message (role === 'user'), not just the last message in the array
  // The last message could be a tool result, which is not the user's query
  const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
  
  // History is everything except the last user message
  const lastUserMsgIndex = lastUserMessage ? messages.lastIndexOf(lastUserMessage) : -1;
  const historyMessages = lastUserMsgIndex > 0 ? messages.slice(0, lastUserMsgIndex) : [];
  const lastSystemMsgIndex = lastUserMsgIndex === -1
    ? messages.map((msg: any) => msg?.role).lastIndexOf("system")
    : -1;
  const boundaryIndex =
    lastUserMsgIndex >= 0 ? lastUserMsgIndex : lastSystemMsgIndex;
  const runScopedMessages =
    boundaryIndex >= 0 ? messages.slice(boundaryIndex + 1) : [];
  
  const toolDefinitions = interaction.tools || [];
  
  // Parse response for reasoning/thinking
  // Assuming <think> tags or similar if available, otherwise treating all as response for now
  // In a real implementation, we would parse structured output if the model provides it
  const fullResponse = interaction.responseText || "";
  let reasoning = "";
  let finalAnswer = fullResponse;
  
  const thinkMatch = fullResponse.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    reasoning = thinkMatch[1].trim();
    finalAnswer = fullResponse.replace(/<think>[\s\S]*?<\/think>/i, "").trim();
  }

  // Phases construction (Variant A)
  const phases: TurnPhase[] = [];

  // 1. User Message (or System initiated)
  phases.push({
    type: "user",
    icon: ICONS.user,
    label: sourceLabel === "System" ? "System event" : "User message",
    tooltip: sourceLabel === "System" ? "System event" : "User message",
    content: lastUserMessage,
    visible: true,
  });

  // 2. Context (Full Prompt)
  // If explicit system prompt is missing, try to find it in history
  let effectiveSystemPrompt = systemPrompt;
  let effectiveHistory = [...historyMessages];
  
  if (!effectiveSystemPrompt) {
    const systemMsgIndex = historyMessages.findIndex((m: any) => m.role === "system");
    if (systemMsgIndex !== -1) {
      effectiveSystemPrompt = extractTextContent(historyMessages[systemMsgIndex]);
      effectiveHistory.splice(systemMsgIndex, 1);
    }
  }

  phases.push({
    type: "context",
    icon: ICONS.context,
    label: "Context",
    tooltip: "Full context sent to model",
    content: {
      systemPrompt: effectiveSystemPrompt,
      historyMessages: effectiveHistory,
      lastUserMessage,
      toolDefinitions,
      metadata: {}, // placeholders
    },
    visible: true,
  });

  // 3. Reasoning (Think/Plan)
  phases.push({
    type: "reasoning",
    icon: ICONS.reasoning,
    label: "Reasoning",
    tooltip: "Think / Plan",
    content: reasoning,
    visible: !!reasoning,
  });

  // 4. Tools - now using actual tool calls from aggregated LlmInteraction
  const toolCalls = dedupeToolCalls([
    ...(interaction.toolCalls || []),
    ...extractToolCallsFromMessages(runScopedMessages),
  ]);
  const hasToolCalls = toolCalls.length > 0;
  phases.push({
    type: "tools",
    icon: ICONS.tools,
    label: "Tools",
    tooltip: "Tool calls & observations",
    content: toolCalls,
    visible: hasToolCalls,
    count: toolCalls.length,
  });

  // 5. Model Continuation (Raw output)
  phases.push({
    type: "continuation",
    icon: ICONS.continuation,
    label: "Model continuation",
    tooltip: "Raw model output after tools",
    content: fullResponse,
    visible: true,
  });

  // 6. Final Answer (Cleaned)
  phases.push({
    type: "final_answer",
    icon: ICONS.final_answer,
    label: "Final answer",
    tooltip: "Cleaned response to user",
    content: finalAnswer,
    visible: true,
  });

  const date = new Date(interaction.ts);
  // Use actual runId as the source of truth for turn identification
  const turnId = interaction.runId;

  return {
    id: interaction.id,
    turnNumber: index + 1,
    turnId,
    timestamp: date.toLocaleString(),
    status: interaction.status,
    durationMs: interaction.durationMs,
    provider: interaction.provider,
    model: interaction.model,
    phases,
    raw: interaction,
    isSystemInitiated,
    sourceLabel,
    systemPrompt: typeof systemPrompt === "string" ? systemPrompt : JSON.stringify(systemPrompt),
    historyMessages,
    lastUserMessage,
    toolDefinitions,
    usage: interaction.responseUsage,
  };
}

// ============================================================================
// Styles
// ============================================================================

// Using global CSS variables from base.css where possible to ensure consistent theming.
// --bg, --card, --text, --border, --accent (red), --info (blue), --ok (green), --warn (orange)
const styles = html`
  <style>
    /* ========== Variables Local Overrides ========== */
    .llm-trace-view {
      /* Map abstract trace vars to global app vars */
      --trace-bg: var(--bg);
      --trace-card-bg: var(--card);
      --trace-card-border: var(--border);
      --trace-text: var(--text);
      --trace-text-muted: var(--muted);
      
      /* Use Blue for the trace view main accent to distinguish from Red app accent */
      --trace-accent: var(--info); 
      --trace-accent-bg: rgba(59, 130, 246, 0.1); /* blue with opacity */
      
      --trace-success: var(--ok);
      --trace-success-bg: var(--ok-subtle);
      --trace-warning: var(--warn);
      --trace-error: var(--danger);
      
      --trace-font: var(--font-body);
      --trace-mono: var(--mono);
      --trace-radius: var(--radius-lg);
      --trace-radius-sm: var(--radius-sm);
      --trace-shadow: var(--shadow-sm);
    }

    /* ========== Layout ========== */
    .llm-trace-view {
      font-family: var(--trace-font);
      background: var(--trace-bg);
      min-height: 100%;
      padding: 2rem;
      box-sizing: border-box;
      color: var(--trace-text);
      /* Ensure this container establishes a stacking context? 
         Actually, we want to avoid trapping the fixed modal if possible, 
         but since we can't move it out easily, we just ensure z-index is high. */
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .title h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0;
      /* Gradient text */
      background: linear-gradient(135deg, var(--trace-accent), #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      font-size: 0.875rem;
      color: var(--trace-text-muted);
      margin-top: 0.25rem;
    }

    .controls button {
      background: var(--trace-card-bg);
      border: 1px solid var(--trace-card-border);
      color: var(--trace-text);
      padding: 0.5rem 1rem;
      border-radius: var(--trace-radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s;
    }
    .controls button:hover {
      background: var(--trace-accent-bg);
      border-color: var(--trace-accent);
      color: var(--trace-accent);
    }
    
    .controls {
      display: flex;
      gap: 0.5rem;
    }

    /* ========== Export Button (Turn Card) ========== */
    .turn-export-btn {
      background: transparent;
      border: 1px solid var(--trace-card-border);
      color: var(--trace-text-muted);
      padding: 0.25rem 0.5rem;
      border-radius: var(--trace-radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      transition: all 0.2s;
    }
    .turn-export-btn:hover {
      background: var(--trace-accent-bg);
      border-color: var(--trace-accent);
      color: var(--trace-accent);
    }
    .turn-export-btn svg {
      width: 14px;
      height: 14px;
    }

    /* ========== Turn Card ========== */
    .turn-card {
      background: var(--trace-card-bg);
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius);
      margin-bottom: 1.5rem;
      box-shadow: var(--trace-shadow);
      overflow: hidden;
      animation: slideUp 0.3s ease-out;
    }

    .turn-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--trace-card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(to right, var(--trace-accent-bg), transparent);
    }

    .turn-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: var(--trace-text-muted);
    }

    .turn-badge {
      background: var(--trace-card-bg);
      border: 1px solid var(--trace-card-border);
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--trace-text);
    }

    .phase-row {
      display: flex;
      align-items: center;
      padding: 1.5rem;
      overflow-x: auto;
      gap: 1rem;
    }

    .phase-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      position: relative;
      min-width: 80px;
      padding: 0.75rem;
      border-radius: var(--trace-radius);
      border: 1px solid transparent;
      transition: all 0.2s;
    }

    .phase-item:hover {
      background: var(--trace-accent-bg);
      border-color: var(--trace-accent);
      transform: translateY(-2px);
    }

    .phase-icon {
      width: 32px;
      height: 32px;
      color: var(--trace-accent);
    }

    .phase-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--trace-text-muted);
      text-align: center;
      white-space: nowrap;
    }
    
    .phase-count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.25rem;
      height: 1.25rem;
      margin-left: 0.25rem;
      padding: 0 0.375rem;
      font-size: 0.625rem;
      font-weight: 600;
      color: white;
      background: var(--trace-accent);
      border-radius: 9999px;
    }
    
    .phase-arrow {
      color: var(--trace-text-muted);
      opacity: 0.3;
      width: 20px;
    }

    /* ========== Modal ========== */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85); /* Darker backdrop for better contrast */
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999; /* Very high z-index */
      padding: 2rem;
    }

    .modal {
      background: var(--trace-card-bg); /* Uses card bg which is solid */
      width: 100%;
      max-width: 900px;
      height: 85vh;
      border-radius: var(--trace-radius);
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid var(--trace-card-border);
      animation: scaleIn 0.2s ease-out;
      position: relative;
      z-index: 100000;
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--trace-card-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--trace-card-bg);
      border-radius: var(--trace-radius) var(--trace-radius) 0 0;
    }

    .modal-title {
      font-size: 1.25rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--text-strong);
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 0;
      background: var(--trace-card-bg); /* Ensure solid background */
    }

    .modal-content-scroll {
      padding: 1.5rem;
    }
    
    /* Tool Calls List */
    .tool-calls-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    .tool-call-item {
      background: var(--trace-bg);
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius-sm);
      overflow: hidden;
    }
    
    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: var(--trace-accent-bg);
      border-bottom: 1px solid var(--trace-card-border);
    }
    
    .tool-call-icon {
      width: 1rem;
      height: 1rem;
      color: var(--trace-accent);
    }
    
    .tool-call-icon svg {
      width: 100%;
      height: 100%;
    }
    
    .tool-call-name {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--trace-text);
    }
    
    .tool-call-id {
      font-size: 0.75rem;
      color: var(--trace-text-muted);
      font-family: var(--trace-mono);
      margin-left: auto;
    }
    
    .tool-call-args {
      padding: 0.75rem 1rem;
      font-family: var(--trace-mono);
      font-size: 0.8125rem;
      overflow-x: auto;
    }
    
    .tool-call-args code {
      white-space: pre-wrap;
      word-break: break-all;
    }
    
    /* Tool call error state */
    .tool-call-item.tool-call-error {
      border-color: var(--trace-error);
    }
    
    /* Status indicators */
    .tool-status {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-weight: 500;
    }
    
    .tool-status-running {
      background: var(--trace-accent-bg);
      color: var(--trace-accent);
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    .tool-status-success {
      background: rgba(34, 197, 94, 0.1);
      color: var(--trace-success);
    }
    
    .tool-status-error {
      background: rgba(239, 68, 68, 0.1);
      color: var(--trace-error);
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    /* Tool result section */
    .tool-result {
      border-top: 1px solid var(--trace-card-border);
      padding: 0.75rem 1rem;
    }
    
    .tool-result-success {
      background: rgba(34, 197, 94, 0.05);
    }
    
    .tool-result-error {
      background: rgba(239, 68, 68, 0.05);
    }
    
    .tool-result-header {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--trace-text-muted);
      margin-bottom: 0.5rem;
    }
    
    .tool-result-error .tool-result-header {
      color: var(--trace-error);
    }
    
    .tool-result-content {
      font-family: var(--trace-mono);
      font-size: 0.8125rem;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .tool-result-content pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    /* Pending/running state */
    .tool-result-pending {
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--trace-card-border);
      color: var(--trace-text-muted);
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .tool-spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid var(--trace-card-border);
      border-top-color: var(--trace-accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .modal-close {
      background: transparent;
      border: none;
      color: var(--trace-text-muted);
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 0.5rem;
    }
    .modal-close:hover {
      background: var(--bg-hover);
      color: var(--trace-text);
    }

    /* ========== Accordion ========== */
    details.accordion {
      margin-bottom: 1rem;
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius-sm);
      overflow: hidden;
      background: var(--trace-bg); /* Slightly distinct from card bg */
    }
    
    details.accordion summary {
      padding: 1rem;
      background: var(--bg-elevated); /* Explicit elevated bg */
      cursor: pointer;
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--text-strong); /* Strong text for headers */
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      list-style: none;
    }
    
    details.accordion summary::-webkit-details-marker {
      display: none;
    }
    
    details.accordion summary::after {
      content: '+';
      font-size: 1.25rem;
      color: var(--trace-text-muted);
    }
    
    details.accordion[open] summary::after {
      content: '−';
    }

    details.accordion[open] summary {
      border-bottom: 1px solid var(--trace-card-border);
    }

    .accordion-content {
      padding: 1rem;
      overflow-x: auto;
      background: var(--trace-bg);
    }

    /* ========== JSON Viewer ========== */
    .json-key { color: var(--trace-accent); }
    .json-string { color: var(--ok); }
    .json-number { color: var(--warn); }
    .json-boolean { color: #db2777; }
    .json-null { color: var(--trace-text-muted); }
    
    .json-block {
      font-family: var(--trace-mono);
      font-size: 0.813rem;
      line-height: 1.5;
      color: var(--trace-text);
    }
    
    .json-object, .json-array {
      margin-left: 1.5rem;
    }
    
    .json-collapser {
      cursor: pointer;
      user-select: none;
      color: var(--trace-text-muted);
      margin-right: 0.25rem;
      display: inline-block;
      width: 10px;
    }

    /* ========== Helper Classes ========== */
    .bg-user { background-color: var(--bg-hover); }
    .text-mono { font-family: var(--trace-mono); white-space: pre-wrap; color: var(--trace-text); }
    .p-4 { padding: 1rem; }
    .rounded { border-radius: var(--trace-radius-sm); }
    .border { border: 1px solid var(--trace-card-border); }

    /* ========== Animations ========== */
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
  </style>
`;

// ============================================================================
// Render Helpers
// ============================================================================

function renderJson(data: unknown, level = 0): TemplateResult {
  if (data === null) return html`<span class="json-null">null</span>`;
  if (data === undefined) return html`<span class="json-null">undefined</span>`;
  
  if (typeof data === 'string') return html`<span class="json-string">"${data}"</span>`;
  if (typeof data === 'number') return html`<span class="json-number">${data}</span>`;
  if (typeof data === 'boolean') return html`<span class="json-boolean">${data}</span>`;
  
  if (Array.isArray(data)) {
    if (data.length === 0) return html`[]`;
    return html`
      <div>
        <span>[</span>
        <div class="json-array">
          ${data.map((item, i) => html`
            <div>
              ${renderJson(item, level + 1)}${i < data.length - 1 ? ',' : ''}
            </div>
          `)}
        </div>
        <span>]</span>
      </div>
    `;
  }
  
  if (typeof data === 'object') {
    const keys = Object.keys(data as object);
    if (keys.length === 0) return html`{}`;
    return html`
      <div>
        <span>{</span>
        <div class="json-object">
          ${keys.map((key, i) => html`
            <div>
              <span class="json-key">"${key}"</span>: 
              ${renderJson((data as any)[key], level + 1)}${i < keys.length - 1 ? ',' : ''}
            </div>
          `)}
        </div>
        <span>}</span>
      </div>
    `;
  }
  
  return html`<span>${String(data)}</span>`;
}

function renderPhaseIcon(phase: TurnPhase, index: number, total: number, onClick: () => void) {
  if (!phase.visible) return nothing;
  
  // Show count badge for phases with multiple items (e.g., tool calls)
  const countBadge = phase.count && phase.count > 0 
    ? html`<span class="phase-count-badge">${phase.count}</span>` 
    : nothing;
  
  return html`
    <div class="phase-item" @click=${onClick} title=${phase.tooltip}>
      <div class="phase-icon" .innerHTML=${phase.icon}></div>
      <span class="phase-label">${phase.label}${countBadge}</span>
    </div>
    ${index < total - 1 ? html`<div class="phase-arrow" .innerHTML=${ICONS.arrow}></div>` : nothing}
  `;
}

function renderContextModalContent(turn: Turn) {
  const { systemPrompt, historyMessages, lastUserMessage, toolDefinitions } = turn;
  
  // Tags/Pills
  const pills = [
    { label: "Model", value: `${turn.provider}/${turn.model}` },
    { label: "Duration", value: `${turn.durationMs}ms` },
    // Estimated tokens would go here if available
  ];

  return html`
    <div class="modal-content-scroll">
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
        ${pills.map(p => html`
          <span class="turn-badge" style="font-size: 0.75rem; background: var(--trace-bg);">
            <span style="color: var(--trace-text-muted)">${p.label}:</span> ${p.value}
          </span>
        `)}
      </div>

      <!-- 1. System Prompt -->
      <details class="accordion" ?open=${true}>
        <summary>System Prompt</summary>
        <div class="accordion-content">
          <div class="text-mono p-4 bg-user rounded border">${systemPrompt || "No system prompt"}</div>
        </div>
      </details>

      <!-- 2. Conversation History -->
      <details class="accordion">
        <summary>Conversation History (${historyMessages.length} messages)</summary>
        <div class="accordion-content">
          ${historyMessages.length === 0 ? html`<div class="p-4 text-mono" style="color: var(--trace-text-muted)">No history</div>` : html`
            <div class="json-block">
              ${renderJson(historyMessages)}
            </div>
          `}
        </div>
      </details>

      <!-- 3. Current User Message -->
      <details class="accordion" ?open=${true}>
        <summary>Current User Message</summary>
        <div class="accordion-content">
          <div class="p-4 bg-user rounded border">
            ${lastUserMessage ? extractTextContent(lastUserMessage) : "No user message found"}
          </div>
          <div style="margin-top: 1rem">
            <h4 style="font-size: 0.75rem; color: var(--trace-text-muted); text-transform: uppercase;">Raw JSON</h4>
            <div class="json-block border rounded p-4">
              ${renderJson(lastUserMessage)}
            </div>
          </div>
        </div>
      </details>

      <!-- 4. Tool Definitions -->
      ${toolDefinitions && toolDefinitions.length > 0 ? html`
        <details class="accordion">
          <summary>Tool Definitions (${toolDefinitions.length})</summary>
          <div class="accordion-content">
            <div class="json-block">
              ${renderJson(toolDefinitions)}
            </div>
          </div>
        </details>
      ` : nothing}

      <!-- 5. Metadata -->
      <details class="accordion">
        <summary>Metadata & Tokens</summary>
        <div class="accordion-content">
          <div class="json-block">
            ${renderJson({
              usage: turn.usage,
              config: turn.raw.config
            })}
          </div>
        </div>
      </details>
    </div>
  `;
}

function renderToolCallItem(toolCall: any, index: number) {
  const toolName = toolCall.toolName || "unknown";
  const toolArgs = toolCall.toolArgs;
  const toolResult = toolCall.result;
  const isError = toolCall.isError;
  const status = toolCall.status || "pending";
  
  let parsedArgs: any = null;
  let parsedResult: any = null;
  
  // Try to parse JSON args for pretty display
  if (toolArgs) {
    try {
      parsedArgs = JSON.parse(toolArgs);
    } catch {
      parsedArgs = toolArgs;
    }
  }
  
  // Try to parse JSON result for pretty display
  if (toolResult) {
    try {
      parsedResult = JSON.parse(toolResult);
    } catch {
      parsedResult = toolResult;
    }
  }
  
  // Status indicator
  const statusIcon = status === "running" 
    ? html`<span class="tool-status tool-status-running">Running...</span>`
    : status === "complete" && isError
    ? html`<span class="tool-status tool-status-error">Error</span>`
    : status === "complete"
    ? html`<span class="tool-status tool-status-success">Done</span>`
    : nothing;
  
  // Result section
  const resultSection = toolResult !== undefined ? html`
    <div class="tool-result ${isError ? 'tool-result-error' : 'tool-result-success'}">
      <div class="tool-result-header">
        ${isError ? 'Error' : 'Result'}
      </div>
      <div class="tool-result-content">
        ${typeof parsedResult === "string" 
          ? html`<pre>${parsedResult}</pre>` 
          : renderJson(parsedResult)}
      </div>
    </div>
  ` : status === "running" ? html`
    <div class="tool-result-pending">
      <span class="tool-spinner"></span> Executing...
    </div>
  ` : nothing;
  
  return html`
    <div class="tool-call-item ${isError ? 'tool-call-error' : ''}">
      <div class="tool-call-header">
        <div class="tool-call-icon" .innerHTML=${ICONS.tools}></div>
        <span class="tool-call-name">${toolName}</span>
        ${statusIcon}
        ${toolCall.toolCallId ? html`<span class="tool-call-id">${toolCall.toolCallId}</span>` : nothing}
      </div>
      ${parsedArgs ? html`
        <div class="tool-call-args">
          ${typeof parsedArgs === "string" 
            ? html`<code>${parsedArgs}</code>` 
            : renderJson(parsedArgs)}
        </div>
      ` : nothing}
      ${resultSection}
    </div>
  `;
}

function renderGenericModalContent(phase: TurnPhase) {
  const content = phase.content;
  const isString = typeof content === "string";
  
  if (phase.type === "user") {
    // Specialized user view if not in context modal
    return html`
      <div class="modal-content-scroll">
         <div class="p-4 bg-user rounded border text-mono" style="font-size: 0.938rem;">
           ${extractTextContent(content)}
         </div>
      </div>
    `;
  }
  
  if (phase.type === "tools" && Array.isArray(content)) {
    // Specialized tools view showing each tool call with icon
    const toolCalls = content as any[];
    if (toolCalls.length === 0) {
      return html`
        <div class="modal-content-scroll">
          <div class="p-4 text-mono" style="color: var(--trace-text-muted)">No tool calls</div>
        </div>
      `;
    }
    return html`
      <div class="modal-content-scroll">
        <div class="tool-calls-list">
          ${toolCalls.map((tc, i) => renderToolCallItem(tc, i))}
        </div>
      </div>
    `;
  }

  return html`
    <div class="modal-content-scroll">
      ${isString ? html`
        <div class="text-mono p-4 border rounded" style="background: var(--trace-bg)">${content}</div>
      ` : html`
        <div class="json-block p-4 border rounded" style="background: var(--trace-bg)">
          ${renderJson(content)}
        </div>
      `}
    </div>
  `;
}

function renderModal(turn: Turn, phase: TurnPhase, onClose: () => void) {
  return html`
    <div class="modal-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("modal-overlay")) onClose();
    }}>
      <div class="modal">
        <header class="modal-header">
          <div class="modal-title">
            <span style="color: var(--trace-accent); display: flex;">
              <div style="width: 24px; height: 24px;" .innerHTML=${phase.icon}></div>
            </span>
            ${phase.type === "context" ? `Context sent to model – ${turn.turnId}` : phase.label}
          </div>
          <button class="modal-close" @click=${onClose}>
            <div style="width: 24px; height: 24px;" .innerHTML=${ICONS.close}></div>
          </button>
        </header>
        <div class="modal-body">
          ${phase.type === "context" 
            ? renderContextModalContent(turn) 
            : renderGenericModalContent(phase)}
        </div>
      </div>
    </div>
  `;
}

function renderTurn(
  turn: Turn, 
  index: number, 
  onPhaseClick: (phase: TurnPhase, turn: Turn) => void,
  onExport: (turn: Turn) => void
) {
  const visiblePhases = turn.phases.filter(p => p.visible);

  return html`
    <article class="turn-card">
      <div class="turn-header">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div class="turn-badge" style="background: ${turn.isSystemInitiated ? '#f3e8ff' : '#eff6ff'}; color: ${turn.isSystemInitiated ? '#7e22ce' : '#1d4ed8'}">
            ${turn.sourceLabel}
          </div>
          <span class="turn-badge">${turn.turnId}</span>
          <span style="color: var(--trace-text-muted); font-size: 0.875rem;">${turn.timestamp}</span>
        </div>
        <div class="turn-meta" style="display: flex; align-items: center; gap: 1rem;">
          <span>${turn.provider}/${turn.model}</span>
          <span style="color: ${turn.status === 'error' ? 'var(--trace-error)' : 'var(--trace-success)'}">
            ${turn.status === 'pending' ? 'Processing...' : `${turn.durationMs}ms`}
          </span>
          <button class="turn-export-btn" @click=${(e: Event) => { e.stopPropagation(); onExport(turn); }} title="Export this trace as JSON">
            <span .innerHTML=${ICONS.download}></span>
            Export
          </button>
        </div>
      </div>
      <div class="phase-row">
        ${visiblePhases.map((phase, i) => renderPhaseIcon(phase, i, visiblePhases.length, () => onPhaseClick(phase, turn)))}
      </div>
    </article>
  `;
}

// ============================================================================
// Main Component
// ============================================================================

export type LlmDebugProps = {
  history: LlmInteraction[];
  modalStep: unknown | null; // using modalStep to store the active Phase
  modalTurnId: string | null;
  onClear: () => void;
  onOpenModal: (step: any, turnId: string) => void;
  onCloseModal: () => void;
  // Export callbacks (optional - will use default behavior if not provided)
  onExportAll?: () => void;
  onExportTurn?: (turnId: string) => void;
};

export function renderLlmDebug(props: LlmDebugProps) {
  const turns = props.history.map((interaction, i) => 
    interactionToTurn(interaction, props.history.length - 1 - i)
  );

  let selectedTurn: Turn | null = null;
  let selectedPhase: TurnPhase | null = null;

  if (props.modalTurnId && props.modalStep) {
    selectedTurn = turns.find(t => t.id === props.modalTurnId) || null;
    selectedPhase = props.modalStep as TurnPhase;
  }

  const handlePhaseClick = (phase: TurnPhase, turn: Turn) => {
    props.onOpenModal(phase, turn.id);
  };

  // Export all traces as JSON
  const handleExportAll = () => {
    if (props.onExportAll) {
      props.onExportAll();
    } else {
      const exportData = {
        exportedAt: new Date().toISOString(),
        traceCount: turns.length,
        traces: turns.map(turnToExportFormat),
      };
      const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadJson(exportData, `llm-traces-${date}.json`);
    }
  };

  // Export single trace as JSON
  const handleExportTurn = (turn: Turn) => {
    if (props.onExportTurn) {
      props.onExportTurn(turn.id);
    } else {
      const exportData = turnToExportFormat(turn);
      downloadJson(exportData, `llm-trace-${turn.turnId}.json`);
    }
  };

  return html`
    ${styles}
    <div class="llm-trace-view">
      <div class="header">
        <div class="title">
          <h1>LLM Conversation Turn Diagnostic</h1>
        </div>
        <div class="controls">
          ${turns.length > 0 ? html`
            <button @click=${handleExportAll}>
              <span style="width: 16px; height: 16px;" .innerHTML=${ICONS.download}></span>
              Export All
            </button>
          ` : nothing}
          <button @click=${props.onClear}>
            <span style="width: 16px; height: 16px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </span>
            Clear History
          </button>
        </div>
      </div>

      ${turns.length === 0 ? html`
        <div style="text-align: center; padding: 4rem; color: var(--trace-text-muted); border: 2px dashed var(--trace-card-border); border-radius: var(--trace-radius);">
          No interactions recorded.
        </div>
      ` : html`
        <div>
          ${turns.map((turn, i) => renderTurn(turn, i, handlePhaseClick, handleExportTurn))}
        </div>
      `}
      ${selectedTurn && selectedPhase ? renderModal(selectedTurn, selectedPhase, props.onCloseModal) : nothing}
    </div>
  `;
}

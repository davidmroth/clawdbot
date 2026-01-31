// LLM Trace View - Modern Conversation Turn Diagnostic UI
// A beautiful, animated UI for visualizing LLM conversation turns

import { html, nothing } from "lit";
import type { LlmInteraction } from "../controllers/llm-debug";

// ============================================================================
// Types
// ============================================================================

type StepType =
  | "user"
  | "consciousness"
  | "system"
  | "think"
  | "tools"
  | "tool"
  | "assistant"
  | "response";

type TurnStep = {
  type: StepType;
  icon: string;
  label: string;
  tooltip: string;
  details: unknown;
  count?: number;
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
  steps: TurnStep[];
  raw: LlmInteraction;
  isSystemInitiated: boolean;
  sourceLabel: string;
};

// ============================================================================
// Icon Definitions (SVG inline for performance)
// ============================================================================

const STEP_ICONS: Record<StepType, string> = {
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  consciousness: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  system: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  think: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 2.76 1.12 5.26 2.93 7.07L12 22l5.07-4.93A8 8 0 0 0 12 2z"/><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 16v-2"/></svg>`,
  tools: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  tool: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  assistant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>`,
  response: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
};

const ARROW_ICON = `<svg class="flow-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

// ============================================================================
// Transform LlmInteraction to Turn format
// ============================================================================

function interactionToTurn(interaction: LlmInteraction, index: number): Turn {
  const steps: TurnStep[] = [];

  // Detect if this is a consciousness/system-initiated message
  // Check for patterns like [cron:...], "Consciousness Stream", "System Event", etc.
  const userMessages = (interaction.messages || []).filter(
    (m: any) => m.role === "user",
  );

  // Check if the first user message contains consciousness patterns
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

  // 1. System prompt step (if present)
  if (interaction.system) {
    steps.push({
      type: "system",
      icon: STEP_ICONS.system,
      label: "System",
      tooltip: "System prompt configuration",
      details: interaction.system,
    });
  }

  // 2. User/Consciousness messages
  if (userMessages.length > 0) {
    if (isSystemInitiated) {
      steps.push({
        type: "consciousness",
        icon: STEP_ICONS.consciousness,
        label: "Consciousness",
        tooltip: `System-initiated event${userMessages.length > 1 ? "s" : ""}`,
        details: userMessages,
        count: userMessages.length > 1 ? userMessages.length : undefined,
      });
    } else {
      steps.push({
        type: "user",
        icon: STEP_ICONS.user,
        label: "User",
        tooltip: `User message${userMessages.length > 1 ? "s" : ""}`,
        details: userMessages,
        count: userMessages.length > 1 ? userMessages.length : undefined,
      });
    }
  }

  // 3. Think/Processing step (always present for LLM)
  steps.push({
    type: "think",
    icon: STEP_ICONS.think,
    label: "Think",
    tooltip: "LLM reasoning and processing",
    details: {
      provider: interaction.provider,
      model: interaction.model,
      config: interaction.config,
    },
  });

  // 4. Tools (if any)
  const tools = interaction.tools || [];
  if (tools.length > 0) {
    steps.push({
      type: "tools",
      icon: STEP_ICONS.tools,
      label: "Tools",
      tooltip: `${tools.length} tool${tools.length > 1 ? "s" : ""} available`,
      details: tools,
      count: tools.length > 1 ? tools.length : undefined,
    });
  }

  // 5. Tool call messages from conversation
  const toolMessages = (interaction.messages || []).filter(
    (m: any) => m.role === "tool" || m.tool_calls,
  );
  if (toolMessages.length > 0) {
    steps.push({
      type: "tool",
      icon: STEP_ICONS.tool,
      label: "Tool Calls",
      tooltip: `${toolMessages.length} tool interaction${toolMessages.length > 1 ? "s" : ""}`,
      details: toolMessages,
      count: toolMessages.length > 1 ? toolMessages.length : undefined,
    });
  }

  // 6. Assistant messages (conversation history - prior assistant turns)
  const assistantMessages = (interaction.messages || []).filter(
    (m: any) => m.role === "assistant",
  );
  if (assistantMessages.length > 0) {
    steps.push({
      type: "assistant",
      icon: STEP_ICONS.assistant,
      label: "History",
      tooltip: `${assistantMessages.length} prior assistant message${assistantMessages.length > 1 ? "s" : ""} in context`,
      details: assistantMessages,
      count:
        assistantMessages.length > 1 ? assistantMessages.length : undefined,
    });
  }

  // 7. Final response step - includes actual response content when available
  steps.push({
    type: "response",
    icon: STEP_ICONS.response,
    label: "Response",
    tooltip:
      interaction.status === "pending"
        ? "Awaiting response..."
        : interaction.status === "error"
          ? "Error occurred"
          : `Completed in ${interaction.durationMs}ms`,
    details: {
      status: interaction.status,
      durationMs: interaction.durationMs,
      usage: interaction.responseUsage,
      chunksCount: interaction.chunksCount,
      error: interaction.responseError,
      responseText: interaction.responseText, // Actual LLM response content
    },
  });

  // Format timestamp
  const date = new Date(interaction.ts);
  const timestamp = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Generate turn ID
  const turnId = `t-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;

  return {
    id: interaction.id,
    turnNumber: index + 1,
    turnId,
    timestamp,
    status: interaction.status,
    durationMs: interaction.durationMs,
    provider: interaction.provider,
    model: interaction.model,
    steps,
    raw: interaction,
    isSystemInitiated,
    sourceLabel,
  };
}

// Helper to extract text content from a message
function extractTextContent(msg: any): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text || "")
      .join(" ");
  }
  return "";
}

// ============================================================================
// Styles (embedded CSS)
// ============================================================================

const styles = html`
  <style>
    /* ========== Base Variables ========== */
    .llm-trace-container {
      --trace-bg: #f8fafc;
      --trace-card-bg: #ffffff;
      --trace-card-border: #e2e8f0;
      --trace-accent: #3b82f6;
      --trace-accent-light: #dbeafe;
      --trace-accent-dark: #1d4ed8;
      --trace-text: #1e293b;
      --trace-text-muted: #64748b;
      --trace-success: #22c55e;
      --trace-warning: #f59e0b;
      --trace-error: #ef4444;
      --trace-shadow:
        0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      --trace-shadow-lg:
        0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
      --trace-radius: 12px;
      --trace-radius-sm: 8px;
      --trace-font:
        system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        sans-serif;
      --trace-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .llm-trace-container {
        --trace-bg: #0f172a;
        --trace-card-bg: #1e293b;
        --trace-card-border: #334155;
        --trace-text: #f1f5f9;
        --trace-text-muted: #94a3b8;
        --trace-accent-light: #1e3a5f;
      }
    }

    /* ========== Container ========== */
    .llm-trace-container {
      font-family: var(--trace-font);
      background: var(--trace-bg);
      min-height: 100%;
      padding: 2rem;
      box-sizing: border-box;
    }

    .llm-trace-inner {
      max-width: 1200px;
      margin: 0 auto;
    }

    /* ========== Header ========== */
    .trace-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--trace-card-border);
    }

    .trace-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .trace-title h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--trace-text);
      margin: 0;
      background: linear-gradient(135deg, var(--trace-accent) 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .trace-title-icon {
      width: 32px;
      height: 32px;
      color: var(--trace-accent);
    }

    .trace-actions {
      display: flex;
      gap: 0.75rem;
    }

    .trace-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1.25rem;
      background: var(--trace-card-bg);
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius-sm);
      color: var(--trace-text);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--trace-transition);
    }

    .trace-btn:hover {
      background: var(--trace-accent-light);
      border-color: var(--trace-accent);
      color: var(--trace-accent-dark);
      transform: translateY(-1px);
    }

    .trace-btn svg {
      width: 16px;
      height: 16px;
    }

    .trace-btn--primary {
      background: var(--trace-accent);
      border-color: var(--trace-accent);
      color: white;
    }

    .trace-btn--primary:hover {
      background: var(--trace-accent-dark);
      border-color: var(--trace-accent-dark);
      color: white;
    }

    /* ========== Stats Bar ========== */
    .trace-stats {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .trace-stat {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: var(--trace-card-bg);
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius-sm);
      font-size: 0.875rem;
    }

    .trace-stat__value {
      font-weight: 600;
      color: var(--trace-accent);
    }

    .trace-stat__label {
      color: var(--trace-text-muted);
    }

    /* ========== Empty State ========== */
    .trace-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      text-align: center;
      background: var(--trace-card-bg);
      border: 2px dashed var(--trace-card-border);
      border-radius: var(--trace-radius);
      animation: fadeIn 0.5s ease-out;
    }

    .trace-empty__icon {
      width: 64px;
      height: 64px;
      color: var(--trace-text-muted);
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .trace-empty__text {
      font-size: 1.125rem;
      color: var(--trace-text-muted);
      max-width: 400px;
    }

    .trace-empty__hint {
      font-size: 0.875rem;
      color: var(--trace-text-muted);
      opacity: 0.7;
      margin-top: 0.5rem;
    }

    /* ========== Turn Card ========== */
    .turn-card {
      background: var(--trace-card-bg);
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius);
      box-shadow: var(--trace-shadow);
      margin-bottom: 1.5rem;
      /* Removed overflow:hidden to allow tooltips to escape */
      animation: slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      animation-fill-mode: both;
      transition: var(--trace-transition);
      position: relative;
    }

    .turn-card:hover {
      box-shadow: var(--trace-shadow-lg);
      transform: translateY(-2px);
    }

    .turn-card--pending {
      border-left: 4px solid var(--trace-warning);
    }

    .turn-card--complete {
      border-left: 4px solid var(--trace-success);
    }

    .turn-card--error {
      border-left: 4px solid var(--trace-error);
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    /* ========== Turn Header ========== */
    .turn-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      background: linear-gradient(
        135deg,
        var(--trace-accent-light) 0%,
        transparent 100%
      );
      border-bottom: 1px solid var(--trace-card-border);
      position: relative;
      z-index: 1;
    }

    .turn-card--system .turn-header {
      background: linear-gradient(
        135deg,
        rgba(139, 92, 246, 0.15) 0%,
        transparent 100%
      );
    }

    .turn-header__left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .turn-source {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .turn-source__icon {
      width: 24px;
      height: 24px;
      color: var(--trace-accent);
    }

    .turn-source__icon--system {
      color: #8b5cf6;
    }

    .turn-source__label {
      font-size: 1rem;
      font-weight: 700;
      color: var(--trace-text);
    }

    .turn-card--system .turn-source__label {
      color: #8b5cf6;
    }

    .turn-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.813rem;
      color: var(--trace-text-muted);
    }

    .turn-meta__model {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.625rem;
      background: var(--trace-card-bg);
      border-radius: 9999px;
      font-weight: 500;
    }

    .turn-meta__duration {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.625rem;
      background: var(--trace-success);
      color: white;
      border-radius: 9999px;
      font-weight: 500;
    }

    .turn-meta__duration--pending {
      background: var(--trace-warning);
    }

    .turn-meta__duration--error {
      background: var(--trace-error);
    }

    .turn-header__right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .turn-id {
      font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
      font-size: 0.75rem;
      color: var(--trace-accent);
      background: var(--trace-accent-light);
      padding: 0.375rem 0.75rem;
      border-radius: var(--trace-radius-sm);
    }

    .turn-timestamp {
      font-size: 0.75rem;
      color: var(--trace-text-muted);
    }

    /* ========== Step Flow ========== */
    .step-flow-wrapper {
      padding: 1.5rem;
      overflow-x: auto;
      overflow-y: visible;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
      position: relative;
      z-index: 10;
    }

    /* Custom scrollbar */
    .step-flow-wrapper::-webkit-scrollbar {
      height: 8px;
    }

    .step-flow-wrapper::-webkit-scrollbar-track {
      background: var(--trace-bg);
      border-radius: 4px;
    }

    .step-flow-wrapper::-webkit-scrollbar-thumb {
      background: var(--trace-text-muted);
      border-radius: 4px;
    }

    .step-flow-wrapper::-webkit-scrollbar-thumb:hover {
      background: var(--trace-accent);
    }

    .step-flow {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: max-content;
    }

    /* ========== Flow Arrow ========== */
    .flow-arrow {
      width: 24px;
      height: 24px;
      color: var(--trace-text-muted);
      flex-shrink: 0;
      opacity: 0.5;
    }

    /* ========== Step Icon ========== */
    .step-icon {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: var(--trace-bg);
      border: 2px solid var(--trace-card-border);
      border-radius: var(--trace-radius);
      cursor: pointer;
      transition: var(--trace-transition);
      min-width: 72px;
      flex-shrink: 0;
    }

    .step-icon:hover {
      background: var(--trace-accent-light);
      border-color: var(--trace-accent);
      transform: translateY(-4px) scale(1.05);
      box-shadow: var(--trace-shadow-lg);
    }

    .step-icon:active {
      transform: translateY(-2px) scale(1.02);
    }

    .step-icon__svg {
      width: 32px;
      height: 32px;
      color: var(--trace-accent);
      transition: var(--trace-transition);
    }

    .step-icon:hover .step-icon__svg {
      color: var(--trace-accent-dark);
      transform: scale(1.1);
    }

    .step-icon__label {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--trace-text-muted);
      text-align: center;
      white-space: nowrap;
    }

    .step-icon:hover .step-icon__label {
      color: var(--trace-accent-dark);
    }

    /* ========== Badge ========== */
    .step-badge {
      position: absolute;
      top: -6px;
      right: -6px;
      min-width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--trace-error);
      color: white;
      font-size: 0.688rem;
      font-weight: 700;
      border-radius: 9999px;
      padding: 0 6px;
      animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    }

    @keyframes popIn {
      from {
        transform: scale(0);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    /* ========== Tooltip ========== */
    .step-icon::before {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      padding: 0.5rem 0.75rem;
      background: #1e293b;
      color: white;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      border-radius: var(--trace-radius-sm);
      opacity: 0;
      visibility: hidden;
      transition: var(--trace-transition);
      z-index: 9999;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .step-icon::after {
      content: "";
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      border: 6px solid transparent;
      border-top-color: #1e293b;
      opacity: 0;
      visibility: hidden;
      transition: var(--trace-transition);
      z-index: 9999;
    }

    .step-icon:hover::before,
    .step-icon:hover::after {
      opacity: 1;
      visibility: visible;
    }

    .step-icon:hover::before {
      transform: translateX(-50%) translateY(-12px);
    }

    .step-icon:hover::after {
      transform: translateX(-50%) translateY(0);
    }

    /* ========== Modal ========== */
    .trace-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      animation: fadeIn 0.2s ease-out;
      padding: 2rem;
      box-sizing: border-box;
      isolation: isolate;
    }

    .trace-modal {
      background: #ffffff;
      border-radius: var(--trace-radius);
      box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
      max-width: 800px;
      width: 100%;
      max-height: calc(100vh - 4rem);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      z-index: 100000;
    }

    @media (prefers-color-scheme: dark) {
      .trace-modal {
        background: #1e293b;
      }
    }

    @keyframes modalSlideIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(20px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .trace-modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--trace-card-border);
      background: linear-gradient(
        135deg,
        var(--trace-accent-light) 0%,
        transparent 100%
      );
    }

    .trace-modal__title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--trace-text);
    }

    .trace-modal__title svg {
      width: 24px;
      height: 24px;
      color: var(--trace-accent);
    }

    .trace-modal__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: var(--trace-text-muted);
      cursor: pointer;
      transition: var(--trace-transition);
    }

    .trace-modal__close:hover {
      background: var(--trace-error);
      color: white;
    }

    .trace-modal__close svg {
      width: 20px;
      height: 20px;
    }

    .trace-modal__body {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .trace-modal__section {
      margin-bottom: 1.5rem;
    }

    .trace-modal__section:last-child {
      margin-bottom: 0;
    }

    .trace-modal__section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--trace-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.75rem;
    }

    .trace-code-block {
      background: var(--trace-bg);
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius-sm);
      padding: 1rem;
      overflow-x: auto;
      font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
      font-size: 0.813rem;
      line-height: 1.6;
      color: var(--trace-text);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .trace-code-block--response {
      background: linear-gradient(
        135deg,
        var(--trace-accent-light) 0%,
        var(--trace-bg) 100%
      );
      border-color: var(--trace-accent);
      font-family: inherit;
      font-size: 0.938rem;
      line-height: 1.7;
    }

    /* ========== Response Metadata ========== */
    .trace-response-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }

    .trace-response-meta__item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 1rem;
      background: var(--trace-bg);
      border: 1px solid var(--trace-card-border);
      border-radius: var(--trace-radius-sm);
    }

    .trace-response-meta__item--error {
      border-color: var(--trace-error);
      background: rgba(239, 68, 68, 0.1);
    }

    .trace-response-meta__label {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--trace-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .trace-response-meta__value {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--trace-text);
    }

    .trace-response-meta__value--complete {
      color: var(--trace-success);
    }

    .trace-response-meta__value--pending {
      color: var(--trace-warning);
    }

    .trace-response-meta__value--error {
      color: var(--trace-error);
    }

    .trace-response-note {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: var(--trace-accent-light);
      border-radius: var(--trace-radius-sm);
      font-size: 0.813rem;
      color: var(--trace-text-muted);
      font-style: italic;
    }

    /* ========== Responsive ========== */
    @media (max-width: 768px) {
      .llm-trace-container {
        padding: 1rem;
      }

      .trace-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
      }

      .trace-title h1 {
        font-size: 1.25rem;
      }

      .turn-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1rem;
      }

      .turn-header__right {
        width: 100%;
        justify-content: space-between;
      }

      .step-flow-wrapper {
        padding: 1rem;
      }

      .step-icon {
        min-width: 60px;
        padding: 0.5rem;
      }

      .step-icon__svg {
        width: 24px;
        height: 24px;
      }

      .step-icon__label {
        font-size: 0.688rem;
      }
    }
  </style>
`;

// ============================================================================
// Render Functions
// ============================================================================

function renderStepIcon(step: TurnStep, onStepClick: (step: TurnStep) => void) {
  return html`
    <div
      class="step-icon"
      data-tooltip="${step.tooltip}"
      @click=${() => onStepClick(step)}
      role="button"
      tabindex="0"
      aria-label="${step.label}: ${step.tooltip}"
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStepClick(step);
        }
      }}
    >
      ${step.count
        ? html`<span class="step-badge">${step.count}</span>`
        : nothing}
      <div class="step-icon__svg" .innerHTML=${step.icon}></div>
      <span class="step-icon__label">${step.label}</span>
    </div>
  `;
}

function renderStepFlow(
  steps: TurnStep[],
  onStepClick: (step: TurnStep) => void,
) {
  return html`
    <div class="step-flow-wrapper">
      <div class="step-flow">
        ${steps.map(
          (step, i) => html`
            ${renderStepIcon(step, onStepClick)}
            ${i < steps.length - 1
              ? html`<div .innerHTML=${ARROW_ICON}></div>`
              : nothing}
          `,
        )}
      </div>
    </div>
  `;
}

function renderTurnCard(
  turn: Turn,
  index: number,
  onStepClick: (step: TurnStep, turn: Turn) => void,
) {
  const durationClass =
    turn.status === "pending"
      ? "turn-meta__duration--pending"
      : turn.status === "error"
        ? "turn-meta__duration--error"
        : "";

  // Source icon based on user vs consciousness
  const sourceIcon = turn.isSystemInitiated
    ? STEP_ICONS.consciousness
    : STEP_ICONS.user;

  return html`
    <article
      class="turn-card turn-card--${turn.status} ${turn.isSystemInitiated
        ? "turn-card--system"
        : "turn-card--user"}"
      style="animation-delay: ${index * 0.1}s"
    >
      <header class="turn-header">
        <div class="turn-header__left">
          <div class="turn-source">
            <span
              class="turn-source__icon ${turn.isSystemInitiated
                ? "turn-source__icon--system"
                : ""}"
              .innerHTML=${sourceIcon}
            ></span>
            <span class="turn-source__label">${turn.sourceLabel}</span>
          </div>
          <div class="turn-meta">
            <span class="turn-meta__model">
              ${turn.provider}/${turn.model}
            </span>
            <span class="turn-meta__duration ${durationClass}">
              ${turn.status === "pending"
                ? "Processing..."
                : turn.status === "error"
                  ? "Error"
                  : `${turn.durationMs}ms`}
            </span>
          </div>
        </div>
        <div class="turn-header__right">
          <span class="turn-id">${turn.turnId}</span>
          <span class="turn-timestamp">${turn.timestamp}</span>
        </div>
      </header>
      ${renderStepFlow(turn.steps, (step) => onStepClick(step, turn))}
    </article>
  `;
}

function renderModal(
  step: TurnStep | null,
  turn: Turn | null,
  onClose: () => void,
) {
  if (!step || !turn) return nothing;

  const closeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

  // For response step, show metadata (actual content not captured in current data structure)
  const isResponseStep = step.type === "response";
  const detailsObj = step.details as any;

  return html`
    <div
      class="trace-modal-overlay"
      @click=${(e: Event) => {
        if (
          (e.target as HTMLElement).classList.contains("trace-modal-overlay")
        ) {
          onClose();
        }
      }}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="trace-modal">
        <header class="trace-modal__header">
          <h2 id="modal-title" class="trace-modal__title">
            <span .innerHTML=${step.icon}></span>
            ${step.label} Details
          </h2>
          <button
            class="trace-modal__close"
            @click=${onClose}
            aria-label="Close modal"
          >
            <span .innerHTML=${closeIcon}></span>
          </button>
        </header>
        <div class="trace-modal__body">
          ${isResponseStep
            ? html`
                ${detailsObj.responseText
                  ? html`
                      <section class="trace-modal__section">
                        <h3 class="trace-modal__section-title">
                          Response Content
                        </h3>
                        <pre
                          class="trace-code-block trace-code-block--response"
                        >
${detailsObj.responseText}</pre
                        >
                      </section>
                    `
                  : nothing}
                <section class="trace-modal__section">
                  <h3 class="trace-modal__section-title">Response Metadata</h3>
                  <div class="trace-response-meta">
                    <div class="trace-response-meta__item">
                      <span class="trace-response-meta__label">Status</span>
                      <span
                        class="trace-response-meta__value trace-response-meta__value--${detailsObj.status}"
                        >${detailsObj.status}</span
                      >
                    </div>
                    <div class="trace-response-meta__item">
                      <span class="trace-response-meta__label">Duration</span>
                      <span class="trace-response-meta__value"
                        >${detailsObj.durationMs}ms</span
                      >
                    </div>
                    <div class="trace-response-meta__item">
                      <span class="trace-response-meta__label">Chunks</span>
                      <span class="trace-response-meta__value"
                        >${detailsObj.chunksCount || 0}</span
                      >
                    </div>
                    ${detailsObj.error
                      ? html`
                          <div
                            class="trace-response-meta__item trace-response-meta__item--error"
                          >
                            <span class="trace-response-meta__label"
                              >Error</span
                            >
                            <span class="trace-response-meta__value"
                              >${detailsObj.error}</span
                            >
                          </div>
                        `
                      : nothing}
                  </div>
                </section>
              `
            : html`
                <section class="trace-modal__section">
                  <h3 class="trace-modal__section-title">Content</h3>
                  <pre class="trace-code-block">
${typeof step.details === "string"
                      ? step.details
                      : JSON.stringify(step.details, null, 2)}</pre
                  >
                </section>
              `}
          ${step.type === "response" && turn.raw.responseUsage
            ? html`
                <section class="trace-modal__section">
                  <h3 class="trace-modal__section-title">Token Usage</h3>
                  <pre class="trace-code-block">
${JSON.stringify(turn.raw.responseUsage, null, 2)}</pre
                  >
                </section>
              `
            : nothing}
        </div>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  const emptyIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h.01M15 12h.01M12 12h.01M21 12c0 4.97-4.03 9-9 9a9 9 0 0 1-2.63-.39l-4.37 1.44V17.7A9 9 0 1 1 21 12z"/></svg>`;

  return html`
    <div class="trace-empty">
      <div class="trace-empty__icon" .innerHTML=${emptyIcon}></div>
      <p class="trace-empty__text">No LLM interactions recorded yet.</p>
      <p class="trace-empty__hint">
        Start a conversation to see the diagnostic trace.
      </p>
    </div>
  `;
}

// ============================================================================
// Props Type
// ============================================================================

export type LlmDebugProps = {
  history: LlmInteraction[];
  modalStep: unknown | null;
  modalTurnId: string | null;
  onClear: () => void;
  onOpenModal: (step: TurnStep, turnId: string) => void;
  onCloseModal: () => void;
};

// ============================================================================
// Main Render Export
// ============================================================================

export function renderLlmDebug(props: LlmDebugProps) {
  // Transform interactions to turns
  const turns = props.history.map((interaction, i) =>
    interactionToTurn(interaction, props.history.length - 1 - i),
  );

  // Find the selected turn and step for the modal
  let selectedStep: TurnStep | null = null;
  let selectedTurn: Turn | null = null;

  if (props.modalStep && props.modalTurnId) {
    selectedTurn = turns.find((t) => t.id === props.modalTurnId) || null;
    selectedStep = props.modalStep as TurnStep;
  }

  // Stats
  const totalTurns = turns.length;
  const completedTurns = turns.filter((t) => t.status === "complete").length;
  const pendingTurns = turns.filter((t) => t.status === "pending").length;
  const errorTurns = turns.filter((t) => t.status === "error").length;

  const clearIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
  const traceIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 5h20M2 19h20"/></svg>`;

  // Step click handler - uses props callback to update parent state
  const handleStepClick = (step: TurnStep, turn: Turn) => {
    props.onOpenModal(step, turn.id);
  };

  return html`
    ${styles}
    <div class="llm-trace-container">
      <div class="llm-trace-inner">
        <!-- Header -->
        <header class="trace-header">
          <div class="trace-title">
            <div class="trace-title-icon" .innerHTML=${traceIcon}></div>
            <h1>Conversation Turn Diagnostic</h1>
          </div>
          <div class="trace-actions">
            <button class="trace-btn" @click=${props.onClear}>
              <span .innerHTML=${clearIcon}></span>
              Clear History
            </button>
          </div>
        </header>

        <!-- Stats -->
        ${totalTurns > 0
          ? html`
              <div class="trace-stats">
                <div class="trace-stat">
                  <span class="trace-stat__value">${totalTurns}</span>
                  <span class="trace-stat__label">Total Turns</span>
                </div>
                <div class="trace-stat">
                  <span
                    class="trace-stat__value"
                    style="color: var(--trace-success)"
                    >${completedTurns}</span
                  >
                  <span class="trace-stat__label">Completed</span>
                </div>
                ${pendingTurns > 0
                  ? html`
                      <div class="trace-stat">
                        <span
                          class="trace-stat__value"
                          style="color: var(--trace-warning)"
                          >${pendingTurns}</span
                        >
                        <span class="trace-stat__label">Pending</span>
                      </div>
                    `
                  : nothing}
                ${errorTurns > 0
                  ? html`
                      <div class="trace-stat">
                        <span
                          class="trace-stat__value"
                          style="color: var(--trace-error)"
                          >${errorTurns}</span
                        >
                        <span class="trace-stat__label">Errors</span>
                      </div>
                    `
                  : nothing}
              </div>
            `
          : nothing}

        <!-- Turn List -->
        <section aria-label="Conversation turns">
          ${totalTurns === 0
            ? renderEmptyState()
            : turns.map((turn, i) => renderTurnCard(turn, i, handleStepClick))}
        </section>
      </div>
    </div>

    <!-- Modal (rendered outside main container for z-index) -->
    ${selectedStep && selectedTurn
      ? renderModal(selectedStep, selectedTurn, props.onCloseModal)
      : nothing}
  `;
}

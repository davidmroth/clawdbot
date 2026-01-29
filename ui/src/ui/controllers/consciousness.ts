/**
 * Consciousness Controller
 *
 * Data fetching and state management for the consciousness debug UI.
 */

import type { GatewayBrowserClient } from "../gateway.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types (duplicated from backend to avoid cross-build imports)
// ─────────────────────────────────────────────────────────────────────────────

export type ConsciousnessEventType =
  | "GATEWAY_READY"
  | "TASK_EXIT"
  | "TASK_STARTED"
  | "REMINDER_DUE"
  | "HEARTBEAT"
  | "USER_MESSAGE";

export type AgentDecision = "notify" | "schedule" | "ignore" | "pending";

export interface EventLogEntry {
  id: string;
  timestamp: number;
  type: ConsciousnessEventType;
  stimulus: string;
  agentDecision: AgentDecision;
  agentReasoning?: string;
  metadata: Record<string, unknown>;
}

export type TaskStatus = "pending" | "running" | "completed" | "failed";
export type TaskPriority = "low" | "normal" | "high";

export interface TrackedTask {
  id: string;
  sessionId: string;
  description: string;
  command?: string;
  priority: TaskPriority;
  status: TaskStatus;
  startedAt: number;
  completedAt?: number;
  exitCode?: number;
  userWantsUpdate: boolean;
}

export interface Reminder {
  id: string;
  context: string;
  createdAt: number;
  dueAt: number;
  sessionId?: string;
  fired: boolean;
}

export interface ConsciousnessState {
  enabled: boolean;
  lastHeartbeat: number | null;
  entries: EventLogEntry[];
  activeTasks: TrackedTask[];
  pendingReminders: Reminder[];
}

export interface ConsciousnessController {
  loading: boolean;
  state: ConsciousnessState | null;
  selectedEntry: EventLogEntry | null;
  error: string | null;
}

/**
 * Load consciousness state from the gateway
 */
export async function loadConsciousnessState(
  client: GatewayBrowserClient,
): Promise<ConsciousnessState> {
  const result = (await client.request("consciousness.state", {})) as {
    enabled: boolean;
    lastHeartbeat: number | null;
    timeline: EventLogEntry[];
    activeTasks: TrackedTask[];
    pendingReminders: Reminder[];
  };
  // Gateway returns 'timeline', UI expects 'entries'
  return {
    enabled: result.enabled,
    lastHeartbeat: result.lastHeartbeat,
    entries: result.timeline ?? [],
    activeTasks: result.activeTasks ?? [],
    pendingReminders: result.pendingReminders ?? [],
  };
}

/**
 * Toggle consciousness enabled state
 */
export async function toggleConsciousness(
  client: GatewayBrowserClient,
  enabled: boolean,
): Promise<void> {
  await client.request("consciousness.toggle", { enabled });
}

/**
 * Subscribe to consciousness events (real-time updates)
 */
export function subscribeToConsciousnessEvents(
  client: GatewayBrowserClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onEvent: (entry: EventLogEntry) => void,
): () => void {
  // Trigger subscription on the backend
  client.request("consciousness.subscribe", {}).catch((err) => {
    console.warn("Failed to subscribe to consciousness events:", err);
  });

  return () => {
    // No unsubscribe method needed yet as backend handles disconnects
  };
}

/**
 * Application state interface for Consciousness
 */
export interface ConsciousnessApp {
  client: GatewayBrowserClient | null;
  connected: boolean;
  consciousnessLoading: boolean;
  consciousnessEnabled: boolean;
  consciousnessLastHeartbeat: number | null;
  consciousnessTimeline: EventLogEntry[];
  consciousnessActiveTasks: TrackedTask[];
  consciousnessPendingReminders: Reminder[];
  requestUpdate: () => void;
}

/**
 * Safely load consciousness state into the app
 */
export async function loadConsciousness(app: ConsciousnessApp) {
  if (!app.client || !app.connected) return;
  if (app.consciousnessLoading) return;

  app.consciousnessLoading = true;
  app.requestUpdate();

  try {
    const result = (await app.client.request("consciousness.state", {})) as {
      enabled: boolean;
      lastHeartbeat: number | null;
      timeline: EventLogEntry[];
      activeTasks: TrackedTask[];
      pendingReminders: Reminder[];
    };

    app.consciousnessEnabled = result.enabled;
    app.consciousnessLastHeartbeat = result.lastHeartbeat;
    app.consciousnessTimeline = result.timeline ?? [];
    app.consciousnessActiveTasks = result.activeTasks ?? [];
    app.consciousnessPendingReminders = result.pendingReminders ?? [];

    // Ensure we are subscribed to updates
    subscribeToConsciousnessEvents(app.client, () => {});
  } catch (err) {
    console.warn("Failed to auto-load consciousness:", err);
  } finally {
    app.consciousnessLoading = false;
    app.requestUpdate();
  }
}

/**
 * Initialize consciousness controller state
 */
export function createConsciousnessController(): ConsciousnessController {
  return {
    loading: false,
    state: null,
    selectedEntry: null,
    error: null,
  };
}

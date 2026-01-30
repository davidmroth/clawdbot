/**
 * Consciousness Module Types
 *
 * Type definitions for the agent consciousness system that enables
 * proactive awareness and agent-driven decision making.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Event Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConsciousnessEventType =
  | "GATEWAY_READY"
  | "TASK_EXIT"
  | "TASK_STARTED"
  | "REMINDER_DUE"
  | "HEARTBEAT"
  | "USER_MESSAGE";

export type AgentDecision =
  | "notify"
  | "schedule"
  | "skip"
  | "ignore"
  | "pending"
  | "filtered"; // System-determined skip (not agent decision)

export interface ConsciousnessEvent {
  type: ConsciousnessEventType;
  timestamp: number;
  payload?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Log
// ─────────────────────────────────────────────────────────────────────────────

export interface EventLogEntry {
  id: string;
  timestamp: number;
  type: ConsciousnessEventType;
  stimulus: string;
  agentDecision: AgentDecision;
  agentReasoning?: string;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Memory
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Reminders
// ─────────────────────────────────────────────────────────────────────────────

export interface Reminder {
  id: string;
  context: string;
  createdAt: number;
  dueAt: number;
  sessionId?: string;
  fired: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service State
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsciousnessState {
  enabled: boolean;
  lastHeartbeat: number | null;
  entries: EventLogEntry[];
  activeTasks: TrackedTask[];
  pendingReminders: Reminder[];
}

export interface ConsciousnessConfig {
  enabled?: boolean;
  heartbeatIntervalMs?: number;
  maxLogEntries?: number;
  defaults?: {
    taskTrackingEnabled?: boolean;
    remindersEnabled?: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Callbacks
// ─────────────────────────────────────────────────────────────────────────────

export type EventLogSubscriber = (entry: EventLogEntry) => void;
export type StateChangeSubscriber = (state: ConsciousnessState) => void;
export type Unsubscribe = () => void;

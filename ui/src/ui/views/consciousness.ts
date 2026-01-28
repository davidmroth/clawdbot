/**
 * Consciousness Debug View (V2)
 *
 * "AI Brain" Dashboard Aesthetic.
 * Focuses on a clear "Stream of Consciousness" visualization (left)
 * and detailed context inspection (right).
 */

import { html, nothing } from "lit";

// ─────────────────────────────────────────────────────────────────────────────
// Types
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

export interface ConsciousnessProps {
  loading: boolean;
  enabled: boolean;
  lastHeartbeat: number | null;
  timeline: EventLogEntry[];
  activeTasks: TrackedTask[];
  pendingReminders: Reminder[];
  selectedEntry: EventLogEntry | null;
  onToggle: (enabled: boolean) => void;
  onRefresh: () => void;
  onSelectEntry: (entry: EventLogEntry | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Render Function
// ─────────────────────────────────────────────────────────────────────────────

export function renderConsciousness(props: ConsciousnessProps) {
  const collapsedTimeline = collapseHeartbeats(props.timeline);

  return html`
    <div class="consciousness-page">
      <!-- 1. Stats Header -->
      <div class="dashboard-header">
        <div class="brain-status">
          <div class="status-ring ${props.enabled ? "active" : "paused"}"></div>
          <div class="brain-label">${props.enabled ? "Online" : "Paused"}</div>
        </div>

        <div class="stat-group">
          <div class="stat-item">
            <span class="stat-label">System Pulse</span>
            <span class="stat-value">
              ${props.lastHeartbeat
                ? formatDuration(Date.now() - props.lastHeartbeat) + " ago"
                : "--"}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Active Threads</span>
            <span class="stat-value">${props.activeTasks.length}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Pending Reminders</span>
            <span class="stat-value">${props.pendingReminders.length}</span>
          </div>
        </div>

        <div class="header-controls">
          <button
            class="btn"
            @click=${props.onRefresh}
            ?disabled=${props.loading}
          >
            ${props.loading ? "Syncing..." : "Refresh"}
          </button>
          <button
            class="btn ${props.enabled ? "" : "primary"}"
            @click=${() => props.onToggle(!props.enabled)}
          >
            ${props.enabled ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <!-- 2. Main Dashboard Grid -->
      <div class="dashboard-grid">
        <!-- Left Column: Stream of Consciousness -->
        <div class="stream-panel">
          <div class="panel-header">
            <div class="panel-title">Stream of Consciousness</div>
          </div>

          <div class="timeline-container">
            ${collapsedTimeline.length === 0
              ? html`<div class="inspector-empty">No events recorded</div>`
              : collapsedTimeline.map((entry) =>
                  renderStreamNode(entry, props),
                )}
          </div>
        </div>

        <!-- Right Column: Context & Inspector -->
        <div class="context-column">
          <!-- Context: Active Thoughts -->
          <div class="context-panel">
            <div class="panel-header">
              <div class="panel-title">Active Context</div>
            </div>
            <div class="scroll-area">
              ${props.activeTasks.length === 0 &&
              props.pendingReminders.length === 0
                ? html`<div
                    style="padding: 16px; color: var(--c-muted); font-style: italic; font-size: 13px;"
                  >
                    No active tasks or reminders
                  </div>`
                : nothing}
              ${props.activeTasks.map(
                (task) => html`
                  <div class="list-item">
                    <div class="item-header">
                      <span>${task.description}</span>
                      <span class="tag">${task.priority}</span>
                    </div>
                    <div class="item-meta">
                      Running for ${formatDuration(Date.now() - task.startedAt)}
                    </div>
                  </div>
                `,
              )}
              ${props.pendingReminders.map(
                (reminder) => html`
                  <div class="list-item">
                    <div class="item-header">
                      <span>Reminder</span>
                      <span class="tag"
                        >Due in
                        ${formatDuration(reminder.dueAt - Date.now())}</span
                      >
                    </div>
                    <div class="item-meta">"${reminder.context}"</div>
                  </div>
                `,
              )}
            </div>
          </div>

          <!-- Stimulus Inspector (Persistent) -->
          <div class="inspector-panel">
            <div class="panel-header">
              <div class="panel-title">Inspector</div>
            </div>

            ${props.selectedEntry
              ? renderInspectorContent(props.selectedEntry)
              : html`<div class="inspector-empty">
                  Select an event from the stream<br />to inspect details
                </div>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderStreamNode(
  entry: EventLogEntry & { count?: number },
  props: ConsciousnessProps,
) {
  const isSelected = props.selectedEntry?.id === entry.id;
  const isHeartbeat = entry.type === "HEARTBEAT";

  return html`
    <div
      class="stream-node ${isSelected ? "selected" : ""} ${isHeartbeat
        ? "heartbeat"
        : ""}"
      @click=${() => props.onSelectEntry(entry)}
    >
      <div class="node-icon">${getEventIcon(entry.type)}</div>

      <div class="node-card">
        <div class="node-header">
          <span class="node-type">${formatEventType(entry.type)}</span>
          <span class="node-time">${formatRelativeTime(entry.timestamp)}</span>
        </div>

        <div class="node-sub">
          ${entry.count
            ? html`<span class="node-count">×${entry.count}</span>`
            : nothing}

          <div class="decision-badge decision-${entry.agentDecision}">
            ${entry.agentDecision}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderInspectorContent(entry: EventLogEntry) {
  return html`
    <div class="inspector-content">
      <div class="detail-group">
        <span class="detail-label">Type</span>
        <span>${formatEventType(entry.type)}</span>
      </div>

      <div class="detail-group">
        <span class="detail-label">Timestamp</span>
        <span>${new Date(entry.timestamp).toLocaleString()}</span>
      </div>

      <div class="detail-group">
        <span class="detail-label">Agent Decision</span>
        <div class="decision-badge decision-${entry.agentDecision}">
          ${entry.agentDecision}
        </div>
      </div>

      <div class="detail-group">
        <span class="detail-label">Stimulus Prompt</span>
        <div class="detail-code">${entry.stimulus || "(no content)"}</div>
      </div>

      ${entry.agentReasoning
        ? html`
            <div class="detail-group">
              <span class="detail-label">Reasoning</span>
              <div class="detail-code">${entry.agentReasoning}</div>
            </div>
          `
        : nothing}

      <div class="detail-group">
        <span class="detail-label">Raw Metadata</span>
        <div class="detail-code">
          ${JSON.stringify(entry.metadata, null, 2)}
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function collapseHeartbeats(
  entries: EventLogEntry[],
): (EventLogEntry & { count?: number })[] {
  const result: (EventLogEntry & { count?: number })[] = [];
  let heartbeatGroup: EventLogEntry[] = [];

  const flushHeartbeats = () => {
    if (heartbeatGroup.length === 0) return;
    if (heartbeatGroup.length === 1) {
      result.push(heartbeatGroup[0]);
    } else {
      // Use the most recent heartbeat as representative
      result.push({ ...heartbeatGroup[0], count: heartbeatGroup.length });
    }
    heartbeatGroup = [];
  };

  for (const entry of entries) {
    if (entry.type === "HEARTBEAT") {
      heartbeatGroup.push(entry);
    } else {
      flushHeartbeats();
      result.push(entry);
    }
  }
  flushHeartbeats();
  return result;
}

function getEventIcon(type: string): string {
  switch (type) {
    case "GATEWAY_READY":
      return "🚀";
    case "TASK_EXIT":
      return "✅";
    case "TASK_STARTED":
      return "⚙️";
    case "REMINDER_DUE":
      return "⏰";
    case "HEARTBEAT":
      return "💓";
    case "USER_MESSAGE":
      return "👤";
    default:
      return "⚡";
  }
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return "soon"; // Clock skew or future date
  if (diff < 60000) return "just now";
  return formatDuration(diff) + " ago";
}

function formatDuration(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);

  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/**
 * Event Monitor
 *
 * Watches for system events and emits them to the consciousness service.
 * Handles heartbeat timer and gateway lifecycle events.
 */

import type { ConsciousnessEvent, Unsubscribe } from "./types.js";

export type EventEmitter = (event: ConsciousnessEvent) => void;

export class EventMonitor {
  private heartbeatInterval: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastUserMessageAt: number | null = null;
  private userSilenceThreshold = 10 * 60 * 1000; // 10 minutes
  private onEventCallback: EventEmitter | null = null;
  private hasStartedOnce = false; // Track if this is a resume vs first start

  constructor(heartbeatIntervalMs = 60000) {
    this.heartbeatInterval = heartbeatIntervalMs;
  }

  /**
   * Set the callback for emitting events
   */
  onEvent(callback: EventEmitter): void {
    this.onEventCallback = callback;
  }

  /**
   * Start monitoring (called when gateway is ready)
   */
  start(): void {
    this.startHeartbeat();
    // Only emit GATEWAY_READY on first start, not on resume
    if (!this.hasStartedOnce) {
      this.hasStartedOnce = true;
      this.emit({ type: "GATEWAY_READY", timestamp: Date.now() });
    }
  }

  /**
   * Stop monitoring (called on shutdown)
   */
  stop(): void {
    this.stopHeartbeat();
  }

  /**
   * Record a user message (for tracking user presence)
   */
  recordUserMessage(): void {
    const now = Date.now();
    const wasAway =
      this.lastUserMessageAt !== null &&
      now - this.lastUserMessageAt > this.userSilenceThreshold;

    const silenceDuration = this.lastUserMessageAt
      ? now - this.lastUserMessageAt
      : 0;
    this.lastUserMessageAt = now;

    this.emit({
      type: "USER_MESSAGE",
      timestamp: now,
      payload: {
        isFirstAfterSilence: wasAway,
        silenceDuration: wasAway ? silenceDuration : 0,
      },
    });
  }

  /**
   * Get the timestamp of the last user message
   */
  getLastUserMessageAt(): number | null {
    return this.lastUserMessageAt;
  }

  /**
   * Emit a task-related event
   */
  emitTaskStarted(taskId: string, task: Record<string, unknown>): void {
    this.emit({
      type: "TASK_STARTED",
      timestamp: Date.now(),
      payload: { taskId, task },
    });
  }

  /**
   * Emit a task exit event
   */
  emitTaskExit(
    taskId: string,
    task: Record<string, unknown>,
    exitCode: number,
    durationMs: number,
  ): void {
    this.emit({
      type: "TASK_EXIT",
      timestamp: Date.now(),
      payload: { taskId, task, exitCode, durationMs },
    });
  }

  /**
   * Emit a reminder due event
   */
  emitReminderDue(reminder: Record<string, unknown>): void {
    this.emit({
      type: "REMINDER_DUE",
      timestamp: Date.now(),
      payload: { reminder },
    });
  }

  /**
   * Update heartbeat interval
   */
  setHeartbeatInterval(ms: number): void {
    this.heartbeatInterval = ms;
    if (this.heartbeatTimer) {
      this.stopHeartbeat();
      this.startHeartbeat();
    }
  }

  /**
   * Set user silence threshold (for detecting when user returns)
   */
  setUserSilenceThreshold(ms: number): void {
    this.userSilenceThreshold = ms;
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.emit({ type: "HEARTBEAT", timestamp: Date.now() });
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private emit(event: ConsciousnessEvent): void {
    if (this.onEventCallback) {
      try {
        this.onEventCallback(event);
      } catch {
        // Ignore callback errors
      }
    }
  }
}

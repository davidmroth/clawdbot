/**
 * Consciousness Service
 *
 * Main orchestrator for the agent consciousness system.
 * Coordinates event monitoring, task tracking, reminders,
 * and agent stimulus injection.
 */

import { EventLog } from "./event-log.js";
import { EventMonitor } from "./event-monitor.js";
import { ReminderScheduler } from "./reminder-scheduler.js";
import {
  StimulusProcessor,
  type StimulusContext,
} from "./stimulus-processor.js";
import { TaskMemory } from "./task-memory.js";
import type {
  ConsciousnessConfig,
  ConsciousnessEvent,
  ConsciousnessState,
  EventLogEntry,
  Reminder,
  TrackedTask,
  Unsubscribe,
} from "./types.js";

export interface ConsciousnessServiceDeps {
  /**
   * Callback to inject a prompt into the agent session
   */
  injectPrompt?: (
    prompt: string,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
}

export class ConsciousnessService {
  private config: ConsciousnessConfig;
  private enabled: boolean;
  private deps: ConsciousnessServiceDeps;

  // Sub-components
  readonly eventLog: EventLog;
  readonly eventMonitor: EventMonitor;
  readonly taskMemory: TaskMemory;
  readonly reminderScheduler: ReminderScheduler;
  readonly stimulusProcessor: StimulusProcessor;

  // State subscribers
  private stateSubscribers = new Set<(state: ConsciousnessState) => void>();

  constructor(
    config: ConsciousnessConfig = {},
    deps: ConsciousnessServiceDeps = {},
  ) {
    this.config = config;
    this.enabled = config.enabled ?? false;
    this.deps = deps;

    // Initialize sub-components
    this.eventLog = new EventLog(config.maxLogEntries ?? 500);
    this.eventMonitor = new EventMonitor(config.heartbeatIntervalMs ?? 60000);
    this.taskMemory = new TaskMemory();
    this.reminderScheduler = new ReminderScheduler();
    this.stimulusProcessor = new StimulusProcessor();

    // Wire up event flow
    this.eventMonitor.onEvent((event) => this.handleEvent(event));
    this.reminderScheduler.onDue((reminder) =>
      this.handleReminderDue(reminder),
    );

    // Subscribe to sub-component changes for state updates
    this.taskMemory.subscribe(() => this.notifyStateChange());
    this.reminderScheduler.subscribe(() => this.notifyStateChange());
    this.eventLog.subscribe(() => this.notifyStateChange());
  }

  /**
   * Start the consciousness service
   */
  start(): void {
    if (!this.enabled) return;
    this.eventMonitor.start();
  }

  /**
   * Stop the consciousness service
   */
  stop(): void {
    this.eventMonitor.stop();
    this.reminderScheduler.dispose();
  }

  /**
   * Enable or disable the consciousness service
   */
  setEnabled(enabled: boolean): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;

    if (enabled && !wasEnabled) {
      this.eventMonitor.start();
    } else if (!enabled && wasEnabled) {
      this.eventMonitor.stop();
    }

    this.notifyStateChange();
  }

  /**
   * Check if consciousness is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current consciousness state (for UI)
   */
  getState(): ConsciousnessState {
    return {
      enabled: this.enabled,
      lastHeartbeat: this.eventMonitor.getLastUserMessageAt(),
      entries: this.eventLog.getRecent(100),
      activeTasks: this.taskMemory.listActive(),
      pendingReminders: this.reminderScheduler.listPending(),
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: (state: ConsciousnessState) => void): Unsubscribe {
    this.stateSubscribers.add(callback);
    return () => this.stateSubscribers.delete(callback);
  }

  /**
   * Subscribe to new event log entries (for real-time UI streaming)
   */
  subscribeToEvents(callback: (entry: EventLogEntry) => void): Unsubscribe {
    return this.eventLog.subscribe(callback);
  }

  /**
   * Record a user message (updates presence tracking)
   */
  recordUserMessage(): void {
    if (!this.enabled) return;
    this.eventMonitor.recordUserMessage();
  }

  /**
   * Track a new background task
   */
  trackTask(params: {
    sessionId: string;
    description: string;
    command?: string;
    priority?: "low" | "normal" | "high";
  }): TrackedTask {
    const task = this.taskMemory.track(params);
    this.eventMonitor.emitTaskStarted(
      task.id,
      task as unknown as Record<string, unknown>,
    );
    return task;
  }

  /**
   * Mark a task as running
   */
  markTaskRunning(taskId: string): void {
    this.taskMemory.markRunning(taskId);
  }

  /**
   * Mark a task as complete and emit event
   */
  markTaskComplete(taskId: string, exitCode: number): void {
    const task = this.taskMemory.get(taskId);
    if (!task) return;

    const durationMs = Date.now() - task.startedAt;
    this.taskMemory.markComplete(taskId, exitCode);

    this.eventMonitor.emitTaskExit(
      taskId,
      task as unknown as Record<string, unknown>,
      exitCode,
      durationMs,
    );
  }

  /**
   * Schedule a reminder
   */
  scheduleReminder(params: {
    context: string;
    delay: string | number;
    sessionId?: string;
  }): Reminder {
    if (typeof params.delay === "string") {
      return this.reminderScheduler.scheduleFromString({
        context: params.context,
        delay: params.delay,
        sessionId: params.sessionId,
      });
    }
    return this.reminderScheduler.schedule({
      context: params.context,
      delay: params.delay,
      sessionId: params.sessionId,
    });
  }

  /**
   * Cancel a reminder
   */
  cancelReminder(id: string): boolean {
    return this.reminderScheduler.cancel(id);
  }

  /**
   * Handle incoming events from the event monitor
   */
  private async handleEvent(event: ConsciousnessEvent): Promise<void> {
    if (!this.enabled) return;

    // Build context for stimulus processing
    const context: StimulusContext = {
      activeTasks: this.taskMemory.listActive(),
      pendingReminders: this.reminderScheduler.listPending(),
      lastUserMessageAt: this.eventMonitor.getLastUserMessageAt() ?? undefined,
    };

    // Build the stimulus prompt
    const stimulus = this.stimulusProcessor.buildPrompt(event, context);

    // Log the event
    const entry = this.eventLog.log({
      type: event.type,
      stimulus,
      metadata: event.payload ?? {},
    });

    // Skip injection for empty prompts (heartbeats with nothing notable)
    if (!stimulus.trim()) {
      this.eventLog.update(entry.id, {
        agentDecision: "skip",
        agentReasoning: "No stimulus content generated.",
      });
      return;
    }

    // Skip injection for simple tracking events
    if (event.type === "TASK_STARTED") {
      this.eventLog.update(entry.id, {
        agentDecision: "skip",
        agentReasoning: "Tracking event only.",
      });
      return;
    }

    // Inject prompt to agent if callback is provided
    if (this.deps.injectPrompt) {
      try {
        await this.deps.injectPrompt(stimulus, {
          eventType: event.type,
          eventLogEntryId: entry.id,
        });
      } catch {
        // Log injection failure but don't throw
        this.eventLog.update(entry.id, { agentDecision: "ignore" });
      }
    }
  }

  /**
   * Handle reminder due events
   */
  private handleReminderDue(reminder: Reminder): void {
    this.eventMonitor.emitReminderDue(
      reminder as unknown as Record<string, unknown>,
    );
  }

  /**
   * Notify state subscribers of changes
   */
  private notifyStateChange(): void {
    const state = this.getState();
    for (const callback of this.stateSubscribers) {
      try {
        callback(state);
      } catch {
        // Ignore subscriber errors
      }
    }
  }
}

/**
 * Stimulus Processor
 *
 * Builds context-rich prompts for agent reasoning and injects
 * them into the agent session as internal system messages.
 */

import type { ConsciousnessEvent, Reminder, TrackedTask } from "./types.js";

export interface StimulusContext {
  activeTasks: TrackedTask[];
  pendingReminders: Reminder[];
  lastUserMessageAt?: number;
}

export class StimulusProcessor {
  /**
   * Build a prompt for the agent based on the event and context
   */
  buildPrompt(event: ConsciousnessEvent, context: StimulusContext): string {
    switch (event.type) {
      case "GATEWAY_READY":
        return this.buildGatewayReadyPrompt(context);

      case "TASK_EXIT":
        return this.buildTaskExitPrompt(event, context);

      case "TASK_STARTED":
        return this.buildTaskStartedPrompt(event, context);

      case "REMINDER_DUE":
        return this.buildReminderDuePrompt(event, context);

      case "HEARTBEAT":
        return this.buildHeartbeatPrompt(context);

      case "USER_MESSAGE":
        return this.buildUserMessagePrompt(event, context);

      default:
        return `System Event: Unknown event type "${event.type}"`;
    }
  }

  private buildGatewayReadyPrompt(context: StimulusContext): string {
    const parts = [
      "System Event: Gateway Ready",
      "",
      "The gateway has just started or recovered.",
    ];

    if (context.activeTasks.length > 0) {
      parts.push("");
      parts.push(
        `Active tasks from previous session: ${context.activeTasks.length}`,
      );
      for (const task of context.activeTasks.slice(0, 5)) {
        parts.push(`  - ${task.description} (${task.status})`);
      }
    }

    if (context.pendingReminders.length > 0) {
      parts.push("");
      parts.push(`Pending reminders: ${context.pendingReminders.length}`);
      for (const reminder of context.pendingReminders.slice(0, 5)) {
        const dueIn = reminder.dueAt - Date.now();
        parts.push(
          `  - "${reminder.context}" (due in ${formatDuration(dueIn)})`,
        );
      }
    }

    parts.push("");
    parts.push("Decide your response:");
    parts.push("  - Resume any pending work or check task status");
    parts.push("  - Notify the user if there's important context");
    parts.push("  - Take no action if nothing requires attention");

    return parts.join("\n");
  }

  private buildTaskExitPrompt(
    event: ConsciousnessEvent,
    context: StimulusContext,
  ): string {
    const payload = event.payload as {
      task?: TrackedTask;
      exitCode?: number;
      durationMs?: number;
    };

    const task = payload.task;
    const exitCode = payload.exitCode ?? 0;
    const durationMs = payload.durationMs ?? 0;

    const parts = [
      "System Event: Background Task Completed",
      "",
      `Task: "${task?.description ?? "Unknown task"}"`,
      `Exit code: ${exitCode} (${exitCode === 0 ? "success" : "failure"})`,
      `Duration: ${formatDuration(durationMs)}`,
    ];

    if (task?.command) {
      parts.push(`Command: ${task.command}`);
    }

    if (context.lastUserMessageAt) {
      const userIdleFor = Date.now() - context.lastUserMessageAt;
      parts.push(`User last active: ${formatDuration(userIdleFor)} ago`);
    }

    parts.push("");
    parts.push("Decide your response:");
    parts.push("  - Notify the user now if this seems important");
    parts.push(
      "  - Schedule a reminder using reminder.set for later follow-up",
    );
    parts.push("  - Take no action if this doesn't warrant user attention");

    return parts.join("\n");
  }

  private buildTaskStartedPrompt(
    event: ConsciousnessEvent,
    _context: StimulusContext,
  ): string {
    const payload = event.payload as { task?: TrackedTask };
    const task = payload.task;

    return [
      "System Event: Background Task Started",
      "",
      `Task: "${task?.description ?? "Unknown task"}"`,
      task?.command ? `Command: ${task.command}` : null,
      "",
      "This is logged for your awareness. No immediate action required.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildReminderDuePrompt(
    event: ConsciousnessEvent,
    context: StimulusContext,
  ): string {
    const payload = event.payload as { reminder?: Reminder };
    const reminder = payload.reminder;

    if (!reminder) {
      return "System Event: Reminder Due\n\nA reminder has fired but details are unavailable.";
    }

    const parts = [
      "System Event: Reminder Due",
      "",
      `Context: "${reminder.context}"`,
      `Originally set: ${formatDuration(Date.now() - reminder.createdAt)} ago`,
    ];

    if (context.activeTasks.length > 0) {
      parts.push("");
      parts.push("Current active tasks:");
      for (const task of context.activeTasks.slice(0, 3)) {
        const running = Date.now() - task.startedAt;
        parts.push(
          `  - ${task.description} (running ${formatDuration(running)})`,
        );
      }
    }

    parts.push("");
    parts.push("Re-evaluate the current situation and decide:");
    parts.push("  - Take the action you intended when setting this reminder");
    parts.push("  - Schedule another reminder if more time is needed");
    parts.push("  - Take no action if the situation has resolved");

    return parts.join("\n");
  }

  private buildHeartbeatPrompt(context: StimulusContext): string {
    // Heartbeat prompts are minimal - only fire if there's something notable
    if (
      context.activeTasks.length === 0 &&
      context.pendingReminders.length === 0
    ) {
      return ""; // Empty prompt = no action needed
    }

    const parts = ["System Event: Periodic Check", ""];

    if (context.activeTasks.length > 0) {
      parts.push(`Active tasks: ${context.activeTasks.length}`);
      for (const task of context.activeTasks) {
        const running = Date.now() - task.startedAt;
        parts.push(
          `  - ${task.description} (running ${formatDuration(running)})`,
        );
      }
    }

    parts.push("");
    parts.push("Review if any tasks need attention or status update.");

    return parts.join("\n");
  }

  private buildUserMessagePrompt(
    event: ConsciousnessEvent,
    context: StimulusContext,
  ): string {
    // User messages are logged for awareness but typically don't need prompting
    const payload = event.payload as {
      isFirstAfterSilence?: boolean;
      silenceDuration?: number;
    };

    if (!payload.isFirstAfterSilence) {
      return ""; // Normal user message, no special prompt
    }

    const parts = [
      "System Event: User Returned",
      "",
      `The user has returned after ${formatDuration(payload.silenceDuration ?? 0)} of silence.`,
    ];

    if (context.activeTasks.length > 0 || context.pendingReminders.length > 0) {
      parts.push("");
      parts.push("While the user was away:");
      if (context.activeTasks.length > 0) {
        parts.push(`  - ${context.activeTasks.length} task(s) were running`);
      }
      if (context.pendingReminders.length > 0) {
        parts.push(
          `  - ${context.pendingReminders.length} reminder(s) may have fired`,
        );
      }
      parts.push("");
      parts.push("Consider offering a brief summary if relevant.");
    }

    return parts.join("\n");
  }
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  return `${seconds}s`;
}

export { formatDuration };

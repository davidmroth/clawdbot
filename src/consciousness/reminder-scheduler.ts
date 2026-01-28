/**
 * Reminder Scheduler
 *
 * Agent-controlled timer system for scheduling follow-up prompts.
 * The agent can set reminders that will fire events when due.
 */

import { randomUUID } from "node:crypto";

import type { Reminder, Unsubscribe } from "./types.js";

export type ReminderCallback = (reminder: Reminder) => void;

export class ReminderScheduler {
  private reminders = new Map<string, Reminder>();
  private timers = new Map<string, NodeJS.Timeout>();
  private onDueCallback: ReminderCallback | null = null;
  private subscribers = new Set<
    (reminder: Reminder, event: "scheduled" | "fired" | "cancelled") => void
  >();

  /**
   * Set the callback for when reminders are due
   */
  onDue(callback: ReminderCallback): void {
    this.onDueCallback = callback;
  }

  /**
   * Schedule a new reminder
   */
  schedule(params: {
    context: string;
    delay: number; // milliseconds from now
    sessionId?: string;
  }): Reminder {
    const now = Date.now();
    const reminder: Reminder = {
      id: randomUUID(),
      context: params.context,
      createdAt: now,
      dueAt: now + params.delay,
      sessionId: params.sessionId,
      fired: false,
    };

    this.reminders.set(reminder.id, reminder);

    // Set timer
    const timer = setTimeout(() => {
      this.fire(reminder.id);
    }, params.delay);

    this.timers.set(reminder.id, timer);
    this.notify(reminder, "scheduled");

    return reminder;
  }

  /**
   * Schedule using a human-readable delay string (e.g., "5m", "1h30m")
   */
  scheduleFromString(params: {
    context: string;
    delay: string;
    sessionId?: string;
  }): Reminder {
    const delayMs = parseDelayString(params.delay);
    return this.schedule({
      context: params.context,
      delay: delayMs,
      sessionId: params.sessionId,
    });
  }

  /**
   * Cancel a reminder
   */
  cancel(id: string): boolean {
    const reminder = this.reminders.get(id);
    if (!reminder) return false;

    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this.reminders.delete(id);
    this.notify(reminder, "cancelled");
    return true;
  }

  /**
   * Get a reminder by ID
   */
  get(id: string): Reminder | undefined {
    return this.reminders.get(id);
  }

  /**
   * List all pending (unfired) reminders
   */
  listPending(): Reminder[] {
    return [...this.reminders.values()].filter((r) => !r.fired);
  }

  /**
   * List all reminders
   */
  listAll(): Reminder[] {
    return [...this.reminders.values()];
  }

  /**
   * Subscribe to reminder events
   */
  subscribe(
    callback: (
      reminder: Reminder,
      event: "scheduled" | "fired" | "cancelled",
    ) => void,
  ): Unsubscribe {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Clean up all timers (for shutdown)
   */
  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.reminders.clear();
  }

  private fire(id: string): void {
    const reminder = this.reminders.get(id);
    if (!reminder || reminder.fired) return;

    reminder.fired = true;
    this.timers.delete(id);
    this.notify(reminder, "fired");

    if (this.onDueCallback) {
      try {
        this.onDueCallback(reminder);
      } catch {
        // Ignore callback errors
      }
    }
  }

  private notify(
    reminder: Reminder,
    event: "scheduled" | "fired" | "cancelled",
  ): void {
    for (const callback of this.subscribers) {
      try {
        callback(reminder, event);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  /**
   * Get pending reminder count
   */
  get pendingCount(): number {
    return this.listPending().length;
  }
}

/**
 * Parse a delay string like "5m", "1h30m", "2h" into milliseconds
 */
function parseDelayString(delay: string): number {
  const trimmed = delay.trim().toLowerCase();

  // Try ISO timestamp first
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    const now = Date.now();
    return Math.max(0, parsed - now);
  }

  // Parse duration format: "1h30m", "5m", "2h"
  let totalMs = 0;
  const regex = /(\d+)\s*(h|m|s)/g;
  let match;

  while ((match = regex.exec(trimmed)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "h":
        totalMs += value * 60 * 60 * 1000;
        break;
      case "m":
        totalMs += value * 60 * 1000;
        break;
      case "s":
        totalMs += value * 1000;
        break;
    }
  }

  // If no units matched, assume minutes
  if (totalMs === 0) {
    const numericValue = parseInt(trimmed, 10);
    if (!isNaN(numericValue)) {
      totalMs = numericValue * 60 * 1000;
    }
  }

  return totalMs;
}

export { parseDelayString };

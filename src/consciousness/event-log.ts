/**
 * Event Log
 *
 * Observable log of consciousness events for UI streaming.
 * Maintains a rolling window of recent events and notifies
 * subscribers of new entries in real-time.
 */

import { randomUUID } from "node:crypto";

import type {
  AgentDecision,
  ConsciousnessEventType,
  EventLogEntry,
  EventLogSubscriber,
  Unsubscribe,
} from "./types.js";

export class EventLog {
  private entries: EventLogEntry[] = [];
  private subscribers = new Set<EventLogSubscriber>();
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Create and append a new log entry
   */
  log(params: {
    type: ConsciousnessEventType;
    stimulus: string;
    agentDecision?: AgentDecision;
    agentReasoning?: string;
    metadata?: Record<string, unknown>;
  }): EventLogEntry {
    const entry: EventLogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: params.type,
      stimulus: params.stimulus,
      agentDecision: params.agentDecision ?? "pending",
      agentReasoning: params.agentReasoning,
      metadata: params.metadata ?? {},
    };

    this.append(entry);
    return entry;
  }

  /**
   * Append an existing entry to the log
   */
  append(entry: EventLogEntry): void {
    this.entries.push(entry);

    // Trim to max size
    while (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Notify subscribers
    for (const callback of this.subscribers) {
      try {
        callback(entry);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  /**
   * Update an existing entry (e.g., when agent decision is made)
   */
  update(
    id: string,
    updates: Partial<Pick<EventLogEntry, "agentDecision" | "agentReasoning">>,
  ): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;

    if (updates.agentDecision !== undefined) {
      entry.agentDecision = updates.agentDecision;
    }
    if (updates.agentReasoning !== undefined) {
      entry.agentReasoning = updates.agentReasoning;
    }

    // Notify subscribers of the update
    for (const callback of this.subscribers) {
      try {
        callback(entry);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  /**
   * Get recent entries
   */
  getRecent(limit = 100): EventLogEntry[] {
    return this.entries.slice(-limit);
  }

  /**
   * Get all entries
   */
  getAll(): EventLogEntry[] {
    return [...this.entries];
  }

  /**
   * Subscribe to new entries
   */
  subscribe(callback: EventLogSubscriber): Unsubscribe {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get entry count
   */
  get size(): number {
    return this.entries.length;
  }
}

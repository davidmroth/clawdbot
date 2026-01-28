/**
 * Task Memory
 *
 * Tracks background tasks initiated by the agent for
 * post-completion follow-up and status monitoring.
 */

import { randomUUID } from "node:crypto";

import type {
  TaskPriority,
  TaskStatus,
  TrackedTask,
  Unsubscribe,
} from "./types.js";

export type TaskChangeSubscriber = (
  task: TrackedTask,
  event: "added" | "updated" | "removed",
) => void;

export class TaskMemory {
  private tasks = new Map<string, TrackedTask>();
  private subscribers = new Set<TaskChangeSubscriber>();

  /**
   * Track a new task
   */
  track(params: {
    sessionId: string;
    description: string;
    command?: string;
    priority?: TaskPriority;
    userWantsUpdate?: boolean;
  }): TrackedTask {
    const task: TrackedTask = {
      id: randomUUID(),
      sessionId: params.sessionId,
      description: params.description,
      command: params.command,
      priority: params.priority ?? "normal",
      status: "pending",
      startedAt: Date.now(),
      userWantsUpdate: params.userWantsUpdate ?? true,
    };

    this.tasks.set(task.id, task);
    this.notify(task, "added");
    return task;
  }

  /**
   * Mark a task as running
   */
  markRunning(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = "running";
    this.notify(task, "updated");
  }

  /**
   * Mark a task as completed
   */
  markComplete(id: string, exitCode?: number): TrackedTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = exitCode === 0 ? "completed" : "failed";
    task.completedAt = Date.now();
    task.exitCode = exitCode;
    this.notify(task, "updated");
    return task;
  }

  /**
   * Get a task by ID
   */
  get(id: string): TrackedTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * List all active (non-completed) tasks
   */
  listActive(): TrackedTask[] {
    return [...this.tasks.values()].filter(
      (t) => t.status === "pending" || t.status === "running",
    );
  }

  /**
   * List all tasks
   */
  listAll(): TrackedTask[] {
    return [...this.tasks.values()];
  }

  /**
   * Remove a task from memory
   */
  remove(id: string): void {
    const task = this.tasks.get(id);
    if (!task) return;

    this.tasks.delete(id);
    this.notify(task, "removed");
  }

  /**
   * Clean up old completed tasks (older than maxAge ms)
   */
  cleanup(maxAgeMs = 3600000): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, task] of this.tasks) {
      if (
        (task.status === "completed" || task.status === "failed") &&
        task.completedAt &&
        now - task.completedAt > maxAgeMs
      ) {
        this.tasks.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Subscribe to task changes
   */
  subscribe(callback: TaskChangeSubscriber): Unsubscribe {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(
    task: TrackedTask,
    event: "added" | "updated" | "removed",
  ): void {
    for (const callback of this.subscribers) {
      try {
        callback(task, event);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  /**
   * Get task count
   */
  get size(): number {
    return this.tasks.size;
  }
}

/**
 * Session-level async mutex for serializing operations on a session.
 *
 * This provides an in-process mutex that:
 * - Waits indefinitely (no timeout crashes)
 * - Serializes operations per session
 * - Is much faster than file-based locks
 *
 * File locks are still used underneath for multi-process safety,
 * but with a much longer timeout since the mutex ensures only one
 * request per session is active at a time within this process.
 */

import path from "node:path";

const DEBUG = true;
const log = (msg: string) => {
  if (DEBUG) {
    console.log(`[session-mutex] ${new Date().toISOString()} ${msg}`);
  }
};

/** Simple async mutex implementation */
class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      log(`ACQUIRED mutex for ${this.name}`);
      return this.createRelease();
    }

    log(
      `WAITING in queue for ${this.name} (queue size: ${this.queue.length + 1})`,
    );

    // Wait in queue until we get our turn
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => resolve(this.createRelease()));
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      if (this.queue.length > 0) {
        // Pass lock to next waiter
        log(
          `RELEASING mutex for ${this.name}, passing to next (queue: ${this.queue.length})`,
        );
        const next = this.queue.shift()!;
        next();
      } else {
        log(`RELEASING mutex for ${this.name}, no waiters`);
        this.locked = false;
      }
    };
  }

  isLocked(): boolean {
    return this.locked;
  }

  queueLength(): number {
    return this.queue.length;
  }
}

// Map of normalized session file path -> mutex
const SESSION_MUTEXES = new Map<string, AsyncMutex>();

/**
 * Normalize session file path for consistent mutex key.
 */
function normalizeSessionPath(sessionFile: string): string {
  return path.resolve(sessionFile);
}

/**
 * Get or create a mutex for a session file.
 */
function getSessionMutex(sessionFile: string): AsyncMutex {
  const normalized = normalizeSessionPath(sessionFile);
  let mutex = SESSION_MUTEXES.get(normalized);
  if (!mutex) {
    log(`Creating NEW mutex for ${normalized}`);
    mutex = new AsyncMutex(normalized);
    SESSION_MUTEXES.set(normalized, mutex);
  }
  return mutex;
}

/**
 * Check if a session has a pending operation (mutex locked or queue > 0).
 */
export function isSessionMutexBusy(sessionFile: string): boolean {
  const normalized = normalizeSessionPath(sessionFile);
  const mutex = SESSION_MUTEXES.get(normalized);
  return mutex ? mutex.isLocked() : false;
}

/**
 * Check if ANY session mutex is currently locked.
 * Used by consciousness system to yield when any agent run is active.
 */
export function hasAnyActiveSessionMutex(): boolean {
  for (const [path, mutex] of SESSION_MUTEXES.entries()) {
    if (mutex.isLocked()) {
      log(`hasAnyActiveSessionMutex: Locked mutex found for ${path}`);
      return true;
    }
  }
  log(
    `hasAnyActiveSessionMutex: No active mutexes found (checked ${SESSION_MUTEXES.size} entries)`,
  );
  return false;
}

/**
 * Get the queue length for a session mutex (for debugging/monitoring).
 */
export function getSessionMutexQueueLength(sessionFile: string): number {
  const normalized = normalizeSessionPath(sessionFile);
  const mutex = SESSION_MUTEXES.get(normalized);
  return mutex ? mutex.queueLength() : 0;
}

/**
 * Acquire the session mutex. Returns a release function.
 * This will wait indefinitely until the mutex is available.
 */
export async function acquireSessionMutex(
  sessionFile: string,
): Promise<() => void> {
  log(`acquireSessionMutex called for: ${sessionFile}`);
  const mutex = getSessionMutex(sessionFile);
  return mutex.acquire();
}

/**
 * Execute a function with the session mutex held.
 * The mutex is automatically released when the function completes or throws.
 */
export async function withSessionMutex<T>(
  sessionFile: string,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireSessionMutex(sessionFile);
  try {
    return await fn();
  } finally {
    release();
  }
}

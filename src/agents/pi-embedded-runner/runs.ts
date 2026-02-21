import {
  diagnosticLogger as diag,
  logMessageQueued,
  logSessionStateChange,
} from "../../logging/diagnostic.js";
import {
  registerAgentRunContext,
  type RecallMeta,
} from "../../infra/agent-events.js";

type EmbeddedPiQueueHandle = {
  runId?: string;
  queueMessage: (text: string, role?: "user" | "system") => Promise<void>;
  isStreaming: () => boolean;
  isCompacting: () => boolean;
  abort: () => void;
};

const ACTIVE_EMBEDDED_RUNS = new Map<string, EmbeddedPiQueueHandle>();
type EmbeddedRunWaiter = {
  resolve: (ended: boolean) => void;
  timer: NodeJS.Timeout;
};
const EMBEDDED_RUN_WAITERS = new Map<string, Set<EmbeddedRunWaiter>>();

export function queueEmbeddedPiMessage(
  sessionId: string,
  text: string,
  role: "user" | "system" = "user",
): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) {
    const activeKeys = Array.from(ACTIVE_EMBEDDED_RUNS.keys());
    diag.debug(
      `queue message failed: sessionId=${sessionId} reason=no_active_run activeRuns=[${activeKeys.join(", ")}]`,
    );
    return false;
  }
  // System messages can be injected at any time:
  //   - Before streaming (pre-prompt window): pushed directly into the message array.
  //   - During streaming: queueMessage falls back to steer() so recall reaches the LLM now.
  // User messages must call steer() which requires an active stream.
  if (role !== "system" && !handle.isStreaming()) {
    diag.debug(
      `queue message failed: sessionId=${sessionId} reason=not_streaming`,
    );
    return false;
  }
  if (handle.isCompacting()) {
    diag.debug(
      `queue message failed: sessionId=${sessionId} reason=compacting`,
    );
    return false;
  }
  logMessageQueued({ sessionId, source: "pi-embedded-runner" });
  void handle.queueMessage(text, role);
  return true;
}

export function abortEmbeddedPiRun(sessionId: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) {
    diag.debug(`abort failed: sessionId=${sessionId} reason=no_active_run`);
    return false;
  }
  diag.debug(`aborting run: sessionId=${sessionId}`);
  handle.abort();
  return true;
}

export function isEmbeddedPiRunActive(sessionId: string): boolean {
  const active = ACTIVE_EMBEDDED_RUNS.has(sessionId);
  if (active) {
    diag.debug(`run active check: sessionId=${sessionId} active=true`);
  }
  return active;
}

export function isEmbeddedPiRunStreaming(sessionId: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) return false;
  return handle.isStreaming();
}

export function waitForEmbeddedPiRunEnd(
  sessionId: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  if (!sessionId || !ACTIVE_EMBEDDED_RUNS.has(sessionId))
    return Promise.resolve(true);
  diag.debug(
    `waiting for run end: sessionId=${sessionId} timeoutMs=${timeoutMs}`,
  );
  return new Promise((resolve) => {
    const waiters = EMBEDDED_RUN_WAITERS.get(sessionId) ?? new Set();
    const waiter: EmbeddedRunWaiter = {
      resolve,
      timer: setTimeout(
        () => {
          waiters.delete(waiter);
          if (waiters.size === 0) EMBEDDED_RUN_WAITERS.delete(sessionId);
          diag.warn(
            `wait timeout: sessionId=${sessionId} timeoutMs=${timeoutMs}`,
          );
          resolve(false);
        },
        Math.max(100, timeoutMs),
      ),
    };
    waiters.add(waiter);
    EMBEDDED_RUN_WAITERS.set(sessionId, waiters);
    if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
      waiters.delete(waiter);
      if (waiters.size === 0) EMBEDDED_RUN_WAITERS.delete(sessionId);
      clearTimeout(waiter.timer);
      resolve(true);
    }
  });
}

function notifyEmbeddedRunEnded(sessionId: string) {
  const waiters = EMBEDDED_RUN_WAITERS.get(sessionId);
  if (!waiters || waiters.size === 0) return;
  EMBEDDED_RUN_WAITERS.delete(sessionId);
  diag.debug(
    `notifying waiters: sessionId=${sessionId} waiterCount=${waiters.size}`,
  );
  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(true);
  }
}

export function setActiveEmbeddedRun(
  sessionId: string,
  handle: EmbeddedPiQueueHandle,
  sessionKey?: string,
) {
  const wasActive = ACTIVE_EMBEDDED_RUNS.has(sessionId);
  ACTIVE_EMBEDDED_RUNS.set(sessionId, handle);
  // Also register under the persistent sessionKey so recall signals
  // (which use sessionKey, not sessionId) can find the active run.
  if (sessionKey && sessionKey !== sessionId) {
    ACTIVE_EMBEDDED_RUNS.set(sessionKey, handle);
  }
  logSessionStateChange({
    sessionId,
    state: "processing",
    reason: wasActive ? "run_replaced" : "run_started",
  });
  if (!sessionId.startsWith("probe-")) {
    const registeredKeys = Array.from(ACTIVE_EMBEDDED_RUNS.keys());
    diag.info(
      `run registered: sessionId=${sessionId} sessionKey=${sessionKey ?? "none"} registeredKeys=[${registeredKeys.join(", ")}]`,
    );
  }
}

export function clearActiveEmbeddedRun(
  sessionId: string,
  handle: EmbeddedPiQueueHandle,
  sessionKey?: string,
) {
  if (ACTIVE_EMBEDDED_RUNS.get(sessionId) === handle) {
    ACTIVE_EMBEDDED_RUNS.delete(sessionId);
    // Only remove sessionKey if it still maps to this handle — a new run may have
    // already claimed the same sessionKey before this cleanup runs.
    if (
      sessionKey &&
      sessionKey !== sessionId &&
      ACTIVE_EMBEDDED_RUNS.get(sessionKey) === handle
    ) {
      ACTIVE_EMBEDDED_RUNS.delete(sessionKey);
    }
    logSessionStateChange({
      sessionId,
      state: "idle",
      reason: "run_completed",
    });
    if (!sessionId.startsWith("probe-")) {
      diag.debug(
        `run cleared: sessionId=${sessionId} totalActive=${ACTIVE_EMBEDDED_RUNS.size}`,
      );
    }
    notifyEmbeddedRunEnded(sessionId);
  } else {
    diag.debug(
      `run clear skipped: sessionId=${sessionId} reason=handle_mismatch`,
    );
  }
}

export function getActiveEmbeddedRunKeys(): string[] {
  return Array.from(ACTIVE_EMBEDDED_RUNS.keys());
}

export function getEmbeddedRunId(sessionKey: string): string | undefined {
  return ACTIVE_EMBEDDED_RUNS.get(sessionKey)?.runId;
}

export function tagRunWithRecallMeta(
  sessionKey: string,
  meta: RecallMeta,
): void {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionKey);
  if (!handle?.runId) return;
  registerAgentRunContext(handle.runId, { recallMeta: meta });
}

export type { EmbeddedPiQueueHandle };

import fs from "node:fs/promises";
import path from "node:path";

// Debug logging for session lock troubleshooting
const DEBUG_LOCKS = true;
function lockDebug(msg: string) {
  if (DEBUG_LOCKS) {
    console.log(`[session-lock] ${new Date().toISOString()} ${msg}`);
  }
}

type LockFilePayload = {
  pid: number;
  createdAt: string;
};

type HeldLock = {
  count: number;
  handle: fs.FileHandle;
  lockPath: string;
};

const HELD_LOCKS = new Map<string, HeldLock>();

/**
 * Check if a session is currently locked by this process.
 * Use this to skip operations that would block waiting for the lock.
 */
export function isSessionBusy(sessionFile: string): boolean {
  const normalized = path.resolve(sessionFile);
  // Check if we have it in our in-memory map
  if (HELD_LOCKS.has(normalized)) {
    return true;
  }
  // Also check with dirname normalization for symlink consistency
  const dir = path.dirname(normalized);
  const basename = path.basename(normalized);
  const normalizedWithDir = path.join(dir, basename);
  return HELD_LOCKS.has(normalizedWithDir);
}

function isAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLockPayload(
  lockPath: string,
): Promise<LockFilePayload | null> {
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockFilePayload>;
    if (typeof parsed.pid !== "number") return null;
    if (typeof parsed.createdAt !== "string") return null;
    return { pid: parsed.pid, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

export async function acquireSessionWriteLock(params: {
  sessionFile: string;
  timeoutMs?: number;
  staleMs?: number;
}): Promise<{
  release: () => Promise<void>;
}> {
  const timeoutMs = params.timeoutMs ?? 10_000;
  const staleMs = params.staleMs ?? 30 * 60 * 1000;
  const sessionFile = path.resolve(params.sessionFile);
  const sessionDir = path.dirname(sessionFile);
  await fs.mkdir(sessionDir, { recursive: true });
  let normalizedDir = sessionDir;
  try {
    normalizedDir = await fs.realpath(sessionDir);
  } catch {
    // Fall back to the resolved path if realpath fails (permissions, transient FS).
  }
  const normalizedSessionFile = path.join(
    normalizedDir,
    path.basename(sessionFile),
  );
  const lockPath = `${normalizedSessionFile}.lock`;

  const held = HELD_LOCKS.get(normalizedSessionFile);
  if (held) {
    held.count += 1;
    lockDebug(
      `RE-ENTRANT lock for ${normalizedSessionFile} (count=${held.count})`,
    );
    return {
      release: async () => {
        const current = HELD_LOCKS.get(normalizedSessionFile);
        if (!current) return;
        current.count -= 1;
        lockDebug(
          `RELEASE re-entrant ${normalizedSessionFile} (count=${current.count})`,
        );
        if (current.count > 0) return;
        HELD_LOCKS.delete(normalizedSessionFile);
        await current.handle.close();
        await fs.rm(current.lockPath, { force: true });
        lockDebug(`RELEASED lock completely: ${current.lockPath}`);
      },
    };
  }

  // Extract a short caller identifier from the stack trace for debugging
  const callerStack =
    new Error().stack?.split("\n").slice(2, 5).join(" <- ") ?? "unknown";
  const callerShort = callerStack
    .replace(/\s+at\s+/g, "")
    .replace(/\([^)]+\)/g, "")
    .trim();

  lockDebug(
    `ACQUIRE attempt: ${lockPath} (pid=${process.pid}) caller=[${callerShort}]`,
  );
  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(
        JSON.stringify(
          { pid: process.pid, createdAt: new Date().toISOString() },
          null,
          2,
        ),
        "utf8",
      );
      HELD_LOCKS.set(normalizedSessionFile, { count: 1, handle, lockPath });
      lockDebug(`ACQUIRED lock: ${lockPath}`);
      return {
        release: async () => {
          const current = HELD_LOCKS.get(normalizedSessionFile);
          if (!current) return;
          current.count -= 1;
          if (current.count > 0) return;
          HELD_LOCKS.delete(normalizedSessionFile);
          await current.handle.close();
          await fs.rm(current.lockPath, { force: true });
        },
      };
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code !== "EEXIST") throw err;
      const payload = await readLockPayload(lockPath);
      const createdAt = payload?.createdAt
        ? Date.parse(payload.createdAt)
        : NaN;
      const stale =
        !Number.isFinite(createdAt) || Date.now() - createdAt > staleMs;
      const alive = payload?.pid ? isAlive(payload.pid) : false;
      const isMe = payload?.pid === process.pid;
      const isHeldByMe = HELD_LOCKS.has(normalizedSessionFile);

      // If I own the lock file (pid match) but don't have it in memory,
      // it's a zombie lock from a crash/restart. Recover it.
      if (isMe && !isHeldByMe) {
        lockDebug(`RECOVERING own orphaned lock: ${lockPath}`);
        await fs.rm(lockPath, { force: true });
        continue;
      }

      lockDebug(
        `BLOCKED by existing lock: ${lockPath} owner_pid=${payload?.pid} stale=${stale} alive=${alive} attempt=${attempt} waiting_caller=[${callerShort}]`,
      );
      if (stale || !alive) {
        lockDebug(`CLEARING stale/dead lock: ${lockPath}`);
        await fs.rm(lockPath, { force: true });
        continue;
      }

      const delay = Math.min(1000, 50 * attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const payload = await readLockPayload(lockPath);
  const owner = payload?.pid ? `pid=${payload.pid}` : "unknown";
  throw new Error(
    `session file locked (timeout ${timeoutMs}ms): ${owner} ${lockPath}`,
  );
}

/**
 * Cleans up orphaned lock files in a sessions directory.
 * Should be called on gateway startup to recover from crashes.
 *
 * Removes locks that are:
 * 1. Owned by current PID but not tracked in HELD_LOCKS (leftover from crash)
 * 2. Owned by a dead process
 * 3. Stale (older than staleMs, default 30 min)
 */
export async function cleanupOrphanedSessionLocks(
  sessionDir: string,
  opts?: { staleMs?: number },
): Promise<number> {
  const staleMs = opts?.staleMs ?? 30 * 60 * 1000;
  let cleaned = 0;

  lockDebug(`CLEANUP scanning directory: ${sessionDir}`);

  let entries: string[];
  try {
    entries = await fs.readdir(sessionDir);
  } catch (err) {
    // Directory may not exist yet, that's fine
    lockDebug(
      `CLEANUP directory not found or unreadable: ${sessionDir} (${err})`,
    );
    return 0;
  }

  const lockFiles = entries.filter((f) => f.endsWith(".lock"));
  lockDebug(
    `CLEANUP found ${lockFiles.length} lock files: ${lockFiles.join(", ")}`,
  );

  for (const lockFile of lockFiles) {
    const lockPath = path.join(sessionDir, lockFile);
    const sessionFile = lockPath.replace(/\.lock$/, "");
    const payload = await readLockPayload(lockPath);

    if (!payload) {
      // Corrupt or empty lock file, safe to remove
      lockDebug(`CLEANUP removing corrupt lock: ${lockPath}`);
      await fs.rm(lockPath, { force: true });
      cleaned++;
      continue;
    }

    const isOwnedByMe = payload.pid === process.pid;
    const isInMemory = HELD_LOCKS.has(sessionFile);
    const ownerIsAlive = isAlive(payload.pid);
    const createdAt = payload.createdAt ? Date.parse(payload.createdAt) : NaN;
    const isStale =
      !Number.isFinite(createdAt) || Date.now() - createdAt > staleMs;

    lockDebug(
      `CLEANUP checking ${lockFile}: owner_pid=${payload.pid} isOwnedByMe=${isOwnedByMe} isInMemory=${isInMemory} ownerIsAlive=${ownerIsAlive} isStale=${isStale}`,
    );

    // Remove if:
    // - I own it but don't have it in memory (crash recovery)
    // - Owner is dead
    // - Lock is stale
    if ((isOwnedByMe && !isInMemory) || !ownerIsAlive || isStale) {
      lockDebug(`CLEANUP removing orphaned lock: ${lockPath}`);
      await fs.rm(lockPath, { force: true });
      cleaned++;
    } else {
      lockDebug(`CLEANUP keeping lock: ${lockPath} (valid active lock)`);
    }
  }

  lockDebug(`CLEANUP complete: removed ${cleaned} orphaned locks`);
  return cleaned;
}

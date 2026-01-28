import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, renameSync, rmSync, cpSync } from "fs";

const PORT = 3000;
const WORKSPACE_ROOT = "/app";
const DIST_DIR = join(WORKSPACE_ROOT, "dist");
const BACKUP_DIR = join(WORKSPACE_ROOT, "dist_backup");

// Gateway restart configuration
const GATEWAY_URL =
  process.env.CLAWDBOT_GATEWAY_URL || "http://clawdbot-gateway:18789";
const GATEWAY_TOKEN = process.env.CLAWDBOT_GATEWAY_TOKEN || "";
const DEBUG = process.env.BUILDER_DEBUG === "true";

/**
 * Calls the gateway's /v1/restart endpoint to trigger a graceful restart.
 */
const restartGateway = async (
  logFn: (msg: string) => void,
): Promise<{ success: boolean; error?: string }> => {
  const restartUrl = `${GATEWAY_URL}/v1/restart`;
  logFn("[Builder] Triggering gateway restart...\n");

  if (DEBUG) {
    logFn(`[Builder] DEBUG: GATEWAY_URL = "${GATEWAY_URL}"\n`);
    logFn(`[Builder] DEBUG: Fetch URL = "${restartUrl}"\n`);
    logFn(`[Builder] DEBUG: Token present = ${GATEWAY_TOKEN ? "yes" : "no"}\n`);
    logFn(`[Builder] DEBUG: Token length = ${GATEWAY_TOKEN.length}\n`);
  }

  try {
    const response = await fetch(restartUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logFn(`[Builder] Gateway restart failed: ${response.status} ${text}\n`);
      return { success: false, error: `${response.status}: ${text}` };
    }

    const result = await response.json();
    logFn(`[Builder] Gateway restart initiated: ${JSON.stringify(result)}\n`);
    return { success: true };
  } catch (error: any) {
    logFn(`[Builder] Gateway restart error: ${error.message}\n`);
    // Log the full error including cause for Node.js fetch errors
    if (DEBUG && error.cause) {
      logFn(
        `[Builder] DEBUG: Error cause: ${error.cause.message || error.cause}\n`,
      );
      logFn(`[Builder] DEBUG: Error code: ${error.cause.code || "N/A"}\n`);
    }
    if (DEBUG) {
      logFn(
        `[Builder] DEBUG: Full error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`,
      );
    }
    return { success: false, error: error.message };
  }
};

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const runCommand = (
  command: string,
  args: string[],
  logFn: (msg: string) => void,
): Promise<CommandResult> => {
  return new Promise((resolve) => {
    logFn(`[Builder] Running: ${command} ${args.join(" ")}\n`);

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const proc = spawn(command, args, {
      cwd: WORKSPACE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, CI: "true" },
    });

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      stdoutChunks.push(text);
      logFn(text);
    });
    proc.stderr.on("data", (data) => {
      const text = data.toString();
      stderrChunks.push(text);
      logFn(text);
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        exitCode: code,
      });
    });
  });
};

interface AgentErrorResponse {
  status: "error";
  error_code: string;
  message: string;
  suggestion: string;
  retry_endpoint?: string;
}

/**
 * Appends a structured agent error to the response stream.
 * Uses a marker so the agent can parse the JSON from the log output.
 */
const sendAgentError = (
  res: ServerResponse,
  error: AgentErrorResponse,
): void => {
  res.write("\n---AGENT_RESPONSE---\n");
  res.write(JSON.stringify(error, null, 2) + "\n");
  res.statusCode = 500;
  res.end();
};

const server = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    console.log("[*] recieved: ", req.url);

    // Parse URL and query params
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const pathname = url.pathname;
    const noFrozenLockfile =
      url.searchParams.get("no-frozen-lockfile") === "true";

    // Restart endpoint - triggers gateway restart
    if (req.method === "POST" && pathname === "/restart") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");

      const log = (msg: string) => {
        process.stdout.write(msg);
        res.write(msg);
      };

      const result = await restartGateway(log);

      if (result.success) {
        res.statusCode = 200;
        res.end("[Builder] Gateway restart command sent successfully.\n");
      } else {
        res.statusCode = 502;
        res.end(`[Builder] Gateway restart failed: ${result.error}\n`);
      }
      return;
    }

    if (req.method === "POST" && pathname === "/build") {
      const log = (msg: string) => {
        process.stdout.write(msg);
        res.write(msg);
      };

      log("[Builder] Triggered! Starting safe pipeline...\n");
      if (noFrozenLockfile) {
        log(
          "[Builder] ⚠️ Running without --frozen-lockfile (agent requested)\n",
        );
      }

      try {
        // 1. Backup Phase
        if (existsSync(DIST_DIR)) {
          log("[Builder] Backing up dist/...\n");
          if (existsSync(BACKUP_DIR)) {
            rmSync(BACKUP_DIR, { recursive: true, force: true });
          }

          try {
            renameSync(DIST_DIR, BACKUP_DIR);
          } catch (e) {
            log(
              `[Builder] Rename failed (cross-device?), copying instead: ${e}\n`,
            );
            cpSync(DIST_DIR, BACKUP_DIR, { recursive: true });
          }
        }

        // 2. Install Phase
        // Note: pnpm with CI=true defaults to frozen-lockfile, so we must explicitly disable it
        const installArgs = noFrozenLockfile
          ? ["pnpm", "install", "--no-frozen-lockfile"]
          : ["pnpm", "install", "--frozen-lockfile"];

        const installResult = await runCommand("npx", installArgs, log);

        if (!installResult.success) {
          // Check for outdated lockfile error (pnpm outputs to stdout)
          const output = installResult.stdout + installResult.stderr;
          if (output.includes("ERR_PNPM_OUTDATED_LOCKFILE")) {
            return sendAgentError(res, {
              status: "error",
              error_code: "ERR_PNPM_OUTDATED_LOCKFILE",
              message:
                "The pnpm-lock.yaml file is out of sync with package.json",
              suggestion:
                "The lockfile needs to be updated. Retry the build with the 'no-frozen-lockfile' query parameter to allow pnpm to update it automatically.",
              retry_endpoint: "/build?no-frozen-lockfile=true",
            });
          }

          // Generic install failure
          throw new Error(`Install failed with code ${installResult.exitCode}`);
        }

        // 3. Test Phase
        // await runCommand('npx', ['pnpm', 'test'], log);

        // 4. Build Phase
        const buildResult = await runCommand("npx", ["pnpm", "build"], log);
        if (!buildResult.success) {
          throw new Error(`Build failed with code ${buildResult.exitCode}`);
        }

        // ENV CLAWDBOT_PREFER_PNPM=1
        // Pass this env var to the UI build process
        process.env.CLAWDBOT_PREFER_PNPM = "1";

        // 5. UI Install Phase
        const uiInstallResult = await runCommand(
          "npx",
          ["pnpm", "ui:install"],
          log,
        );
        if (!uiInstallResult.success) {
          throw new Error(
            `UI install failed with code ${uiInstallResult.exitCode}`,
          );
        }

        // 6. UI Build Phase
        const uiBuildResult = await runCommand(
          "npx",
          ["pnpm", "ui:build"],
          log,
        );
        if (!uiBuildResult.success) {
          throw new Error(
            `UI build failed with code ${uiBuildResult.exitCode}`,
          );
        }

        // 7. Cleanup Phase (Success)
        log("[Builder] Build successful. Removing backup...\n");
        if (existsSync(BACKUP_DIR)) {
          rmSync(BACKUP_DIR, { recursive: true, force: true });
        }

        res.end("[Builder] SUCCESS. Ready to restart gateway.\n");
      } catch (error: any) {
        log(`\n[Builder] FAILED: ${error.message}\n`);

        // 4. Restore Phase (Failure)
        log("[Builder] Restoring backup from dist_backup/...\n");
        if (existsSync(BACKUP_DIR)) {
          if (existsSync(DIST_DIR)) {
            rmSync(DIST_DIR, { recursive: true, force: true });
          }

          try {
            renameSync(BACKUP_DIR, DIST_DIR);
            log("[Builder] Restore complete.\n");
          } catch (e) {
            log(`[Builder] Restore rename failed, copying: ${e}\n`);
            cpSync(BACKUP_DIR, DIST_DIR, { recursive: true });
          }
        } else {
          log("[Builder] WARNING: No backup found to restore!\n");
        }

        res.statusCode = 500;
        res.end("[Builder] Pipeline failed. State restored.\n");
      }
    } else {
      res.statusCode = 404;
      res.end("Not Found");
    }
  },
);

server.listen(PORT, () => {
  console.log(`[Builder] Service listening on http://localhost:${PORT}`);
  console.log(
    `[Builder] Trigger with: curl -N -X POST http://localhost:${PORT}/build`,
  );
});

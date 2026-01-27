import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, renameSync, rmSync, cpSync } from "fs";

const PORT = 3000;
const WORKSPACE_ROOT = "/app";
const DIST_DIR = join(WORKSPACE_ROOT, "dist");
const BACKUP_DIR = join(WORKSPACE_ROOT, "dist_backup");

const runCommand = (
  command: string,
  args: string[],
  logFn: (msg: string) => void,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    logFn(`[Builder] Running: ${command} ${args.join(" ")}\n`);

    const proc = spawn(command, args, {
      cwd: WORKSPACE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, CI: "true" },
    });

    proc.stdout.on("data", (data) => logFn(data.toString()));
    proc.stderr.on("data", (data) => logFn(data.toString()));

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command '${command}' failed with code ${code}`));
    });
  });
};

const server = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    console.log("[*] recieved: ", req.url);

    if (req.method === "POST" && req.url === "/build") {
      const log = (msg: string) => {
        process.stdout.write(msg);
        res.write(msg);
      };

      log("[Builder] Triggered! Starting safe pipeline...\n");

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
        await runCommand("npx", ["pnpm", "install", "--frozen-lockfile"], log);

        // 3. Test Phase
        // await runCommand('npx', ['pnpm', 'test'], log);

        // 4. Build Phase
        await runCommand("npx", ["pnpm", "build"], log);

        // ENV CLAWDBOT_PREFER_PNPM=1
        // Pass this env var to the UI build process
        process.env.CLAWDBOT_PREFER_PNPM = "1";

        // 5. UI Install Phase
        await runCommand("npx", ["pnpm", "ui:install"], log);

        // 6. UI Build Phase
        await runCommand("npx", ["pnpm", "ui:build"], log);

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

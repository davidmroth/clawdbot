import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { getShellConfig } from "../agents/shell-utils.js";

describe("Validate clawdbot-bash wrapper", () => {
  const clawdbotBashPath = "/usr/local/bin/clawdbot-bash";

  it("uses clawdbot-bash when it exists", () => {
    // Skip if not in Docker container where clawdbot-bash exists
    if (!fs.existsSync(clawdbotBashPath)) {
      console.log("Skipping: clawdbot-bash not found (not in container)");
      return;
    }

    const { shell, args } = getShellConfig();
    console.log("[*] shell:", shell);
    console.log("[*] args:", args);
    expect(shell).toBe(clawdbotBashPath);
    expect(args).toEqual(["-c"]);
  });

  it("clawdbot-bash fixes PATH to have venv first", async () => {
    // Skip if not in Docker container where clawdbot-bash exists
    if (!fs.existsSync(clawdbotBashPath)) {
      console.log("Skipping: clawdbot-bash not found (not in container)");
      return;
    }

    const { spawn } = await import("node:child_process");
    const pythonVenv = process.env.CLAWDBOT_PYTHON_VENV;

    if (!pythonVenv) {
      console.log("Skipping: CLAWDBOT_PYTHON_VENV not set");
      return;
    }

    const expectedVenvBin = `${pythonVenv}/bin`;

    // Run clawdbot-bash and check PATH
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(clawdbotBashPath, ["-c", "echo $PATH"], {
        env: process.env,
      });
      let stdout = "";
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Exit code ${code}`));
      });
      child.on("error", reject);
    });

    console.log("PATH from clawdbot-bash:", result);

    // PATH should start with the venv bin
    expect(result.startsWith(expectedVenvBin)).toBe(true);

    // Count occurrences - should only appear once at the start
    const pathParts = result.split(":");
    const venvCount = pathParts.filter((p) => p === expectedVenvBin).length;
    expect(venvCount).toBe(1);
  });
});

#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const env = { ...process.env };
const cwd = process.cwd();
const compiler = "tsdown";

const compilerProcess = spawn("pnpm", ["exec", compiler, "--watch"], {
  cwd,
  env,
  stdio: ["inherit", "pipe", "pipe"],
});

compilerProcess.stdout.pipe(process.stdout);
compilerProcess.stderr.pipe(process.stderr);

let nodeProcess;
let isRestarting = false;

compilerProcess.stdout.on("data", (data) => {
  const output = data.toString();
  // Wait for "Rebuilt in" or "Build success"
  if (output.includes("Rebuilt in") || output.includes("Build success")) {
    restartNode();
  }
});

function restartNode() {
  if (isRestarting) return;
  isRestarting = true;

  if (nodeProcess) {
    nodeProcess.removeAllListeners("exit");
    nodeProcess.kill("SIGTERM");
    nodeProcess = null;
  }

  // Small delay to ensure fs operations settle
  setTimeout(() => {
    nodeProcess = spawn(process.execPath, ["dist/entry.js", ...args], {
      cwd,
      env,
      stdio: "inherit",
    });

    nodeProcess.on("exit", (code, signal) => {
      if (signal || exiting || isRestarting) return;
      if (code !== 0 && code !== null) {
        console.error(`Application exited with code ${code}`);
      }
    });

    isRestarting = false;
  }, 100);
}

let exiting = false;

function cleanup(code = 0) {
  if (exiting) return;
  exiting = true;
  if (nodeProcess) nodeProcess.kill("SIGTERM");
  compilerProcess.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

compilerProcess.on("exit", (code) => {
  if (exiting) return;
  cleanup(code ?? 1);
});

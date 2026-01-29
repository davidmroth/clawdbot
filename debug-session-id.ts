import { resolveCronSession } from "./src/cron/isolated-agent/session.js";
import { loadConfig } from "./src/config/config.js";
import { randomUUID } from "node:crypto";

async function run() {
  const cfg = loadConfig();
  const sessionKey = `consciousness:${randomUUID()}`;
  const now = Date.now();

  console.log("--- TEST 1: New Random Session Key ---");
  const result1 = resolveCronSession({
    cfg,
    sessionKey,
    nowMs: now,
    agentId: "main",
  });
  console.log("Result 1 SessionID:", result1.sessionEntry.sessionId);

  console.log("\n--- TEST 2: Main Session Key (Simulated) ---");
  // Try to simulate passing something that might be interpreted as an existing session
  const mainResult = resolveCronSession({
    cfg,
    sessionKey: "agent:main:default",
    nowMs: now,
    agentId: "main",
  });
  console.log("Result 2 SessionID:", mainResult.sessionEntry.sessionId);
}

run().catch(console.error);

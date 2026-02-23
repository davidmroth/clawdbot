import { loadClawdbotConfig } from "./src/config/config.js";
import { resolveExecApprovals } from "./src/infra/exec-approvals.js";

async function run() {
  const cfg = await loadClawdbotConfig({ dir: process.cwd() });
  console.log("Global Exec Config:", cfg.tools?.exec);

  const approvals = resolveExecApprovals();
  console.log("Approvals Output:", {
    defaults: approvals.defaults,
    agent: approvals.agent,
  });
}
run().catch(console.error);

import chalk from "chalk";
import { createRequire } from "node:module";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { resolveConfiguredModelRef } from "../agents/model-selection.js";
import type { loadConfig } from "../config/config.js";
import { getResolvedLoggerSettings } from "../logging.js";

const readBuildInfo = (): {
  version?: string;
  commit?: string;
  builtAt?: string;
} => {
  try {
    const require = createRequire(import.meta.url);
    return require("../build-info.json") as {
      version?: string;
      commit?: string;
      builtAt?: string;
    };
  } catch {
    return {};
  }
};

export function logGatewayStartup(params: {
  cfg: ReturnType<typeof loadConfig>;
  bindHost: string;
  bindHosts?: string[];
  port: number;
  tlsEnabled?: boolean;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void };
  isNixMode: boolean;
}) {
  // Log build info first for debugging code version issues
  const buildInfo = readBuildInfo();
  if (buildInfo.builtAt || buildInfo.commit) {
    const parts: string[] = [];
    if (buildInfo.version) parts.push(`v${buildInfo.version}`);
    if (buildInfo.commit) parts.push(`commit ${buildInfo.commit.slice(0, 7)}`);
    if (buildInfo.builtAt) parts.push(`built ${buildInfo.builtAt}`);
    params.log.info(`build: ${parts.join(", ")}`, {
      consoleMessage: `build: ${chalk.gray(parts.join(", "))}`,
    });
  }

  const { provider: agentProvider, model: agentModel } =
    resolveConfiguredModelRef({
      cfg: params.cfg,
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: DEFAULT_MODEL,
    });
  const modelRef = `${agentProvider}/${agentModel}`;
  params.log.info(`agent model: ${modelRef}`, {
    consoleMessage: `agent model: ${chalk.whiteBright(modelRef)}`,
  });
  const scheme = params.tlsEnabled ? "wss" : "ws";
  const formatHost = (host: string) =>
    host.includes(":") ? `[${host}]` : host;
  const hosts =
    params.bindHosts && params.bindHosts.length > 0
      ? params.bindHosts
      : [params.bindHost];
  const primaryHost = hosts[0] ?? params.bindHost;
  params.log.info(
    `listening on ${scheme}://${formatHost(primaryHost)}:${params.port} (PID ${process.pid})`,
  );
  for (const host of hosts.slice(1)) {
    params.log.info(
      `listening on ${scheme}://${formatHost(host)}:${params.port}`,
    );
  }
  params.log.info(`log file: ${getResolvedLoggerSettings().file}`);
  if (params.isNixMode) {
    params.log.info("gateway: running in Nix mode (config managed externally)");
  }
}

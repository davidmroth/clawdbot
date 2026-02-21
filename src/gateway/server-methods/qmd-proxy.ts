import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { getEmbeddedRunId } from "../../agents/pi-embedded-runner/runs.js";
import { getAgentRunContext } from "../../infra/agent-events.js";

/**
 * Proxies `/v1/qmd/:sessionKey/*` requests to the internal QMD service,
 * automatically injecting the active `X-Run-Source` header downstream
 * so QMD can attach it to the `search.start` websocket event without
 * requiring the caller to know about runSources.
 */
export async function handleQmdProxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  // Match the path: /v1/qmd/<sessionKey>/<command>
  const match = url.pathname.match(/^\/v1\/qmd\/([^/]+)(\/.*)?$/);
  if (!match) return false;

  const sessionKey = match[1];
  const qmdPath = match[2] || "/";

  // Lookup the run source mapping
  let runSource: string | undefined;
  if (sessionKey && sessionKey !== "default") {
    const runId = getEmbeddedRunId(sessionKey);
    if (runId) {
      const context = getAgentRunContext(runId);
      runSource = context?.runSource;
    }
  }

  const qmdBaseUrl = new URL(
    process.env.QMD_URL || "http://memory-service:8100",
  );
  const proxyUrl = new URL(qmdPath + url.search, qmdBaseUrl);

  const options: http.RequestOptions = {
    hostname: proxyUrl.hostname,
    port: proxyUrl.port,
    path: proxyUrl.pathname + proxyUrl.search,
    method: req.method,
    headers: { ...req.headers },
  };

  // Strip headers bound to the gateway
  delete options.headers.host;
  delete options.headers.authorization;
  delete options.headers.connection;

  // Inject the structured metadata if available
  if (runSource) {
    options.headers["x-run-source"] = runSource;
  }

  return new Promise((resolve) => {
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
      proxyRes.on("end", () => resolve(true));
    });

    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }
      res.end(
        JSON.stringify({ error: "QMD Proxy Error", details: err.message }),
      );
      resolve(true);
    });

    req.pipe(proxyReq, { end: true });
  });
}

import { WebSocket } from "ws";
import { logVerbose, shouldLogVerbose } from "../globals.js";
import type { BackoffPolicy } from "../infra/backoff.js";
import { computeBackoff, sleepWithAbort } from "../infra/backoff.js";
import type { RuntimeEnv } from "../runtime.js";
import { type SignalSseEvent, streamSignalEvents } from "./client.js";

const DEFAULT_RECONNECT_POLICY: BackoffPolicy = {
  initialMs: 1_000,
  maxMs: 10_000,
  factor: 2,
  jitter: 0.2,
};

type RunSignalSseLoopParams = {
  baseUrl: string;
  account?: string;
  abortSignal?: AbortSignal;
  runtime: RuntimeEnv;
  onEvent: (event: SignalSseEvent) => void;
  policy?: Partial<BackoffPolicy>;
};

export async function runSignalSseLoop({
  baseUrl,
  account,
  abortSignal,
  runtime,
  onEvent,
  policy,
}: RunSignalSseLoopParams) {
  const reconnectPolicy = {
    ...DEFAULT_RECONNECT_POLICY,
    ...policy,
  };

  // PATCH: Use WebSocket for signal-cli-rest-api compatibility
  let wsBase = baseUrl.replace(/^http/, 'ws');
  if (wsBase.endsWith("/")) wsBase = wsBase.slice(0, -1);
  const wsUrl = `${wsBase}/v1/receive/${encodeURIComponent(account || '')}`;

  let reconnectAttempts = 0;

  const logReconnectVerbose = (message: string) => {
    if (!shouldLogVerbose()) return;
    logVerbose(message);
  };

  const connect = () => {
    return new Promise<void>((resolve, reject) => {
      if (abortSignal?.aborted) return resolve();

      runtime.log?.(`Connecting to Signal WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        reconnectAttempts = 0;
        logReconnectVerbose("Signal WebSocket connected.");
      });

      ws.on('message', (data) => {
        if (abortSignal?.aborted) {
          ws.close();
          return;
        }
        try {
           onEvent({
            event: "receive",
            data: data.toString()
          }); 
        } catch (err: any) {
          runtime.error?.(`Error parsing WS message: ${err.message}`);
        }
      });

      ws.on('error', (err) => {
        if (!abortSignal?.aborted) {
           // runtime.error?.(`Signal WebSocket error: ${err.message}`);
        }
      });

      ws.on('close', (code, reason) => {
        if (abortSignal?.aborted) return resolve();
        reject(new Error(`WebSocket closed: ${code} ${reason}`));
      });
      
       abortSignal?.addEventListener('abort', () => {
        ws.close();
        resolve();
      }, { once: true });
    });
  };

  while (!abortSignal?.aborted) {
    try {
      await connect();
    } catch (err) {
      if (abortSignal?.aborted) return;
      runtime.error?.(`Signal WS stream error: ${String(err)}`);
      reconnectAttempts += 1;
      const delayMs = computeBackoff(reconnectPolicy, reconnectAttempts);
      runtime.log?.(`Signal WS connection lost, reconnecting in ${delayMs / 1000}s...`);
      try {
        await sleepWithAbort(delayMs, abortSignal);
      } catch (sleepErr) {
        if (abortSignal?.aborted) return;
        throw sleepErr;
      }
    }
  }
}

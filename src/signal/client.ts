import { randomUUID } from "node:crypto";

import { resolveFetch } from "../infra/fetch.js";

export type SignalRpcOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export type SignalRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

export type SignalRpcResponse<T> = {
  jsonrpc?: string;
  result?: T;
  error?: SignalRpcError;
  id?: string | number | null;
};

export type SignalSseEvent = {
  event?: string;
  data?: string;
  id?: string;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Signal base URL is required");
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `http://${trimmed}`.replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const fetchImpl = resolveFetch();
  if (!fetchImpl) {
    throw new Error("fetch is not available");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function signalRpcRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> | undefined,
  opts: SignalRpcOptions,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  
  // PATCH: Route specific methods to REST endpoints for signal-cli-rest-api compatibility
  let endpoint = `${baseUrl}/api/v1/rpc`;
  let bodyPayload: string;

  if (method === "send") {
      endpoint = `${baseUrl}/v2/send`;
      const restParams = { ...params };
      // Map 'account' (internal) to 'number' (API expects this for sender)
      if (restParams.account && !restParams.number) {
          restParams.number = restParams.account;
      }
      // Map 'recipient' (RPC style) to 'recipients' (REST style)
      if (restParams.recipient && !restParams.recipients) {
          restParams.recipients = restParams.recipient;
          delete restParams.recipient;
      }
      bodyPayload = JSON.stringify(restParams);
  } else if (method === "sendTyping") {
      // Best effort mapping for typing
      endpoint = `${baseUrl}/v1/typing_indicator/${encodeURIComponent(String(params?.account || ''))}`;
      const restParams = { ...params };
      // Remove account from body as it is in URL
      delete restParams.account;
      bodyPayload = JSON.stringify(restParams);
      // NOTE: If this endpoint doesn't exist on the server, it will 404, but that is acceptable for typing.
  } else {
      // Default to RPC for everything else
      const id = randomUUID();
      bodyPayload = JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id,
      });
  }

  // LOGGING DEBUG
  console.log(`[SignalRPC] Request: method=${method} endpoint=${endpoint}`);

  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyPayload,
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (res.status === 201) {
    return undefined as T;
  }
  let text = await res.text();
  if (!text) {
    throw new Error(`Signal RPC empty response (status ${res.status})`);
  }

  // PATCH: Sanitize response (some versions of signal-cli-rest-api leak stdout/progress bars)
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  
  // LOGGING
  if (text.trim().length > 0 && (jsonStart === -1 || jsonEnd === -1)) {
     console.log(`[SignalRPC] Invalid JSON candidate: ${JSON.stringify(text)}`);
  }

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
      text = text.slice(jsonStart, jsonEnd + 1);
  }

  const parsed = JSON.parse(text) as SignalRpcResponse<T>;
  if (parsed.error) {
    const code = parsed.error.code ?? "unknown";
    const msg = parsed.error.message ?? "Signal RPC error";
    throw new Error(`Signal RPC ${code}: ${msg}`);
  }
  return parsed.result as T;
}

export async function signalCheck(
  baseUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status?: number | null; error?: string | null }> {
  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetchWithTimeout(`${normalized}/api/v1/check`, { method: "GET" }, timeoutMs);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, error: null };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function streamSignalEvents(params: {
  baseUrl: string;
  account?: string;
  abortSignal?: AbortSignal;
  onEvent: (event: SignalSseEvent) => void;
}): Promise<void> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const url = new URL(`${baseUrl}/api/v1/events`);
  if (params.account) url.searchParams.set("account", params.account);

  const fetchImpl = resolveFetch();
  if (!fetchImpl) {
    throw new Error("fetch is not available");
  }
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal: params.abortSignal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Signal SSE failed (${res.status} ${res.statusText || "error"})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: SignalSseEvent = {};

  const flushEvent = () => {
    if (!currentEvent.data && !currentEvent.event && !currentEvent.id) return;
    params.onEvent({
      event: currentEvent.event,
      data: currentEvent.data,
      id: currentEvent.id,
    });
    currentEvent = {};
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let lineEnd = buffer.indexOf("\n");
    while (lineEnd !== -1) {
      let line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      if (line === "") {
        flushEvent();
        lineEnd = buffer.indexOf("\n");
        continue;
      }
      if (line.startsWith(":")) {
        lineEnd = buffer.indexOf("\n");
        continue;
      }
      const [rawField, ...rest] = line.split(":");
      const field = rawField.trim();
      const rawValue = rest.join(":");
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
      if (field === "event") {
        currentEvent.event = value;
      } else if (field === "data") {
        currentEvent.data = currentEvent.data ? `${currentEvent.data}\n${value}` : value;
      } else if (field === "id") {
        currentEvent.id = value;
      }
      lineEnd = buffer.indexOf("\n");
    }
  }

  flushEvent();
}

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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
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
  let endpoint = "";
  let httpMethod = "POST";
  let bodyPayload: string = "";

  if (method === "send") {
    endpoint = `${baseUrl}/v2/send`;
    const restParams = { ...params };
    // Map 'account' (internal) to 'number' (API expects this for sender)
    if (restParams.account && !restParams.number) {
      restParams.number = restParams.account;
      delete restParams.account;
    }
    // Map 'recipient' (RPC style) to 'recipients' (REST style, must be array)
    if (restParams.recipient && !restParams.recipients) {
      restParams.recipients = Array.isArray(restParams.recipient)
        ? restParams.recipient
        : [restParams.recipient];
      delete restParams.recipient;
    }
    // Ensure recipients is always an array
    if (restParams.recipients && !Array.isArray(restParams.recipients)) {
      restParams.recipients = [restParams.recipients];
    }
    bodyPayload = JSON.stringify(restParams);
    console.log(`[SIGNAL-DEBUG] Sending ${method} payload:`, bodyPayload);
  } else if (method === "sendTyping") {
    // PUT /v1/typing-indicator/{number} - show typing
    endpoint = `${baseUrl}/v1/typing-indicator/${encodeURIComponent(String(params?.account || ""))}`;
    httpMethod = "PUT";
    const restParams = { ...params };
    delete restParams.account;
    bodyPayload = JSON.stringify(restParams);
  } else if (method === "sendReceipt") {
    // POST /v1/receipts/{number}
    endpoint = `${baseUrl}/v1/receipts/${encodeURIComponent(String(params?.account || ""))}`;
    const restParams = { ...params };
    delete restParams.account;
    bodyPayload = JSON.stringify(restParams);
  } else if (method === "sendReaction") {
    // POST /v1/reactions/{number}
    endpoint = `${baseUrl}/v1/reactions/${encodeURIComponent(String(params?.account || ""))}`;
    const restParams = { ...params };
    delete restParams.account;
    bodyPayload = JSON.stringify(restParams);
  } else if (method === "version") {
    // GET /v1/about - returns version info
    endpoint = `${baseUrl}/v1/about`;
    httpMethod = "GET";
    bodyPayload = "";
  } else {
    // Unsupported method - throw instead of falling back to non-existent RPC
    throw new Error(
      `Unsupported Signal API method: ${method}. signal-cli-rest-api does not support JSON-RPC.`,
    );
  }

  const fetchInit: RequestInit = {
    method: httpMethod,
    headers: { "Content-Type": "application/json" },
  };
  // Only include body for non-GET requests
  if (httpMethod !== "GET" && bodyPayload) {
    fetchInit.body = bodyPayload;
  }

  const res = await fetchWithTimeout(
    endpoint,
    fetchInit,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  // Handle success with no content
  if (res.status === 201 || res.status === 204) {
    return undefined as T;
  }

  // Check for non-OK responses
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Signal API error (${res.status}): ${errorText || res.statusText}`,
    );
  }

  let text = await res.text();
  if (!text) {
    // Empty response is OK for some endpoints
    return undefined as T;
  }

  // PATCH: Sanitize response (some versions of signal-cli-rest-api leak stdout/progress bars)
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");

  // LOGGING
  if (text.trim().length > 0 && (jsonStart === -1 || jsonEnd === -1)) {
    console.log(`[SignalRPC] Invalid JSON candidate: ${JSON.stringify(text)}`);
  }

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
    text = text.slice(jsonStart, jsonEnd + 1);
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;

  // Check for error response (REST or RPC style)
  if (parsed.error && typeof parsed.error === "object") {
    const err = parsed.error as { code?: number; message?: string };
    const code = err.code ?? "unknown";
    const msg = err.message ?? "Signal API error";
    throw new Error(`Signal API ${code}: ${msg}`);
  }
  if (parsed.error && typeof parsed.error === "string") {
    throw new Error(`Signal API error: ${parsed.error}`);
  }

  // Return result directly for REST endpoints (not wrapped in result)
  // RPC would have parsed.result, REST returns data directly
  if ("result" in parsed) {
    return parsed.result as T;
  }
  return parsed as T;
}

export async function signalCheck(
  baseUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status?: number | null; error?: string | null }> {
  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetchWithTimeout(
      `${normalized}/v1/health`,
      { method: "GET" },
      timeoutMs,
    );
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
    throw new Error(
      `Signal SSE failed (${res.status} ${res.statusText || "error"})`,
    );
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
        currentEvent.data = currentEvent.data
          ? `${currentEvent.data}\n${value}`
          : value;
      } else if (field === "id") {
        currentEvent.id = value;
      }
      lineEnd = buffer.indexOf("\n");
    }
  }

  flushEvent();
}

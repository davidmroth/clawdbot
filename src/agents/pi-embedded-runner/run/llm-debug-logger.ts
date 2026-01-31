import type { StreamFn } from "@mariozechner/pi-agent-core";
import { emitAgentEvent } from "../../../infra/agent-events.js";

type LlmDebugLogger = {
  wrapStreamFn: (streamFn: StreamFn) => StreamFn;
};

export function createLlmDebugLogger(params: {
  runId: string;
  provider: string;
  modelId: string;
}): LlmDebugLogger | undefined {
  if (!params.runId) return undefined;

  return {
    wrapStreamFn: (originalStreamFn: StreamFn): StreamFn => {
      // We return a function that matches StreamFn signature
      return (model, context, options) => {
        // 1. Emit Request Event
        const reqStart = Date.now();
        const requestData = {
          provider: params.provider,
          model: params.modelId,
          messages: (context as any).messages,
          system: (context as any).system,
          tools: (context as any).tools,
          config: (context as any).config,
        };

        emitAgentEvent({
          runId: params.runId,
          stream: "llm-req",
          data: requestData,
        });

        // Execute original function
        const result = originalStreamFn(model, context, options);

        // Wrap the result (which can be a Promise)
        return (async () => {
          const stream = await result;

          // Helper to patch the iterator
          const originalIterator = stream[Symbol.asyncIterator].bind(stream);

          // We patch the iterator to intercept chunks
          // Using 'any' for stream to bypass missing type definition of AssistantMessageEventStream
          (stream as any)[Symbol.asyncIterator] = async function* () {
            const chunks: unknown[] = [];
            let error: unknown = null;
            let usage: unknown = null;
            let responseText = "";

            try {
              const iterator = originalIterator();
              // Wrap iterator to make it iterable for 'for await'
              const iterable = { [Symbol.asyncIterator]: () => iterator };

              for await (const chunk of iterable) {
                chunks.push(chunk);

                // Extract text content from chunk
                if (chunk && typeof chunk === "object") {
                  // Handle different chunk formats
                  const c = chunk as any;

                  // Format: { type: "text", text: "..." }
                  if (c.type === "text" && typeof c.text === "string") {
                    responseText += c.text;
                  }
                  // Format: { delta: { text: "..." } } or { delta: { content: "..." } }
                  else if (c.delta) {
                    if (typeof c.delta.text === "string") {
                      responseText += c.delta.text;
                    } else if (typeof c.delta.content === "string") {
                      responseText += c.delta.content;
                    }
                  }
                  // Format: { content: [{ type: "text", text: "..." }] }
                  else if (Array.isArray(c.content)) {
                    for (const part of c.content) {
                      if (
                        part.type === "text" &&
                        typeof part.text === "string"
                      ) {
                        responseText += part.text;
                      }
                    }
                  }
                  // Format: { text: "..." } (simple text chunk)
                  else if (
                    typeof c.text === "string" &&
                    c.type !== "tool_use"
                  ) {
                    responseText += c.text;
                  }

                  // Extract usage if present
                  if ("usage" in c && c.usage) {
                    usage = c.usage;
                  }
                }

                yield chunk;
              }
            } catch (err) {
              error = err;
              throw err;
            } finally {
              // 3. Emit Response Event on stream completion/error
              emitAgentEvent({
                runId: params.runId,
                stream: "llm-res",
                data: {
                  durationMs: Date.now() - reqStart,
                  error: error ? String(error) : undefined,
                  usage,
                  chunksCount: chunks.length,
                  // Include the accumulated response text (truncate if very long)
                  responseText:
                    responseText.length > 10000
                      ? responseText.slice(0, 10000) + "... [truncated]"
                      : responseText,
                },
              });
            }
          };

          return stream;
        })();
      };
    },
  };
}

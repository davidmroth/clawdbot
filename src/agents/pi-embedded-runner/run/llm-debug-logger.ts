import type { StreamFn } from "@mariozechner/pi-agent-core";
import { emitAgentEvent } from "../../../infra/agent-events.js";
import { normalizeChunk } from "../../../gateway/stream-normalizer.js";

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

                // Use the shared normalizer
                const normalized = normalizeChunk(chunk);
                if (normalized?.type === "text") {
                  // isCumulative means the chunk contains full text so far (replace, don't append)
                  if (normalized.isCumulative) {
                    responseText = normalized.text;
                  } else {
                    responseText += normalized.text;
                  }
                  if (normalized.usage) {
                    usage = normalized.usage;
                  }
                } else if (normalized?.type === "tool_call") {
                  // Optional: track tool calls if needed
                } else if (normalized && "usage" in (normalized as any)) {
                   // Fallback for usage-only chunks
                   if ((normalized as any).usage) {
                     usage = (normalized as any).usage;
                   }
                }

                yield chunk;
              }
            } catch (err) {
              error = err;
              throw err;
            } finally {
              // Fallback: If responseText is empty but we have chunks, try to dump the first chunk to help debug
              if (!responseText && chunks.length > 0) {
                try {
                  const sample =
                    typeof chunks[0] === "string"
                      ? chunks[0]
                      : JSON.stringify(chunks[0]);
                  responseText = `[DEBUG: Could not parse response text. Raw chunk sample: ${sample}]`;
                } catch (e) {
                  responseText = `[DEBUG: Could not parse response text. Chunks: ${chunks.length}]`;
                }
              }

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

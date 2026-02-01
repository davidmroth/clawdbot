// Standard type for a normalized stream chunk
export type StandardChunk =
  | { type: "text"; text: string; usage?: unknown; isCumulative?: boolean }
  | { type: "tool_call"; toolName?: string; toolArgs?: string; toolCallId?: string };

// Helper to normalize various provider formats into a StandardChunk
export function normalizeChunk(chunk: unknown): StandardChunk | null {
  if (!chunk || typeof chunk !== "object") {
    // If it's a plain string, treat as text
    if (typeof chunk === "string") {
      return { type: "text", text: chunk };
    }
    return null;
  }

  const c = chunk as Record<string, any>;

  // 0. pi-agent-core internal format
  // Format: { type: "start"|"...", partial: { role: "assistant", content: [{ type: "text", text: "..." }], usage: ... } }
  // NOTE: This format sends CUMULATIVE text (full content so far), not deltas
  if (c.partial && typeof c.partial === "object") {
    const partial = c.partial as Record<string, any>;
    let combinedText = "";
    let hasToolCall = false;
    let toolCallInfo: { toolName?: string; toolArgs?: string; toolCallId?: string } | null = null;
    
    if (Array.isArray(partial.content)) {
      for (const part of partial.content) {
        if (part && typeof part === "object") {
          if (part.type === "text" && typeof part.text === "string") {
            combinedText += part.text;
          } else if (part.type === "toolCall" || part.type === "tool_call") {
            // Detect tool calls in pi-agent-core format
            hasToolCall = true;
            // Capture first tool call info for the return value
            if (!toolCallInfo) {
              toolCallInfo = {
                toolCallId: part.id || part.toolCallId,
                toolName: part.name || part.toolName,
                toolArgs: typeof part.arguments === "string" 
                  ? part.arguments 
                  : part.arguments ? JSON.stringify(part.arguments) : undefined,
              };
            }
          }
        }
      }
    }
    
    // Return tool_call type if we found tool calls (takes priority over text)
    if (hasToolCall && toolCallInfo) {
      return { type: "tool_call", ...toolCallInfo };
    }
    if (combinedText || partial.usage) {
      return { type: "text", text: combinedText, usage: partial.usage, isCumulative: true };
    }
  }

  // 1. OpenAI Format (Standard & xAI/Grok)
  // Format: { choices: [{ delta: { content: "..." } }] } (Streaming)
  // Format: { choices: [{ text: "..." }] } (Completion/Legacy)
  if (Array.isArray(c.choices) && c.choices.length > 0 && c.choices[0]) {
    const choice = c.choices[0];
    // Check streaming delta
    if (choice.delta) {
      if (typeof choice.delta.content === "string") {
        return { type: "text", text: choice.delta.content, usage: c.usage };
      }
      // Check for tool calls in delta
      if (Array.isArray(choice.delta.tool_calls) && choice.delta.tool_calls.length > 0) {
        const tc = choice.delta.tool_calls[0];
        return {
          type: "tool_call",
          toolCallId: tc.id,
          toolName: tc.function?.name,
          toolArgs: tc.function?.arguments,
        };
      }
    }
    // Check completion text
    if (typeof choice.text === "string") {
      return { type: "text", text: choice.text, usage: c.usage };
    }
  }

  // 2. Anthropic Format
  // Format: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
  if (c.type === "content_block_delta" && c.delta && c.delta.type === "text_delta") {
    if (typeof c.delta.text === "string") {
      return { type: "text", text: c.delta.text, usage: c.usage };
    }
  }
  // Format: { type: "completion", completion: "..." } (Legacy)
  if (c.type === "completion" && typeof c.completion === "string") {
    return { type: "text", text: c.completion, usage: c.usage };
  }

  // 3. Generic/Simple Format
  // Format: { type: "text", text: "..." }
  if (c.type === "text" && typeof c.text === "string") {
    return { type: "text", text: c.text, usage: c.usage };
  }
  // Format: { text: "..." }
  if (typeof c.text === "string" && c.type !== "tool_use") {
    return { type: "text", text: c.text, usage: c.usage };
  }
  // Format: { delta: { text: "..." } } or { delta: { content: "..." } } (Some proxies)
  if (c.delta) {
    if (typeof c.delta.text === "string") {
      return { type: "text", text: c.delta.text, usage: c.usage };
    }
    if (typeof c.delta.content === "string") {
      return { type: "text", text: c.delta.content, usage: c.usage };
    }
  }
  // Format: { content: [{ type: "text", text: "..." }] }
  if (Array.isArray(c.content)) {
    let combinedText = "";
    for (const part of c.content) {
      if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
        combinedText += part.text;
      }
    }
    if (combinedText) {
      return { type: "text", text: combinedText, usage: c.usage };
    }
  }

  // Pass-through usage if that's all we found (e.g. final chunk)
  if (c.usage) {
    // Return empty text chunk just to carry usage
    return { type: "text", text: "", usage: c.usage };
  }

  return null;
}

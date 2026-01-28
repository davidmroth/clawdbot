/**
 * Content Pre-Processor
 *
 * Detects raw structured content (JSON, XML, YAML, etc.) and wraps it
 * in appropriate markdown code fences for proper syntax highlighting.
 *
 * This class is designed to be extensible - add new handlers for
 * additional content types as needed.
 */

/**
 * Handler for detecting and transforming a specific content type
 */
export interface ContentHandler {
  /** Unique name for this handler (used for debugging) */
  name: string;
  /** Language identifier for the code fence */
  language: string;
  /** Check if content matches this type */
  detect(content: string): boolean;
  /** Optional: pre-process content before wrapping (e.g., formatting) */
  preProcess?(content: string): string;
}

/**
 * JSON content handler
 */
const jsonHandler: ContentHandler = {
  name: "json",
  language: "json",

  detect(content: string): boolean {
    const trimmed = content.trim();

    // Must start and end with matching brackets
    const isObject = trimmed.startsWith("{") && trimmed.endsWith("}");
    const isArray = trimmed.startsWith("[") && trimmed.endsWith("]");

    if (!isObject && !isArray) {
      return false;
    }

    // Must be valid JSON
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * XML/HTML content handler
 */
const xmlHandler: ContentHandler = {
  name: "xml",
  language: "xml",

  detect(content: string): boolean {
    const trimmed = content.trim();

    // Must start with < and end with >
    if (!trimmed.startsWith("<") || !trimmed.endsWith(">")) {
      return false;
    }

    // Should look like XML/HTML with proper tag structure
    // Check for opening and closing tags
    const hasOpenTag = /<[a-zA-Z][^>]*>/.test(trimmed);
    const hasCloseTag = /<\/[a-zA-Z][^>]*>/.test(trimmed);

    // Require both open and close tags (not just self-closing)
    return hasOpenTag && hasCloseTag;
  },
};

/**
 * Content Pre-Processor
 *
 * Detects raw structured content and wraps it in code fences.
 * Handlers are checked in order - first match wins.
 */
export class ContentPreProcessor {
  private handlers: ContentHandler[] = [];

  constructor() {
    // Register default handlers
    this.register(jsonHandler);
    this.register(xmlHandler);
  }

  /**
   * Register a new content handler
   */
  register(handler: ContentHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Register a handler at the beginning (higher priority)
   */
  registerFirst(handler: ContentHandler): void {
    this.handlers.unshift(handler);
  }

  /**
   * Get all registered handler names
   */
  getHandlerNames(): string[] {
    return this.handlers.map((h) => h.name);
  }

  /**
   * Process content - detect type and wrap in code fence if needed
   */
  process(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return content;

    // Skip if content already looks like markdown with code fences
    if (trimmed.includes("```")) {
      return content;
    }

    // Check each handler
    for (const handler of this.handlers) {
      if (handler.detect(trimmed)) {
        const processed = handler.preProcess
          ? handler.preProcess(trimmed)
          : trimmed;
        return "```" + handler.language + "\n" + processed + "\n```";
      }
    }

    // No match - return as-is
    return content;
  }
}

// Singleton instance for convenience
export const contentPreProcessor = new ContentPreProcessor();

/**
 * Pre-process content before markdown parsing
 *
 * Detects raw structured content (JSON, XML, etc.) and wraps it
 * in appropriate code fences for syntax highlighting.
 */
export function preProcessContent(content: string): string {
  return contentPreProcessor.process(content);
}

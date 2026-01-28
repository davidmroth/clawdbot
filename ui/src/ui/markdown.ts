import DOMPurify from "dompurify";
import { marked } from "marked";
import { truncateText } from "./format";
import { preProcessContent } from "./content-preprocessor";

declare const hljs: any;

marked.setOptions({
  gfm: true,
  breaks: true,
  mangle: false,
});

const allowedTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "button",
  "circle",
  "clipPath",
  "code",
  "defs",
  "del",
  "div",
  "ellipse",
  "em",
  "foreignObject",
  "g",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "line",
  "linearGradient",
  "marker",
  "ol",
  "p",
  "path",
  "polygon",
  "polyline",
  "pre",
  "radialGradient",
  "rect",
  "span",
  "stop",
  "strong",
  "style",
  "svg",
  "table",
  "tbody",
  "td",
  "text",
  "textPath",
  "th",
  "thead",
  "title",
  "tr",
  "tspan",
  "ul",
  "use",
];

const allowedAttrs = [
  "aria-hidden",
  "aria-label",
  "aria-labelledby",
  "class",
  "clip-path",
  "cx",
  "cy",
  "d",
  "data-mermaid-id",
  "dominant-baseline",
  "dx",
  "dy",
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "height",
  "href",
  "id",
  "marker-end",
  "marker-start",
  "offset",
  "opacity",
  "points",
  "r",
  "refX",
  "refY",
  "rel",
  "rx",
  "ry",
  "start",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "style",
  "target",
  "text-anchor",
  "title",
  "transform",
  "type",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "xlink:href",
  "xmlns",
  "y",
  "y1",
  "y2",
];

// Custom renderer for Grok-style code blocks
const renderer = {
  // Marked v5+ passes a token object: { type: 'code', raw, text, lang, ... }
  code(tokenOrCode: any, infostring?: string, escaped?: boolean) {
    let code = "";
    let lang = "plain";

    // Extract code and lang from the token (marked v5+ format)
    if (typeof tokenOrCode === "object" && tokenOrCode !== null) {
      code = tokenOrCode.text ?? "";
      lang = tokenOrCode.lang || "plain";
    } else if (typeof tokenOrCode === "string") {
      // Legacy format fallback
      code = tokenOrCode;
      lang = typeof infostring === "string" ? infostring : "plain";
    }

    // Clean up language string
    const cleanLang = (lang || "").toLowerCase().trim();

    // Special handling for mermaid diagrams
    if (cleanLang === "mermaid") {
      const mermaidId = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
      const escapedCode = escapeHtml(code);
      return `
        <div class="mermaid-container" data-mermaid-id="${mermaidId}">
          <div class="mermaid-diagram" id="${mermaidId}">${escapedCode}</div>
          <div class="mermaid-fallback" style="display: none;">
            <div class="code-block">
              <div class="code-header">
                <span class="code-lang">mermaid</span>
              </div>
              <div class="code-content">
                <pre><code class="hljs">${escapedCode}</code></pre>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Custom renderer for Grok-style code blocks
    // Note: We deliberately do NOT use the 'collapsed' logic here anymore for sidebar/tool outputs
    // to ensure they are always fully visible and scrollable.

    // Highlight using highlight.js
    let highlighted;
    try {
      // Map common aliases/extensions to highlight.js names
      const langMap: Record<string, string> = {
        js: "javascript",
        ts: "typescript",
        py: "python",
        sh: "bash",
        yml: "yaml",
        md: "markdown",
      };

      const targetLang = langMap[cleanLang] || cleanLang;

      // Auto-detect if generic/plain
      if (
        !targetLang ||
        targetLang === "plain" ||
        targetLang === "text" ||
        targetLang === "plaintext"
      ) {
        const auto = hljs.highlightAuto(code);
        highlighted = auto.value;
      } else {
        // Check if language is supported, fallback to plaintext if not
        const validLang = hljs.getLanguage(targetLang)
          ? targetLang
          : "plaintext";
        if (validLang === "plaintext") {
          // Fallback to auto if explicit lang is invalid/unknown
          const auto = hljs.highlightAuto(code);
          highlighted = auto.value;
        } else {
          highlighted = hljs.highlight(code, { language: validLang }).value;
        }
      }
    } catch (e) {
      // Last resort fallback
      highlighted = escapeHtml(code);
    }

    // Icons
    const copyIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2-2v1"></path></svg>`;

    return `
      <div class="code-block">
        <div class="code-header">
          <span class="code-lang">${lang || "text"}</span>
          <div class="code-actions">
            <button class="code-btn code-copy" type="button">
              ${copyIcon}
              <span class="btn-text">Copy</span>
            </button>
          </div>
        </div>
        <div class="code-content">
          <pre><code class="hljs">${highlighted}</code></pre>
        </div>
      </div>
    `;
  },
};

marked.use({ renderer });

let hooksInstalled = false;
const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;
const markdownCache = new Map<string, string>();

function getCachedMarkdown(key: string): string | null {
  const cached = markdownCache.get(key);
  if (cached === undefined) return null;
  markdownCache.delete(key);
  markdownCache.set(key, cached);
  return cached;
}

function setCachedMarkdown(key: string, value: string) {
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) return;
  const oldest = markdownCache.keys().next().value;
  if (oldest) markdownCache.delete(oldest);
}

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    const href = node.getAttribute("href");
    if (!href) return;
    node.setAttribute("rel", "noreferrer noopener");
    node.setAttribute("target", "_blank");
  });
}

export function toSanitizedMarkdownHtml(markdown: string): string {
  const rawInput = markdown.trim();
  if (!rawInput) return "";

  // Pre-process to detect and wrap raw structured content (JSON, XML, etc.)
  const input = preProcessContent(rawInput);

  installHooks();
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    const cached = getCachedMarkdown(input);
    if (cached !== null) return cached;
  }
  const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
    : "";
  if (truncated.text.length > MARKDOWN_PARSE_LIMIT) {
    const escaped = escapeHtml(`${truncated.text}${suffix}`);
    const html = `<pre class="code-block">${escaped}</pre>`;
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttrs,
    });
    if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
      setCachedMarkdown(input, sanitized);
    }
    return sanitized;
  }
  const rendered = marked.parse(`${truncated.text}${suffix}`) as string;
  const sanitized = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
  });
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    setCachedMarkdown(input, sanitized);
  }
  return sanitized;
}

function escapeHtml(value: string): string {
  if (typeof value !== "string") return String(value || "");
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

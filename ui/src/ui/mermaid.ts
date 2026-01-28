/**
 * Mermaid diagram rendering support
 *
 * This module initializes mermaid and provides a function to render
 * mermaid diagrams that have been placed in the DOM by the markdown renderer.
 *
 * Error handling: We catch all rendering errors and show a graceful fallback
 * with the raw code and an error banner.
 */

import mermaid from "mermaid";

let initialized = false;
let renderCounter = 0;

/**
 * Initialize mermaid with theme-aware configuration
 */
export function initMermaid() {
  if (initialized) return;
  initialized = true;

  const isDark =
    document.documentElement.getAttribute("data-theme") !== "light";

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "strict",
    fontFamily: "inherit",
  });

  console.log("[mermaid] Initialized with theme:", isDark ? "dark" : "default");
}

/**
 * Re-initialize mermaid when theme changes
 */
export function updateMermaidTheme() {
  const isDark =
    document.documentElement.getAttribute("data-theme") !== "light";

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "strict",
    fontFamily: "inherit",
  });
}

/**
 * Extract a user-friendly error message from mermaid errors
 */
function formatMermaidError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    // Look for parse error line info
    const parseMatch = msg.match(/Parse error on line (\d+)/i);
    if (parseMatch) {
      return `Syntax error on line ${parseMatch[1]}`;
    }
    // Look for lexical error
    const lexMatch = msg.match(/Lexical error/i);
    if (lexMatch) {
      return "Syntax error - unexpected character";
    }
    // Generic cleanup - take first line, limit length
    const firstLine = msg.split("\n")[0];
    return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
  }
  return "Invalid diagram syntax";
}

/**
 * Escape HTML to prevent XSS in error messages
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Show error state for a mermaid container
 */
function showMermaidError(
  containerEl: HTMLElement,
  diagramEl: HTMLElement,
  fallbackEl: HTMLElement | null,
  errorMsg: string,
) {
  console.warn("[mermaid] Error:", errorMsg);

  // Clear and hide the diagram element
  diagramEl.innerHTML = "";
  diagramEl.style.display = "none";

  if (fallbackEl) {
    // Add error banner above the code if not already present
    const existingBanner = fallbackEl.querySelector(".mermaid-error-banner");
    if (!existingBanner) {
      const banner = document.createElement("div");
      banner.className = "mermaid-error-banner";
      banner.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${escapeHtml(errorMsg)}</span>
      `;
      fallbackEl.insertBefore(banner, fallbackEl.firstChild);
    }
    fallbackEl.style.display = "";
  }

  containerEl.setAttribute("data-mermaid-rendered", "error");
}

/**
 * Render all unprocessed mermaid diagrams in the given container
 *
 * @param container - The container element to search for mermaid diagrams
 */
export async function renderMermaidDiagrams(
  container: HTMLElement = document.body,
) {
  initMermaid();

  // Find all mermaid containers that haven't been processed yet
  const diagrams = container.querySelectorAll<HTMLElement>(
    ".mermaid-container:not([data-mermaid-rendered])",
  );

  console.log("[mermaid] Found", diagrams.length, "unprocessed diagrams");

  if (diagrams.length === 0) return;

  for (const containerEl of diagrams) {
    const diagramEl =
      containerEl.querySelector<HTMLElement>(".mermaid-diagram");
    const fallbackEl =
      containerEl.querySelector<HTMLElement>(".mermaid-fallback");

    if (!diagramEl) {
      console.warn("[mermaid] No diagram element found in container");
      continue;
    }

    const code = diagramEl.textContent?.trim() || "";
    console.log("[mermaid] Processing diagram, code length:", code.length);

    if (!code) {
      console.warn("[mermaid] Empty diagram code");
      containerEl.setAttribute("data-mermaid-rendered", "empty");
      continue;
    }

    // Generate a unique ID for this render (mermaid requires unique IDs)
    const renderId = `mermaid-render-${++renderCounter}-${Date.now()}`;

    try {
      // Render the diagram directly - mermaid.render() will throw on syntax errors
      console.log("[mermaid] Rendering with ID:", renderId);
      const { svg } = await mermaid.render(renderId, code);

      if (!svg || svg.trim() === "") {
        console.warn("[mermaid] Render returned empty SVG");
        showMermaidError(
          containerEl,
          diagramEl,
          fallbackEl,
          "Diagram rendered empty",
        );
        continue;
      }

      console.log("[mermaid] Render successful, SVG length:", svg.length);

      // Success! Replace content with rendered SVG
      diagramEl.innerHTML = svg;
      diagramEl.style.display = "";
      containerEl.setAttribute("data-mermaid-rendered", "true");

      // Hide fallback
      if (fallbackEl) fallbackEl.style.display = "none";
    } catch (error) {
      // Render threw an exception (syntax error, etc.)
      console.error("[mermaid] Render failed:", error);
      const errorMsg = formatMermaidError(error);
      showMermaidError(containerEl, diagramEl, fallbackEl, errorMsg);
    }
  }
}

/**
 * Set up a MutationObserver to automatically render mermaid diagrams
 * when new content is added to the DOM
 */
export function setupMermaidObserver(container: HTMLElement = document.body) {
  initMermaid();

  console.log("[mermaid] Setting up observer");

  const observer = new MutationObserver((mutations) => {
    let hasNewMermaid = false;

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (
              node.classList?.contains("mermaid-container") ||
              node.querySelector?.(".mermaid-container")
            ) {
              hasNewMermaid = true;
              break;
            }
          }
        }
      }
      if (hasNewMermaid) break;
    }

    if (hasNewMermaid) {
      console.log("[mermaid] New mermaid content detected");
      // Debounce rendering slightly
      requestAnimationFrame(() => {
        void renderMermaidDiagrams(container);
      });
    }
  });

  observer.observe(container, {
    childList: true,
    subtree: true,
  });

  // Initial render
  void renderMermaidDiagrams(container);

  return observer;
}

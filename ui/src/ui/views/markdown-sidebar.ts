import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { icons } from "../icons";
import { toSanitizedMarkdownHtml } from "../markdown";
import "../components/monaco-editor-wrapper";

export type MarkdownSidebarProps = {
  content: string | null;
  mode?: "view" | "edit";
  language?: string;
  error: string | null;
  onClose: () => void;
  onViewRawText: () => void;
  onContentChange?: (content: string) => void;
  onLanguageChange?: (language: string) => void;
  onSend?: () => void;
};

const LANGUAGES = [
  { id: "plaintext", name: "Text" },
  { id: "javascript", name: "JavaScript" },
  { id: "typescript", name: "TypeScript" },
  { id: "python", name: "Python" },
  { id: "json", name: "JSON" },
  { id: "html", name: "HTML" },
  { id: "css", name: "CSS" },
  { id: "shell", name: "Bash" },
  { id: "markdown", name: "Markdown" },
  { id: "sql", name: "SQL" },
  { id: "xml", name: "XML" },
  { id: "yaml", name: "YAML" },
];

export function renderMarkdownSidebar(props: MarkdownSidebarProps) {
  const isToolOutput = props.mode !== "edit";
  
  return html`
    <div class="sidebar-panel">
      <div class="sidebar-header">
        <div class="sidebar-title">${isToolOutput ? "Tool Output" : "Snippet Editor"}</div>
        ${!isToolOutput && props.onLanguageChange
          ? html`
              <select 
                class="sidebar-lang-select" 
                @change=${(e: Event) => props.onLanguageChange?.((e.target as HTMLSelectElement).value)}
                style="margin-left: auto; margin-right: 8px; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-primary);"
              >
                ${LANGUAGES.map(l => html`<option value=${l.id} ?selected=${l.id === (props.language || "javascript")}>${l.name}</option>`)}
              </select>
              <button 
                @click=${props.onSend} 
                class="btn primary" 
                style="margin-right: 8px; padding: 2px 8px; font-size: 12px; height: 24px;"
                title="Insert into chat and send"
              >
                Send
              </button>
            `
          : nothing}
        <button @click=${props.onClose} class="btn" title="Close sidebar">
          ${icons.x}
        </button>
      </div>
      <div class="sidebar-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
        ${props.error
          ? html`
              <div class="callout danger" style="margin: 1rem;">${props.error}</div>
              <button @click=${props.onViewRawText} class="btn" style="margin: 1rem;">
                View Raw Text
              </button>
            `
          : isToolOutput
            ? html`<div class="sidebar-markdown" style="padding: 1rem; overflow: auto;">${unsafeHTML(toSanitizedMarkdownHtml(props.content || ""))}</div>`
            : html`
                <monaco-editor-wrapper
                    style="flex: 1; min-height: 0; width: 100%;"
                    .value=${props.content || ""}
                    .language=${props.language || "javascript"}
                    @change=${(e: CustomEvent) => props.onContentChange?.(e.detail)}
                ></monaco-editor-wrapper>
              `}
      </div>
    </div>
  `;
}


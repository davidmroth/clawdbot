import { html, nothing } from "lit";
import type { LlmInteraction } from "../controllers/llm-debug";
import { icons } from "../icons";

function renderJson(data: unknown) {
  return html`<pre class="code-block"><code>${JSON.stringify(
    data,
    null,
    2,
  )}</code></pre>`;
}

function renderMessage(msg: any) {
  return html`
    <div class="message message--${msg.role}">
      <div class="message__role">${msg.role}</div>
      <div class="message__content">
        ${typeof msg.content === "string"
          ? msg.content
          : renderJson(msg.content)}
      </div>
    </div>
  `;
}

export function renderLlmDebug(props: {
  history: LlmInteraction[];
  onClear: () => void;
}) {
  return html`
    <div class="view-llm-debug">
      <div class="llm-debug-header">
        <h2>LLM Interactions</h2>
        <button class="btn btn--sm" @click=${props.onClear}>Clear</button>
      </div>
      <div class="llm-debug-list">
        ${props.history.length === 0
          ? html`<div class="empty-state">
              No LLM interactions recorded yet. Trigger an agent to see data.
            </div>`
          : props.history.map(
              (entry) => html`
                <details class="llm-entry ${entry.status}">
                  <summary class="llm-entry__summary">
                    <span class="llm-entry__meta">
                      <span class="status-dot ${entry.status}"></span>
                      <span class="time"
                        >${new Date(entry.ts).toLocaleTimeString()}</span
                      >
                      <span class="model"
                        >${entry.provider}/${entry.model}</span
                      >
                      <span class="duration"
                        >${entry.durationMs
                          ? `${entry.durationMs}ms`
                          : "..."}</span
                      >
                    </span>
                  </summary>
                  <div class="llm-entry__details">
                    <div class="detail-section">
                      <h3>System Prompt</h3>
                      <pre class="system-prompt">${entry.system}</pre>
                    </div>
                    <div class="detail-section">
                      <h3>Messages (${entry.messages.length})</h3>
                      <div class="message-list">
                        ${entry.messages.map(renderMessage)}
                      </div>
                    </div>
                    <div class="detail-section">
                      <h3>Tools (${entry.tools?.length ?? 0})</h3>
                      ${renderJson(entry.tools)}
                    </div>
                    ${entry.responseUsage
                      ? html`
                          <div class="detail-section">
                            <h3>Usage</h3>
                            ${renderJson(entry.responseUsage)}
                          </div>
                        `
                      : nothing}
                    ${entry.responseError
                      ? html`
                          <div class="detail-section error">
                            <h3>Error</h3>
                            <pre>${entry.responseError}</pre>
                          </div>
                        `
                      : nothing}
                  </div>
                </details>
              `,
            )}
      </div>
    </div>
  `;
}

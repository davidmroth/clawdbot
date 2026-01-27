import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { SessionsListResult } from "../types";
import type { ChatAttachment, ChatQueueItem } from "../ui-types";
import type { ChatItem, MessageGroup } from "../types/chat-types";
import { icons } from "../icons";
import {
  normalizeMessage,
  normalizeRoleForGrouping,
} from "../chat/message-normalizer";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render";
import { renderMarkdownSidebar } from "./markdown-sidebar";
import "../components/resizable-divider";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarLanguage?: string;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  onOpenSidebar?: (content: string) => void;
  onSidebarContentChange?: (content: string) => void;
  onSidebarLanguageChange?: (language: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) return nothing;

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="callout info compaction-indicator compaction-indicator--active">
        ${icons.loader} Compacting context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="callout success compaction-indicator compaction-indicator--complete">
          ${icons.check} Context compacted
        </div>
      `;
    }
  }

  return nothing;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(
  e: ClipboardEvent,
  props: ChatProps,
) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) return;

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) return;

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    };
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) return nothing;

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img"
            />
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter(
                  (a) => a.id !== att.id,
                );
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find(
    (row) => row.key === props.sessionKey,
  );
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : "Message (↩ to send, Shift+↩ for line breaks, paste images)"
    : "Connect to the gateway to start chatting…";

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);

  // Global handler for code block interactions (Collapse/Copy)
  const handleCodeBlockClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest(".code-btn");
    if (!btn) return;

    // Toggle Collapse
    if (btn.classList.contains("code-toggle")) {
      const block = btn.closest(".code-block");
      const content = block?.querySelector(".code-content");
      const icon = btn.querySelector(".icon-chevron");
      const text = btn.querySelector(".btn-text");
      
      if (block && content && icon && text) {
        const isCollapsed = content.classList.toggle("collapsed");
        text.textContent = isCollapsed ? "Expand" : "Collapse";
        icon.innerHTML = isCollapsed 
          ? '<polyline points="6 9 12 15 18 9"></polyline>' // Down arrow (expand)
          : '<polyline points="18 15 12 9 6 15"></polyline>'; // Up arrow (collapse)
      }
    }

    // Copy Code
    if (btn.classList.contains("code-copy")) {
      const block = btn.closest(".code-block");
      const code = block?.querySelector("code")?.innerText;
      if (code) {
        // Fallback for non-secure contexts (e.g. http://ai.local) where clipboard API is missing
        if (!navigator.clipboard) {
            const textArea = document.createElement("textarea");
            textArea.value = code;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                const text = btn.querySelector(".btn-text");
                if (text) {
                    const original = text.textContent;
                    text.textContent = "Copied!";
                    setTimeout(() => { text.textContent = original; }, 2000);
                }
            } catch (err) {
                console.error('Fallback: Oops, unable to copy', err);
            }
            document.body.removeChild(textArea);
            return;
        }

        navigator.clipboard.writeText(code).then(() => {
            const text = btn.querySelector(".btn-text");
            if (text) {
                const original = text.textContent;
                text.textContent = "Copied!";
                setTimeout(() => { text.textContent = original; }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
      }
    }
  };

  const thread = html`
    <style>
      /* Grok-style Code Block Styles */
      .code-block { margin: 12px 0; background: #f9f9f9; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color, rgba(0,0,0,0.1)); font-size: 13px; }
      .code-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #f0f0f0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.05)); color: #666; font-family: sans-serif; }
      .code-lang { font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
      .code-actions { display: flex; gap: 8px; }
      .code-btn { appearance: none; background: transparent; border: none; color: #555; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; font-size: 12px; transition: background 0.2s; }
      .code-btn:hover { background: rgba(0,0,0,0.05); color: #000; }
      .code-content { position: relative; overflow: hidden; transition: max-height 0.3s ease; background: #fff; }
      .code-content pre { margin: 0; padding: 12px; overflow-x: auto; border: none; background: transparent; }
      
      /* Collapsed State */
      .code-content.collapsed { max-height: 80px; }
      .code-content.collapsed::after { content: ""; position: absolute; bottom: 0; left: 0; width: 100%; height: 40px; background: linear-gradient(transparent, #fff); pointer-events: none; }
      
      /* Dark mode overrides (if applicable via CSS vars) */
      @media (prefers-color-scheme: dark) {
        .code-block { background: #1a1a1a; border-color: #333; }
        .code-header { background: #252525; border-color: #333; color: #aaa; }
        .code-content { background: #111; }
        .code-content.collapsed::after { background: linear-gradient(transparent, #111); }
        .code-btn { color: #aaa; }
        .code-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
      }
    </style>
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
      @click=${handleCodeBlockClick}
    >
      ${props.loading ? html`<div class="muted">Loading chat…</div>` : nothing}
      ${repeat(buildChatItems(props), (item) => item.key, (item) => {
        if (item.kind === "reading-indicator") {
          return renderReadingIndicatorGroup(assistantIdentity);
        }

        if (item.kind === "stream") {
          return renderStreamingGroup(
            item.text,
            item.startedAt,
            props.onOpenSidebar,
            assistantIdentity,
          );
        }

        if (item.kind === "group") {
          return renderMessageGroup(item, {
            onOpenSidebar: props.onOpenSidebar,
            showReasoning,
            assistantName: props.assistantName,
            assistantAvatar: assistantIdentity.avatar,
          });
        }

        return nothing;
      })}
    </div>
  `;

  return html`
    <section class="card chat">
      ${props.disabledReason
        ? html`<div class="callout">${props.disabledReason}</div>`
        : nothing}

      ${props.error
        ? html`<div class="callout danger">${props.error}</div>`
        : nothing}

      ${renderCompactionIndicator(props.compactionStatus)}

      ${props.focusMode
        ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
        : nothing}

      <div
        class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}"
      >
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${sidebarOpen
          ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) =>
                  props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  language: props.sidebarLanguage ?? "javascript",
                  error: props.sidebarError ?? null,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) return;
                    props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                  },
                  onContentChange: props.onSidebarContentChange,
                  onLanguageChange: props.onSidebarLanguageChange,
                  onSend: () => {
                    if (!props.sidebarContent) return;
                    const lang = props.sidebarLanguage || "plaintext";
                    const fenced = `\`\`\`${lang}\n${props.sidebarContent}\n\`\`\``;
                    props.onDraftChange(fenced);
                    props.onSend();
                    props.onCloseSidebar?.();
                  },
                })}
              </div>
            `
          : nothing}
      </div>

      ${props.queue.length
        ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__title">Queued (${props.queue.length})</div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__text">
                        ${item.text ||
                        (item.attachments?.length
                          ? `Image (${item.attachments.length})`
                          : "")}
                      </div>
                      <button
                        class="btn chat-queue__remove"
                        type="button"
                        aria-label="Remove queued message"
                        @click=${() => props.onQueueRemove(item.id)}
                      >
                        ${icons.x}
                      </button>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>Message</span>
            <textarea
              .value=${props.draft}
              style="max-height: 50vh; overflow-y: hidden;"
              ?disabled=${!props.connected}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") return;
                if (e.isComposing || e.keyCode === 229) return;
                if (e.shiftKey) return; // Allow Shift+Enter for line breaks
                if (!props.connected) return;

                const el = e.target as HTMLTextAreaElement;
                const val = el.value;
                
                // Snippet Mode Trigger: ``` + Enter
                if (/(?:^|\n)\s*```\s*$/.test(val)) {
                  e.preventDefault();
                  const newDraft = val.replace(/(?:^|\n)\s*```\s*$/, "").trim();
                  props.onDraftChange(newDraft);
                  if (props.onOpenSidebar) {
                    props.onOpenSidebar("");
                  }
                  return;
                }

                e.preventDefault();
                if (canCompose) props.onSend();
              }}
              @input=${(e: Event) => {
                const el = e.target as HTMLTextAreaElement;
                props.onDraftChange(el.value);
                // Auto-expand
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
              placeholder=${composePlaceholder}
            ></textarea>
          </label>
          <div class="chat-compose__actions">
            <button
              class="btn"
              title="Open Snippet Editor"
              aria-label="Snippet Editor"
              @click=${() => {
                if (props.onOpenSidebar) {
                  props.onDraftChange(""); // Clear any drafted ticks
                  props.onOpenSidebar(""); 
                }
              }}
            >
              ${icons.code}
            </button>
            <button
              class="btn"
              ?disabled=${!props.connected || (!canAbort && props.sending)}
              @click=${canAbort ? props.onAbort : props.onNewSession}
            >
              ${canAbort ? "Stop" : "New session"}
            </button>
            <button
              class="btn primary"
              ?disabled=${!props.connected}
              @click=${props.onSend}
            >
              ${isBusy ? "Queue" : "Send"}<kbd class="btn-kbd">↵</kbd>
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) result.push(currentGroup);
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) result.push(currentGroup);
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);

    if (!props.showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  if (props.showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) return `tool:${toolCallId}`;
  const id = typeof m.id === "string" ? m.id : "";
  if (id) return `msg:${id}`;
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) return `msg:${messageId}`;
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) return `msg:${role}:${timestamp}:${index}`;
  return `msg:${role}:${index}`;
}

import { loadConfig } from "../config/config.js";
import { resolveSessionAgentId } from "../agents/agent-scope.js";
import { resolveEffectiveMessagesConfig, resolveIdentityName } from "../agents/identity.js";
import { dispatchInboundMessage } from "../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../auto-reply/reply/reply-dispatcher.js";
import { extractShortModelName, type ResponsePrefixContext } from "../auto-reply/reply/response-prefix-template.js";
import type { MsgContext } from "../auto-reply/templating.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../utils/message-channel.js";
import { loadSessionEntry } from "./session-utils.js";
import { formatForLog } from "./ws-log.js";
import type { createSubsystemLogger } from "../logging/subsystem.js";

export class WatchdogService {
  private static timeouts = new Map<string, NodeJS.Timeout>();
  private static logger: ReturnType<typeof createSubsystemLogger> | null = null;

  static setLogger(logger: ReturnType<typeof createSubsystemLogger>) {
    this.logger = logger;
  }

  static scheduleCheck(sessionKey: string) {
    this.cancelCheck(sessionKey);

    const config = loadConfig();
    if (!config?.notifications?.enabled) return;

    const delayMs = (config.notifications.idle_threshold_seconds || 120) * 1000;

    const timer = setTimeout(() => {
      void this.trigger(sessionKey);
    }, delayMs);

    this.timeouts.set(sessionKey, timer);
  }

  static cancelCheck(sessionKey: string) {
    const timer = this.timeouts.get(sessionKey);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(sessionKey);
    }
  }

  private static async trigger(sessionKey: string) {
    this.timeouts.delete(sessionKey);

    const config = loadConfig();
    if (!config?.notifications?.enabled) return;

    const prompt = `System Event: User Idle Check.
The user has not replied for ${config.notifications.idle_threshold_seconds} seconds.
Review the last few messages. Did you just finish a significant task?
If yes, notify them via ${config.notifications.preferred_method} at ${config.notifications.contact_info}.
If no, or if they have already acked, do nothing.`;

    const { cfg, entry } = loadSessionEntry(sessionKey);
    // Use the session ID if available, or just a timestamp-based ID for this internal run
    const clientRunId = `watchdog-${Date.now()}`;
    
    // Minimal Mock Context
    const ctx: MsgContext = {
      Body: prompt,
      BodyForAgent: prompt,
      BodyForCommands: prompt,
      RawBody: prompt,
      CommandBody: prompt,
      SessionKey: sessionKey,
      Provider: INTERNAL_MESSAGE_CHANNEL,
      Surface: INTERNAL_MESSAGE_CHANNEL,
      OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
      ChatType: "direct",
      CommandAuthorized: true,
      MessageSid: clientRunId,
      SenderId: "system-watchdog",
      SenderName: "System Watchdog",
      SenderUsername: "watchdog",
    };

    const agentId = resolveSessionAgentId({ sessionKey, config: cfg });
    let prefixContext: ResponsePrefixContext = {
      identityName: resolveIdentityName(cfg, agentId),
    };

    const dispatcher = createReplyDispatcher({
      responsePrefix: resolveEffectiveMessagesConfig(cfg, agentId).responsePrefix,
      responsePrefixContextProvider: () => prefixContext,
      onError: (err) => {
        this.logger?.warn(`watchdog dispatch failed: ${formatForLog(err)}`);
      },
      deliver: async (payload, info) => {
        // We suppress the final delivery to avoid triggering any side effects
        // The agent will use its tools (message.send) to notify.
      },
    });

    const abortController = new AbortController();
    
    try {
      await dispatchInboundMessage({
        ctx,
        cfg,
        dispatcher,
        skipTranscriptAppend: true, // Tell system to not log this input
        replyOptions: {
          runId: clientRunId,
          abortSignal: abortController.signal,
          disableBlockStreaming: true, // Don't block other things
          onModelSelected: (ctx) => {
            prefixContext.provider = ctx.provider;
            prefixContext.model = extractShortModelName(ctx.model);
            prefixContext.modelFull = `${ctx.provider}/${ctx.model}`;
            prefixContext.thinkingLevel = ctx.thinkLevel ?? "off";
          },
        },
      });
    } catch (err) {
      this.logger?.error(`Watchdog trigger failed: ${formatForLog(err)}`);
    }
  }
}

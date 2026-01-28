/**
 * Gateway RPC handlers for consciousness system.
 * Provides methods to get state, toggle, and subscribe to consciousness events.
 */
import type { GatewayRequestHandlers } from "./types.js";

export const consciousnessHandlers: GatewayRequestHandlers = {
  "consciousness.state": async ({ respond, context }) => {
    const { consciousnessService } = context;
    if (!consciousnessService) {
      respond(true, {
        enabled: false,
        lastHeartbeat: null,
        timeline: [],
        activeTasks: [],
        pendingReminders: [],
      });
      return;
    }
    const state = consciousnessService.getState();
    respond(true, {
      enabled: state.enabled,
      lastHeartbeat: state.lastHeartbeat,
      timeline: state.entries.slice(-100), // Last 100 events, named timeline for UI
      activeTasks: state.activeTasks,
      pendingReminders: state.pendingReminders,
    });
  },

  "consciousness.toggle": async ({ respond, context, params }) => {
    const { consciousnessService } = context;
    if (!consciousnessService) {
      respond(true, { enabled: false });
      return;
    }
    const enabled = params?.enabled;
    if (typeof enabled !== "boolean") {
      respond(true, { enabled: consciousnessService.isEnabled() });
      return;
    }
    if (enabled) {
      consciousnessService.start();
    } else {
      consciousnessService.stop();
    }
    respond(true, { enabled: consciousnessService.isEnabled() });
  },

  "consciousness.subscribe": async ({ respond, context, client }) => {
    const { consciousnessService, broadcast } = context;
    if (!consciousnessService) {
      respond(true, { subscribed: false });
      return;
    }
    // The subscription pattern is already handled by the event log's subscriber mechanism
    // Just confirm subscription is active
    respond(true, { subscribed: true });
  },

  /**
   * Test endpoint: Schedule a reminder to fire after a delay.
   * Useful for testing the consciousness system.
   * @param delay - Delay in seconds (default: 10)
   * @param context - Reminder context message
   */
  "consciousness.test.reminder": async ({ respond, context, params }) => {
    const { consciousnessService } = context;
    if (!consciousnessService) {
      respond(false, undefined, {
        code: "UNAVAILABLE",
        message: "Consciousness service not available",
      });
      return;
    }
    const delaySec = typeof params?.delay === "number" ? params.delay : 10;
    const reminderContext =
      typeof params?.context === "string"
        ? params.context
        : "Test reminder from UI";

    const reminder = consciousnessService.scheduleReminder({
      context: reminderContext,
      delay: (delaySec * 1000) as any, // Convert to ms
    });

    respond(true, {
      id: reminder.id,
      dueAt: reminder.dueAt,
      message: `Reminder scheduled to fire in ${delaySec} seconds`,
    });
  },
};

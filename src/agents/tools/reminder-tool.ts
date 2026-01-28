/**
 * Reminder Tool
 *
 * Allows the agent to schedule reminders via the consciousness system.
 * The reminder will fire after the specified delay and trigger a REMINDER_DUE event.
 */
import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

const REMINDER_ACTIONS = ["set", "list", "cancel"] as const;

const ReminderToolSchema = Type.Object({
  action: Type.Union(REMINDER_ACTIONS.map((a) => Type.Literal(a))),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  // For "set" action
  context: Type.Optional(
    Type.String({
      description: "What this reminder is about (will be shown when it fires)",
    }),
  ),
  delay: Type.Optional(
    Type.Union([
      Type.String({
        description: "Human-readable delay like '5 minutes', '1 hour', '30s'",
      }),
      Type.Number({ description: "Delay in milliseconds" }),
    ]),
  ),
  // For "cancel" action
  id: Type.Optional(Type.String({ description: "Reminder ID to cancel" })),
});

type ReminderToolOptions = {
  agentSessionKey?: string;
};

export function createReminderTool(opts?: ReminderToolOptions): AnyAgentTool {
  return {
    label: "Reminder",
    name: "reminder",
    description: `Schedule, list, or cancel reminders for yourself.

ACTIONS:
- set: Schedule a new reminder (requires context and delay)
- list: List pending reminders
- cancel: Cancel a reminder (requires id)

DELAY FORMATS:
- String: "5 minutes", "1 hour", "30 seconds", "2h", "30m", "15s"
- Number: delay in milliseconds (e.g., 300000 for 5 minutes)

EXAMPLES:
- Schedule: { "action": "set", "context": "Check on the build status", "delay": "5 minutes" }
- List: { "action": "list" }
- Cancel: { "action": "cancel", "id": "<reminder-id>" }

USE CASES:
- Following up on long-running tasks
- Checking back on deployments
- Reminding yourself about pending work
- Scheduling delayed checks (e.g., "wait 5 min then check logs")`,
    parameters: ReminderToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts: GatewayCallOptions = {
        gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
        gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
        timeoutMs:
          typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
      };

      switch (action) {
        case "set": {
          const context = readStringParam(params, "context", {
            required: true,
          });
          const delay = params.delay;
          if (delay === undefined || delay === null) {
            throw new Error("delay is required for set action");
          }
          // Convert string delay to ms if needed
          let delayMs: number;
          if (typeof delay === "number") {
            delayMs = delay;
          } else if (typeof delay === "string") {
            delayMs = parseDelayString(delay);
          } else {
            throw new Error("delay must be a string or number");
          }
          return jsonResult(
            await callGatewayTool("consciousness.test.reminder", gatewayOpts, {
              context,
              delay: Math.ceil(delayMs / 1000), // Gateway expects seconds
            }),
          );
        }
        case "list": {
          const state = await callGatewayTool(
            "consciousness.state",
            gatewayOpts,
            {},
          );
          const pending =
            (state as { pendingReminders?: unknown[] })?.pendingReminders ?? [];
          return jsonResult({
            count: pending.length,
            reminders: pending,
          });
        }
        case "cancel": {
          const id = readStringParam(params, "id", { required: true });
          // Note: Cancel support would need to be added to the consciousness service
          // For now, return a not-supported message
          return jsonResult({
            success: false,
            message: `Reminder cancellation not yet implemented. ID: ${id}`,
          });
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}

/**
 * Parse a human-readable delay string into milliseconds.
 * Supports: "5 minutes", "1 hour", "30 seconds", "2h", "30m", "15s"
 */
function parseDelayString(input: string): number {
  const normalized = input.trim().toLowerCase();

  // Match patterns like "5 minutes", "1 hour", "30s", "2h", "30m"
  const match = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?|ms|milliseconds?)?$/,
  );
  if (!match) {
    throw new Error(
      `Invalid delay format: "${input}". Use formats like "5 minutes", "1 hour", "30s", or a number in ms.`,
    );
  }

  const value = parseFloat(match[1]);
  const unit = match[2] ?? "ms";

  switch (unit) {
    case "h":
    case "hr":
    case "hrs":
    case "hour":
    case "hours":
      return value * 60 * 60 * 1000;
    case "m":
    case "min":
    case "mins":
    case "minute":
    case "minutes":
      return value * 60 * 1000;
    case "s":
    case "sec":
    case "secs":
    case "second":
    case "seconds":
      return value * 1000;
    case "ms":
    case "millisecond":
    case "milliseconds":
      return value;
    default:
      return value; // Assume ms if no unit
  }
}

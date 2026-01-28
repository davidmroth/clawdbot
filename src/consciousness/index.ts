/**
 * Consciousness Module
 *
 * Agent consciousness system that enables proactive awareness
 * and agent-driven decision making.
 */

export {
  ConsciousnessService,
  type ConsciousnessServiceDeps,
} from "./consciousness-service.js";
export { EventLog } from "./event-log.js";
export { EventMonitor } from "./event-monitor.js";
export { ReminderScheduler, parseDelayString } from "./reminder-scheduler.js";
export { StimulusProcessor, formatDuration } from "./stimulus-processor.js";
export { TaskMemory, type TaskChangeSubscriber } from "./task-memory.js";
export * from "./types.js";

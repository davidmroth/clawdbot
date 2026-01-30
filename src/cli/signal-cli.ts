
import type { Command } from "commander";
import { signalSetupCommand } from "../commands/signal-setup.js";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "./cli-utils.js";

export function registerSignalCli(program: Command) {
    const signal = program
        .command("signal")
        .description("Signal channel setup and utilities");

    signal
        .command("setup")
        .description("Interactive setup: Install signal-cli, link device (QR), or register number")
        .option("-f, --force", "Force re-install/setup")
        .action(async (opts) => {
             await runCommandWithRuntime(defaultRuntime, async () => {
                 await signalSetupCommand(opts, defaultRuntime);
             });
        });
}

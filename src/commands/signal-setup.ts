import path from "node:path";
import { runExec, runCommandWithTimeout } from "../process/exec.js";
import { type RuntimeEnv } from "../runtime.js";
import { installSignalCli } from "./signal-install.js";
import { detectBinary } from "./onboard-helpers.js";
import { loadConfig, writeConfigFile } from "../config/config.js";
import {
  resolveDefaultSignalAccountId,
  resolveSignalAccount,
} from "../signal/accounts.js";
import {
  getSignalLinkStatus,
  getSignalQrLinkPng,
} from "../signal/signal-link.js";
import qrcode from "qrcode-terminal";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { formatCliCommand } from "../cli/command-format.js";
import { formatDocsLink } from "../terminal/links.js";

type SignalSetupOptions = {
  force?: boolean;
};

export async function signalSetupCommand(
  opts: SignalSetupOptions,
  runtime: RuntimeEnv,
) {
  const prompter = createClackPrompter();
  const cfg = await loadConfig();

  // 1. Detection
  const configuredCliPath = cfg.channels?.signal?.cliPath ?? "signal-cli";
  let cliDetected = await detectBinary(configuredCliPath);
  let cliPath = configuredCliPath;

  runtime.log("Checking Signal setup...");

  if (!cliDetected) {
    runtime.log(`signal-cli not found at: ${configuredCliPath}`);

    // Check for REST API mode
    const httpUrl = cfg.channels?.signal?.httpUrl?.trim();
    if (httpUrl) {
      runtime.log(`REST API mode detected (httpUrl: ${httpUrl})`);
      await handleRestApiLinkFlow(runtime, httpUrl, prompter, cfg);
      return;
    }

    const confirmInstall = await prompter.confirm({
      message: "Do you want to install signal-cli natively?",
      initialValue: true,
    });

    if (confirmInstall) {
      const result = await installSignalCli(runtime);
      if (!result.ok) {
        runtime.error(`Failed to install signal-cli: ${result.error}`);
        return;
      }
      if (result.cliPath) {
        cliPath = result.cliPath;
        cliDetected = true;
        runtime.log(`Installed signal-cli to ${cliPath}`);
      }
    } else {
      runtime.log("Checking if you are using Docker/REST API configuration...");
      if (cfg.channels?.signal?.httpUrl || cfg.channels?.signal?.httpHost) {
        runtime.log(
          "REST API configuration detected. Please use 'clawdbot doctor' to verify connections.",
        );
        return;
      }
      runtime.error(
        "Cannot proceed without signal-cli. Please install it or configure 'channels.signal.cliPath'.",
      );
      return;
    }
  }

  // 2. Mode Selection
  const mode = await prompter.select({
    message: "How would you like to set up Signal?",
    options: [
      {
        label: "Link to existing account (Primary/Linked Device) [Recommended]",
        value: "link",
      },
      { label: "Register a new number (SMS/Voice)", value: "register" },
    ],
  });

  if (mode === "link") {
    await handleLinkFlow(runtime, cliPath, prompter, cfg);
  } else {
    await handleRegisterFlow(runtime, cliPath, prompter, cfg);
  }
}

async function handleLinkFlow(
  runtime: RuntimeEnv,
  cliPath: string,
  prompter: any,
  cfg: any,
) {
  runtime.log("\n--- Link Device ---");
  runtime.log(
    "This will generate a QR code. Open Signal on your phone, go to Settings > Linked Devices > + (Add), and scan it.",
  );

  // We haven't implemented automatic linking wrapper yet
  // For now, we spawn interactive process or instruct user
  // Since signal-cli link -n "Clawdbot" outputs a QR code text (tsdevice:/...)
  // We can capture it.

  // Using a promise wrapper around spawn logic to capture the specific line
  const { spawn } = await import("node:child_process");

  // We'll use a unique name or specific one
  const deviceName = "Clawdbot";

  runtime.log(`Running: ${cliPath} link -n "${deviceName}"`);

  // We can't use runCommandWithTimeout easily because we need to parse stdout LIVE or at least capture it while it waits?
  // signal-cli link prints URI and then BLOCKS waiting for connection (in modern versions).
  // Or it prints URI and exits?
  // Let's assume it prints and blocks. We need to parse the URI, print QR, then wait.

  // Note: in older signal-cli versions, you had to run `signal-cli link` to get URI, then `signal-cli addDevice --uri ...`.
  // But modern `signal-cli link` does the waiting.

  return new Promise<void>((resolve, reject) => {
    const child = spawn(cliPath, ["link", "-n", deviceName], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let uriFound = false;

    child.stdout.on("data", (data) => {
      const text = data.toString();
      console.log(text); // print raw output too so user sees what's happening
      const match = text.match(/tsdevice:\/\/\S+/);
      if (match && !uriFound) {
        uriFound = true;
        const uri = match[0];
        runtime.log("\n" + "=".repeat(30));
        runtime.log("Scan this QR code with Signal:");
        qrcode.generate(uri, { small: true });
        runtime.log("=".repeat(30) + "\n");
        runtime.log("Waiting for device to be linked...");
      }
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      // signal-cli often prints logs to stderr
      if (text.includes("associated with:")) {
        // Success message usually looks like "Associated with: +1555..."
        runtime.log(text);
      } else {
        // debug log
      }
    });

    child.on("close", async (code) => {
      if (code === 0) {
        runtime.log("Link successful!");
        // Now we need to know WHICH number was linked so we can update config.
        // We can run `signal-cli listAccounts`.
        await updateConfigWithAccount(runtime, cliPath, cfg);
        resolve();
      } else {
        runtime.error(`Link process exited with code ${code}`);
        resolve(); // resolve anyway to avoid crashing CLI, let user retry
      }
    });

    child.on("error", (err) => {
      runtime.error(`Failed to start signal-cli: ${err.message}`);
      resolve();
    });
  });
}

async function handleRegisterFlow(
  runtime: RuntimeEnv,
  cliPath: string,
  prompter: any,
  cfg: any,
) {
  runtime.log("\n--- Register Number ---");

  const number = await prompter.text({
    message: "Enter the number to register (E.164 format, e.g. +15550001111)",
    validate: (val: string) =>
      val.startsWith("+") && val.length > 8 ? undefined : "Invalid format",
  });

  if (!number || typeof number !== "string") return;

  const useVoice = await prompter.confirm({
    message: "Do you want to receive the code via Voice call? (No = SMS)",
    initialValue: false,
  });

  const registerArgs = ["-u", number, "register"];
  if (useVoice) registerArgs.push("--voice");

  runtime.log(
    `Requesting verification code... (${cliPath} ${registerArgs.join(" ")})`,
  );

  try {
    await runCommandWithTimeout([cliPath, ...registerArgs], {
      timeoutMs: 30000,
    });
    runtime.log("Code requested.");
  } catch (err: any) {
    // If it fails (e.g. CAPTCHA required), show error
    runtime.error(`Registration request failed: ${err.stdout || err.message}`);
    if (String(err.stdout).includes("captcha")) {
      runtime.log(
        "CAPTCHA required. Please run the command manually with a captcha token.",
      );
      runtime.log(
        `Command: ${cliPath} -u ${number} register --captcha <TOKEN>`,
      );
      return;
    }
  }

  const code = await prompter.text({
    message: "Enter the verification code (XXX-XXX)",
    validate: (val: string) => (val.length >= 3 ? undefined : "Required"),
  });

  if (!code || typeof code !== "string") return;

  const verifyArgs = ["-u", number, "verify", code.replace("-", "")];

  try {
    await runCommandWithTimeout([cliPath, ...verifyArgs], { timeoutMs: 30000 });
    runtime.log("Verification successful!");
    await configureAccount(runtime, cfg, number, cliPath);
  } catch (err: any) {
    runtime.error(`Verification failed: ${err.stdout || err.message}`);
  }
}

async function updateConfigWithAccount(
  runtime: RuntimeEnv,
  cliPath: string,
  cfg: any,
) {
  // List accounts to find the one we just linked
  try {
    const { stdout } = await runCommandWithTimeout([cliPath, "listAccounts"], {
      timeoutMs: 10000,
    });
    // Output is usually one number per line
    const accounts = stdout
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("+"));

    if (accounts.length === 0) {
      runtime.error("No accounts found after linking.");
      return;
    }

    let account = accounts[0];
    if (accounts.length > 1) {
      // If multiple, ask which one
      const prompter = createClackPrompter();
      account = await prompter.select({
        message: "Which account did you just link?",
        options: accounts.map((a) => ({ label: a, value: a })),
      });
    }

    await configureAccount(runtime, cfg, account, cliPath);
  } catch (err) {
    runtime.error("Failed to list accounts.");
  }
}

async function configureAccount(
  runtime: RuntimeEnv,
  cfg: any,
  account: string,
  cliPath: string,
) {
  const prompter = createClackPrompter();

  // Update config
  const next = { ...cfg };
  if (!next.channels) next.channels = {};
  if (!next.channels.signal) next.channels.signal = {};

  next.channels.signal.account = account;
  next.channels.signal.enabled = true;
  next.channels.signal.cliPath = cliPath;

  await writeConfigFile(next); // This saves to disk
  runtime.log(`Configuration updated for account ${account}.`);

  // AllowFrom Setup
  const allowFromConfirm = await prompter.confirm({
    message:
      "Do you want to allow messages from your personal number? (Recommended for security)",
    initialValue: true,
  });

  if (allowFromConfirm) {
    const allowFrom = await prompter.text({
      message: "Enter your personal number (E.164)",
      validate: (val: string) => (val.startsWith("+") ? undefined : "Required"),
    });

    if (allowFrom && typeof allowFrom === "string") {
      const finalCfg = await loadConfig(); // Reload freshly saved
      if (!finalCfg.channels) finalCfg.channels = {};
      if (!finalCfg.channels.signal) finalCfg.channels.signal = {};
      if (!finalCfg.channels.signal.allowFrom)
        finalCfg.channels.signal.allowFrom = [];
      if (!finalCfg.channels.signal.allowFrom.includes(allowFrom)) {
        finalCfg.channels.signal.allowFrom.push(allowFrom);
        await writeConfigFile(finalCfg);
        runtime.log(`Added ${allowFrom} to allowFrom list.`);
      }
    }
  }

  runtime.log("Setup complete!");
  runtime.log(
    `Try running: clawdbot gateway call channels.status --params '{"probe":true}'`,
  );
}

async function handleRestApiLinkFlow(
  runtime: RuntimeEnv,
  baseUrl: string,
  prompter: any,
  cfg: any,
) {
  runtime.log("\n--- Link Device via REST API ---");
  runtime.log(
    "This will generate a QR code. Open Signal on your phone, go to Settings > Linked Devices > + (Add), and scan it.",
  );

  const deviceName = await prompter.text({
    message: "Enter device name (shown in Signal's linked devices list)",
    initialValue: "Clawdbot",
    validate: (val: string) =>
      val.trim().length > 0 ? undefined : "Device name required",
  });

  if (!deviceName || typeof deviceName !== "string") return;

  runtime.log(`\nFetching QR code from ${baseUrl}...`);

  try {
    // Get QR code PNG from REST API
    const pngBuffer = await getSignalQrLinkPng(baseUrl, deviceName.trim());

    // Convert PNG to base64 data URL for qrcode-terminal
    // Note: qrcode-terminal expects a text string (like tsdevice://...), not an image
    // For REST API linking, the signal-cli-rest-api returns a PNG directly that should be displayed
    // We'll save the QR code to a file and show instructions

    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");

    const qrPath = path.join(os.tmpdir(), "clawdbot-signal-qr.png");
    await fs.writeFile(qrPath, pngBuffer);

    runtime.log("\n" + "=".repeat(40));
    runtime.log("QR code saved to: " + qrPath);
    runtime.log("Open this file and scan with Signal mobile.");
    runtime.log("=".repeat(40) + "\n");

    // Attempt to open the QR code image (platform-dependent)
    const { spawn } = await import("node:child_process");
    const openCmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    spawn(openCmd, [qrPath], { detached: true, stdio: "ignore" }).unref();

    runtime.log("Waiting for device to be linked...");
    runtime.log("(Press Ctrl+C to cancel)\n");

    // Poll for link status
    const maxAttempts = 60; // 5 minutes with 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      try {
        const status = await getSignalLinkStatus(baseUrl);
        if (status.linked && status.accounts.length > 0) {
          const account = status.accounts.find((a) => a.uuid !== null);
          if (account) {
            runtime.log(`\n✓ Successfully linked! Account: ${account.number}`);
            await configureRestApiAccount(
              runtime,
              cfg,
              account.number,
              baseUrl,
            );
            return;
          }
        }
        runtime.log(`Checking... (attempt ${i + 1}/${maxAttempts})`);
      } catch (pollErr) {
        // Ignore polling errors, keep trying
      }
    }

    runtime.error("Timeout waiting for link. Please try again.");
  } catch (err: any) {
    runtime.error(`Failed to generate QR code: ${err.message}`);
  }
}

async function configureRestApiAccount(
  runtime: RuntimeEnv,
  cfg: any,
  account: string,
  baseUrl: string,
) {
  const prompter = createClackPrompter();

  // Update config
  const next = { ...cfg };
  if (!next.channels) next.channels = {};
  if (!next.channels.signal) next.channels.signal = {};

  next.channels.signal.account = account;
  next.channels.signal.enabled = true;
  next.channels.signal.httpUrl = baseUrl;

  await writeConfigFile(next);
  runtime.log(`Configuration updated for account ${account} (REST API mode).`);

  // AllowFrom Setup
  const allowFromConfirm = await prompter.confirm({
    message:
      "Do you want to allow messages from your personal number? (Recommended for security)",
    initialValue: true,
  });

  if (allowFromConfirm) {
    const allowFrom = await prompter.text({
      message: "Enter your personal number (E.164)",
      validate: (val: string) => (val.startsWith("+") ? undefined : "Required"),
    });

    if (allowFrom && typeof allowFrom === "string") {
      const finalCfg = await loadConfig();
      if (!finalCfg.channels) finalCfg.channels = {};
      if (!finalCfg.channels.signal) finalCfg.channels.signal = {};
      if (!finalCfg.channels.signal.allowFrom)
        finalCfg.channels.signal.allowFrom = [];

      if (!finalCfg.channels.signal.allowFrom.includes(allowFrom)) {
        finalCfg.channels.signal.allowFrom.push(allowFrom);
        await writeConfigFile(finalCfg);
        runtime.log(`Added ${allowFrom} to allowFrom list.`);
      }
    }
  }

  runtime.log("\nSetup complete!");
  runtime.log("Restart the gateway to connect: docker restart gateway");
  runtime.log(
    `Or run: clawdbot gateway call channels.status --params '{"probe":true}'`,
  );
}

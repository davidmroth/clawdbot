---
name: build & troubleshoot
description: Diagnose issues, check logs, rebuild code, and restart the system. Use when encountering errors, verifying fixes, or applying code changes.
---

# Build & Troubleshooting Skill

Central toolkit for maintaining and repairing the Clawdbot instance.

## 1. Logs

Check system logs to diagnose errors.

**Read full log:**
Use the path returned by the script with the `read` tool:

```bash
docker compose logs clawdbot-gateway
```

## 2. Build (Compile)

Recompile source code after making changes.

```bash
bash skills/build/scripts/build.sh
```

## 3. Restart (Apply)

Restart the gateway to apply compiled changes or clear state.

```bash
bash skills/build/scripts/restart.sh
```

---
name: troubleshooting
description: Diagnose issues, check logs, rebuild code, and restart the system. Use when encountering errors, verifying fixes, or applying code changes.
---

# Troubleshooting Skill

Central toolkit for maintaining and repairing the Clawdbot instance.

## 1. Logs

Check system logs to diagnose errors.

**List all logs:**
```bash
bash skills/troubleshooting/scripts/logs.sh
```

**Tail latest log:**
```bash
bash skills/troubleshooting/scripts/logs.sh tail
```

**Read full log:**
Use the path returned by the script with the `read` tool:
```bash
read $(bash skills/troubleshooting/scripts/logs.sh path)
```

## 2. Build (Compile)

Recompile source code after making changes to `/app/src`.

```bash
bash skills/troubleshooting/scripts/build.sh
```

## 3. Restart (Apply)

Restart the gateway to apply compiled changes or clear state.

```bash
bash skills/troubleshooting/scripts/restart.sh
```

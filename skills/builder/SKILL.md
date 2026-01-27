---
name: builder
description: Trigger a system rebuild and update. Use when source code in /app/src has been modified and needs to be compiled/applied.
---

# Builder Skill

This skill triggers the internal build service to recompile the Clawdbot source code.

## When to use

- After modifying any TypeScript files in `/app/src`
- When applying patches or bug fixes to the codebase
- If the system behavior doesn't match the code changes (stale build)

## Usage

### 1. Build (Compile)

Run the build script to recompile changes:

```bash
bash skills/builder/scripts/build.sh
```

### 2. Restart (Apply)

Run the restart script to reboot the gateway and load the new code:

```bash
bash skills/builder/scripts/restart.sh
```

The script sends a POST request to `http://clawdbot-build:3000/restart`.

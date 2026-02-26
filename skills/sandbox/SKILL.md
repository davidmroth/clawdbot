---
name: sandbox
description: "Run commands, manage files, automate the browser, and execute code in an isolated sandbox container via REST API. Use for safe code execution, web scraping, file manipulation, or any task that benefits from an isolated environment."
metadata: { "clawdbot": { "emoji": "📦" } }
---

# Sandbox Skill

An isolated Docker sandbox environment providing shell, filesystem, browser automation via REST API.

**Base URL:** `http://sandbox:8080`
**Swagger UI:** `http://sandbox:8080/docs`
**OpenAPI spec:** `http://sandbox:8080/v1/openapi.json`

All responses follow a standard envelope: `{"success": true, "data": {...}}`.

---

## 1. Sandbox Info

```bash
curl -s http://sandbox:8080/v1/sandbox | jq
```

Returns: home directory, hostname, platform, Python version, environment vars.

---

## 2. Shell

### Execute a command

```bash
curl -s -X POST http://sandbox:8080/v1/shell/exec \
  -H 'Content-Type: application/json' \
  -d '{"command": "ls -la /home"}' | jq
```

Parameters:

- `command` (string, **required**) — shell command to run
- `exec_dir` (string) — working directory
- `timeout` (float) — timeout in seconds
- `async_mode` (bool, default: false) — run async, returns session ID
- `id` (string) — reuse an existing shell session by ID

Response fields: `exit_code`, `stdout`, `stderr`, `combined`, `session_id`, `status`

### Async / long-running commands

```bash
# Start async
curl -s -X POST http://sandbox:8080/v1/shell/exec \
  -d '{"command": "sleep 10 && echo done", "async_mode": true}' \
  -H 'Content-Type: application/json' | jq

# View output of a session
curl -s -X POST http://sandbox:8080/v1/shell/view \
  -d '{"id": "<session_id>"}' \
  -H 'Content-Type: application/json' | jq

# Wait for completion
curl -s -X POST http://sandbox:8080/v1/shell/wait \
  -d '{"id": "<session_id>"}' \
  -H 'Content-Type: application/json' | jq

# Write stdin to a running process
curl -s -X POST http://sandbox:8080/v1/shell/write \
  -d '{"id": "<session_id>", "input": "yes\n"}' \
  -H 'Content-Type: application/json' | jq

# Kill a process
curl -s -X POST http://sandbox:8080/v1/shell/kill \
  -d '{"id": "<session_id>"}' \
  -H 'Content-Type: application/json' | jq
```

### Session management

```bash
# List active sessions
curl -s http://sandbox:8080/v1/shell/sessions | jq

# Create a named session
curl -s -X POST http://sandbox:8080/v1/shell/sessions/create \
  -d '{"id": "my-session"}' \
  -H 'Content-Type: application/json' | jq

# Delete a specific session
curl -s -X DELETE http://sandbox:8080/v1/shell/sessions/<session_id> | jq

# Delete ALL sessions
curl -s -X DELETE http://sandbox:8080/v1/shell/sessions | jq
```

---

## 3. File Operations

### Read file

```bash
curl -s -X POST http://sandbox:8080/v1/file/read \
  -d '{"file": "/home/sandbox/.bashrc"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `start_line` (int), `end_line` (int)

### Write file

```bash
curl -s -X POST http://sandbox:8080/v1/file/write \
  -d '{"file": "/home/sandbox/hello.txt", "content": "Hello World"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `encoding` ("utf-8" | "base64"), `append` (bool)

### List directory

```bash
curl -s -X POST http://sandbox:8080/v1/file/list \
  -d '{"path": "/home/sandbox"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `recursive` (bool), `show_hidden` (bool), `max_depth` (int)

### Search in file (regex)

```bash
curl -s -X POST http://sandbox:8080/v1/file/search \
  -d '{"file": "/home/sandbox/app.py", "regex": "def main"}' \
  -H 'Content-Type: application/json' | jq
```

### Find files by glob

```bash
curl -s -X POST http://sandbox:8080/v1/file/find \
  -d '{"path": "/home/sandbox", "glob": "*.py"}' \
  -H 'Content-Type: application/json' | jq
```

### Replace in file

```bash
curl -s -X POST http://sandbox:8080/v1/file/replace \
  -d '{"file": "/home/sandbox/app.py", "old_str": "foo", "new_str": "bar"}' \
  -H 'Content-Type: application/json' | jq
```

### Upload file

```bash
curl -s -X POST http://sandbox:8080/v1/file/upload \
  -F "file=@/local/path/to/file.txt" \
  -F "path=/home/sandbox/file.txt" | jq
```

### Download file

```bash
curl -s http://sandbox:8080/v1/file/download?path=/home/sandbox/file.txt -o file.txt
```

---

## 4. Browser Automation

The sandbox includes a headless Chromium browser controlled via Playwright.

### Get browser info (viewport, current URL)

```bash
curl -s http://sandbox:8080/v1/browser/info | jq
```

### Take screenshot (returns PNG binary)

```bash
curl -s http://sandbox:8080/v1/browser/screenshot -o screenshot.png
```

### Navigate to URL (high-level)

```bash
curl -s -X POST http://sandbox:8080/v1/browser/navigate \
  -d '{"url": "https://example.com"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `wait_until` ("load" | "domcontentloaded" | "networkidle")

### Get page text / HTML

```bash
curl -s http://sandbox:8080/v1/browser/page/text | jq
curl -s http://sandbox:8080/v1/browser/page/html | jq
```

### Execute JavaScript

```bash
curl -s -X POST http://sandbox:8080/v1/browser/page/evaluate \
  -d '{"expression": "document.title"}' \
  -H 'Content-Type: application/json' | jq
```

### Configure browser resolution

```bash
curl -s -X POST http://sandbox:8080/v1/browser/config \
  -d '{"resolution": {"width": 1920, "height": 1080}}' \
  -H 'Content-Type: application/json' | jq
```

### Low-level browser actions

All interactions use `POST /v1/browser/actions` with an `action_type` discriminator:

**Click at coordinates:**

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "CLICK", "x": 200, "y": 300}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `button` ("left" | "right" | "middle"), `num_clicks` (1 | 2 | 3)

**Type text:**

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "TYPING", "text": "hello world"}' \
  -H 'Content-Type: application/json' | jq
```

**Press a key:**

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "PRESS", "key": "Enter"}' \
  -H 'Content-Type: application/json' | jq
```

**Key combination (hotkey):**

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "HOTKEY", "keys": ["Control", "a"]}' \
  -H 'Content-Type: application/json' | jq
```

**Scroll:**

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "SCROLL", "dx": 0, "dy": -500}' \
  -H 'Content-Type: application/json' | jq
```

**Move mouse:**

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "MOVE_TO", "x": 200, "y": 300}' \
  -H 'Content-Type: application/json' | jq
```

**Wait:**

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "WAIT", "duration": 2.0}' \
  -H 'Content-Type: application/json' | jq
```

**All action types:** `MOVE_TO`, `MOVE_REL`, `CLICK`, `MOUSE_DOWN`, `MOUSE_UP`, `RIGHT_CLICK`, `DOUBLE_CLICK`, `DRAG_TO`, `SCROLL`, `TYPING`, `PRESS`, `KEY_DOWN`, `KEY_UP`, `HOTKEY`, `WAIT`

---

## Python CLI Wrapper

For convenience, a Python CLI (`sandbox.py`) is also provided:

```bash
~/.venv/bin/python3 skills/sandbox/sandbox.py <command> [args]
```

**Commands:**

- `info` — show sandbox context
- `exec "<command>"` — run a shell command
- `exec "<command>" --async` — run async, returns session ID
- `read <path>` — read file content
- `write <path> "<content>"` — write file content
- `ls <path>` — list directory
- `upload <local> <remote>` — upload file
- `download <remote>` — download file
- `screenshot [--output file.png]` — take browser screenshot
- `navigate <url>` — navigate browser to URL
- `browser-action <type>` — execute low-level browser action
- `run-code "<code>" [--lang python|javascript]` — execute code via shell

**Examples:**

```bash
# Run a command
~/.venv/bin/python3 skills/sandbox/sandbox.py exec "uname -a"

# Read a file
~/.venv/bin/python3 skills/sandbox/sandbox.py read /home/sandbox/.bashrc

# Write a file
~/.venv/bin/python3 skills/sandbox/sandbox.py write /home/sandbox/test.py "print('hello')"

# List files
~/.venv/bin/python3 skills/sandbox/sandbox.py ls /home/sandbox

# Navigate browser & screenshot
~/.venv/bin/python3 skills/sandbox/sandbox.py navigate https://example.com
~/.venv/bin/python3 skills/sandbox/sandbox.py screenshot --output /tmp/page.png

# Execute code via shell
~/.venv/bin/python3 skills/sandbox/sandbox.py run-code "import sys; print(sys.version)"
```

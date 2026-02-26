---
name: sandbox
description: "Run commands, manage files, automate the browser, and execute code in an isolated AIO Sandbox container via REST API. Use for safe code execution, web scraping, file manipulation, or any task that benefits from an isolated environment."
metadata: { "clawdbot": { "emoji": "📦" } }
---

# Sandbox Skill

An isolated Docker sandbox environment ([AIO Sandbox](https://github.com/agent-infra/sandbox)) providing shell, filesystem, browser automation, and code execution via REST API.

**Base URL:** `http://sandbox:8080`
**OpenAPI spec:** `http://sandbox:8080/v1/openapi.json`

All responses follow a standard envelope: `{"success": true, "data": {...}}`.

---

## 1. Sandbox Info

Get sandbox context (home directory, status):

```bash
curl -s http://sandbox:8080/v1/sandbox | jq
```

List installed Python packages:

```bash
curl -s http://sandbox:8080/v1/sandbox/packages/python | jq
```

List installed Node.js packages:

```bash
curl -s http://sandbox:8080/v1/sandbox/packages/nodejs | jq
```

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
- `timeout` (int) — timeout in seconds
- `async_mode` (bool, default: false) — run async, returns session ID
- `id` (string) — reuse an existing shell session by ID

Response fields: `exit_code`, `stdout`, `stderr`, `combined`

### Async / long-running commands

Run async, then poll output:

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
  -d '{"file": "/home/gem/.bashrc"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `start_line`, `end_line` (int), `sudo` (bool)

### Write file

```bash
curl -s -X POST http://sandbox:8080/v1/file/write \
  -d '{"file": "/home/gem/hello.txt", "content": "Hello World"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `encoding` ("utf-8" | "base64"), `append` (bool), `sudo` (bool)

### List directory

```bash
curl -s -X POST http://sandbox:8080/v1/file/list \
  -d '{"path": "/home/gem"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `recursive` (bool), `show_hidden` (bool), `max_depth` (int)

### Search in file

```bash
curl -s -X POST http://sandbox:8080/v1/file/search \
  -d '{"file": "/home/gem/app.py", "pattern": "def main"}' \
  -H 'Content-Type: application/json' | jq
```

### Find files by name

```bash
curl -s -X POST http://sandbox:8080/v1/file/find \
  -d '{"path": "/home/gem", "pattern": "*.py"}' \
  -H 'Content-Type: application/json' | jq
```

### Grep across files

```bash
curl -s -X POST http://sandbox:8080/v1/file/grep \
  -d '{"path": "/home/gem/project", "pattern": "TODO", "include": ["*.py"]}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `include` (file glob filters), `exclude`, `max_results`, `context_lines`, `case_insensitive`, `fixed_string`

### Glob files

```bash
curl -s -X POST http://sandbox:8080/v1/file/glob \
  -d '{"path": "/home/gem", "pattern": "**/*.js"}' \
  -H 'Content-Type: application/json' | jq
```

### Replace in file

```bash
curl -s -X POST http://sandbox:8080/v1/file/replace \
  -d '{"file": "/home/gem/app.py", "old_text": "foo", "new_text": "bar"}' \
  -H 'Content-Type: application/json' | jq
```

### Upload file

```bash
curl -s -X POST http://sandbox:8080/v1/file/upload \
  -F "file=@/local/path/to/file.txt" \
  -F "path=/home/gem/file.txt" | jq
```

### Download file

```bash
curl -s http://sandbox:8080/v1/file/download?path=/home/gem/file.txt -o file.txt
```

---

## 4. Code Execution

### Python (Jupyter kernel)

```bash
curl -s -X POST http://sandbox:8080/v1/jupyter/execute \
  -d '{"code": "print(2 + 2)"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `session_id` (string, for state persistence), `kernel_name` (default: "python3")

Sessions auto-expire after 30 minutes of inactivity.

### Node.js

```bash
curl -s -X POST http://sandbox:8080/v1/nodejs/execute \
  -d '{"code": "console.log(2 + 2)"}' \
  -H 'Content-Type: application/json' | jq
```

Optional: `stateful` (bool — persist REPL state), `session_id`, `timeout`, `node_version` ("node20", "node22", "node24")

### Unified code execution

```bash
curl -s -X POST http://sandbox:8080/v1/code/execute \
  -d '{"code": "print(1+1)", "language": "python"}' \
  -H 'Content-Type: application/json' | jq
```

---

## 5. Browser Automation

### Get browser info (CDP URL, viewport)

```bash
curl -s http://sandbox:8080/v1/browser/info | jq
```

### Take screenshot (returns PNG binary)

```bash
curl -s http://sandbox:8080/v1/browser/screenshot -o screenshot.png
```

### Navigate to URL

```bash
curl -s -X POST http://sandbox:8080/v1/browser/page/navigate \
  -d '{"url": "https://example.com"}' \
  -H 'Content-Type: application/json' | jq
```

### Get page text / HTML

```bash
curl -s http://sandbox:8080/v1/browser/page/text | jq
curl -s http://sandbox:8080/v1/browser/page/html | jq
```

### List interactive elements

```bash
curl -s http://sandbox:8080/v1/browser/page/elements | jq
```

### Click element

```bash
# By CSS selector
curl -s -X POST http://sandbox:8080/v1/browser/page/click \
  -d '{"selector": "#submit-btn"}' \
  -H 'Content-Type: application/json' | jq

# By element index (from /elements)
curl -s -X POST http://sandbox:8080/v1/browser/page/click \
  -d '{"index": 3}' \
  -H 'Content-Type: application/json' | jq

# By coordinates
curl -s -X POST http://sandbox:8080/v1/browser/page/click \
  -d '{"x": 200, "y": 300}' \
  -H 'Content-Type: application/json' | jq
```

### Fill input field

```bash
curl -s -X POST http://sandbox:8080/v1/browser/page/fill \
  -d '{"selector": "#search", "text": "hello world"}' \
  -H 'Content-Type: application/json' | jq
```

### Type text (with keystroke delay)

```bash
curl -s -X POST http://sandbox:8080/v1/browser/page/type \
  -d '{"text": "hello", "delay": 50}' \
  -H 'Content-Type: application/json' | jq
```

### Press key / hotkey

```bash
curl -s -X POST http://sandbox:8080/v1/browser/page/press_key \
  -d '{"key": "Enter"}' \
  -H 'Content-Type: application/json' | jq

curl -s -X POST http://sandbox:8080/v1/browser/page/hot_key \
  -d '{"keys": ["Control", "a"]}' \
  -H 'Content-Type: application/json' | jq
```

### Scroll

```bash
curl -s -X POST http://sandbox:8080/v1/browser/page/scroll \
  -d '{"direction": "down", "amount": 500}' \
  -H 'Content-Type: application/json' | jq
```

### Execute JavaScript

```bash
curl -s -X POST http://sandbox:8080/v1/browser/page/evaluate \
  -d '{"expression": "document.title"}' \
  -H 'Content-Type: application/json' | jq
```

### Unified browser action (low-level)

```bash
curl -s -X POST http://sandbox:8080/v1/browser/actions \
  -d '{"action_type": "CLICK", "x": 100, "y": 200}' \
  -H 'Content-Type: application/json' | jq
```

Action types: `MOVE_TO`, `MOVE_REL`, `CLICK`, `MOUSE_DOWN`, `MOUSE_UP`, `RIGHT_CLICK`, `DOUBLE_CLICK`, `DRAG_TO`, `DRAG_REL`, `SCROLL`, `TYPING`, `PRESS`, `KEY_DOWN`, `KEY_UP`, `HOTKEY`, `WAIT`

### Other browser endpoints

- `POST /v1/browser/page/back` — go back
- `POST /v1/browser/page/forward` — go forward
- `POST /v1/browser/page/reload` — reload
- `POST /v1/browser/page/hover` — hover (selector or x,y)
- `POST /v1/browser/page/select_option` — select dropdown option
- `POST /v1/browser/page/check` / `uncheck` — checkboxes
- `POST /v1/browser/page/upload_file` — upload files to file input
- `POST /v1/browser/page/fill_form` — batch fill multiple fields
- `POST /v1/browser/page/scroll_to` — scroll to absolute position
- `POST /v1/browser/captcha/wait` — wait for captcha resolution

---

## 6. MCP (Model Context Protocol)

```bash
# List available MCP servers
curl -s http://sandbox:8080/v1/mcp/servers | jq

# List tools for a server
curl -s http://sandbox:8080/v1/mcp/browser/tools | jq

# Execute an MCP tool
curl -s -X POST http://sandbox:8080/v1/mcp/browser/tools/navigate \
  -d '{"url": "https://example.com"}' \
  -H 'Content-Type: application/json' | jq
```

---

## 7. Utilities

### Convert URI to markdown

```bash
curl -s -X POST http://sandbox:8080/v1/util/convert_to_markdown \
  -d '{"uri": "https://example.com"}' \
  -H 'Content-Type: application/json' | jq
```

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
- `screenshot [--output file.png]` — take browser screenshot
- `navigate <url>` — navigate browser
- `run-code "<code>" [--lang python|javascript]` — execute code

**Examples:**

```bash
# Run a command
~/.venv/bin/python3 skills/sandbox/sandbox.py exec "uname -a"

# Read a file
~/.venv/bin/python3 skills/sandbox/sandbox.py read /home/gem/.bashrc

# Write a file
~/.venv/bin/python3 skills/sandbox/sandbox.py write /home/gem/test.py "print('hello')"

# List files
~/.venv/bin/python3 skills/sandbox/sandbox.py ls /home/gem

# Execute Python code
~/.venv/bin/python3 skills/sandbox/sandbox.py run-code "import sys; print(sys.version)"

# Take a screenshot
~/.venv/bin/python3 skills/sandbox/sandbox.py screenshot --output /tmp/page.png

# Navigate browser
~/.venv/bin/python3 skills/sandbox/sandbox.py navigate https://example.com
```

#!/usr/bin/env python3
"""
Clawdbot Sandbox CLI — Python wrapper around the custom sandbox REST API.

Usage:
    sandbox.py info
    sandbox.py exec "<command>" [--async] [--dir <dir>] [--timeout <sec>]
    sandbox.py read <path> [--start <line>] [--end <line>]
    sandbox.py write <path> "<content>" [--append]
    sandbox.py ls <path> [--recursive] [--hidden]
    sandbox.py upload <local_path> <remote_path>
    sandbox.py download <remote_path> [--output <local_path>]
    sandbox.py screenshot [--output <file>]
    sandbox.py navigate <url> [--wait-until load|domcontentloaded|networkidle]
    sandbox.py browser-action <action_type> [--x <n>] [--y <n>] [--text <str>]
    sandbox.py page-text
    sandbox.py page-html
    sandbox.py evaluate "<expression>"
    sandbox.py run-code "<code>" [--lang python|javascript]
"""

import argparse
import json
import os
import sys

import requests

BASE_URL = os.environ.get("SANDBOX_BASE_URL", "http://sandbox:8080")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _url(path: str) -> str:
    return f"{BASE_URL}{path}"


def _post(path: str, payload: dict) -> dict:
    resp = requests.post(_url(path), json=payload, timeout=300)
    resp.raise_for_status()
    return resp.json()


def _get_json(path: str, **params) -> dict:
    resp = requests.get(_url(path), params=params, timeout=300)
    resp.raise_for_status()
    return resp.json()


def _print_json(data):
    print(json.dumps(data, indent=2, ensure_ascii=False))


def _exit_on_error(resp: dict):
    if not resp.get("success", True):
        print(json.dumps(resp, indent=2), file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_info(_args):
    """Show sandbox context."""
    _print_json(_get_json("/v1/sandbox"))


def cmd_exec(args):
    """Execute a shell command."""
    payload = {"command": args.shell_command}
    if args.exec_dir:
        payload["exec_dir"] = args.exec_dir
    if args.timeout:
        payload["timeout"] = args.timeout
    if args.run_async:
        payload["async_mode"] = True

    data = _post("/v1/shell/exec", payload)
    _exit_on_error(data)
    result = data.get("data", data)

    if args.run_async:
        _print_json(data)
        return

    combined = result.get("combined") or result.get("stdout", "")
    if combined:
        print(combined, end="")
    stderr = result.get("stderr", "")
    if stderr and stderr != combined:
        print(stderr, end="", file=sys.stderr)

    exit_code = result.get("exit_code", 0)
    if exit_code != 0:
        sys.exit(exit_code)


def cmd_read(args):
    """Read a file."""
    payload = {"file": args.path}
    if args.start is not None:
        payload["start_line"] = args.start
    if args.end is not None:
        payload["end_line"] = args.end

    data = _post("/v1/file/read", payload)
    _exit_on_error(data)
    print(data.get("data", {}).get("content", ""), end="")


def cmd_write(args):
    """Write content to a file."""
    payload = {"file": args.path, "content": args.content}
    if args.append:
        payload["append"] = True

    data = _post("/v1/file/write", payload)
    _exit_on_error(data)
    print(f"Written to {args.path}")


def cmd_ls(args):
    """List directory contents."""
    payload = {"path": args.path}
    if args.recursive:
        payload["recursive"] = True
    if args.hidden:
        payload["show_hidden"] = True

    data = _post("/v1/file/list", payload)
    _exit_on_error(data)
    _print_json(data)


def cmd_upload(args):
    """Upload a local file to the sandbox."""
    with open(args.local_path, "rb") as f:
        resp = requests.post(
            _url("/v1/file/upload"),
            files={"file": (os.path.basename(args.local_path), f)},
            data={"path": args.remote_path},
            timeout=300,
        )
    resp.raise_for_status()
    _print_json(resp.json())


def cmd_download(args):
    """Download a file from the sandbox."""
    resp = requests.get(
        _url("/v1/file/download"),
        params={"path": args.remote_path},
        stream=True,
        timeout=300,
    )
    resp.raise_for_status()
    output = args.output or os.path.basename(args.remote_path)
    with open(output, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"Downloaded to {output}")


def cmd_screenshot(args):
    """Take a browser screenshot."""
    resp = requests.get(_url("/v1/browser/screenshot"), stream=True, timeout=60)
    resp.raise_for_status()
    output = args.output or "/tmp/sandbox_screenshot.png"
    with open(output, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"Screenshot saved to {output}")


def cmd_navigate(args):
    """Navigate the browser to a URL."""
    payload = {"url": args.url}
    if args.wait_until:
        payload["wait_until"] = args.wait_until
    data = _post("/v1/browser/navigate", payload)
    _exit_on_error(data)
    print(f"Navigated to {data.get('data', {}).get('url', args.url)}")


def cmd_browser_action(args):
    """Execute a low-level browser action."""
    payload = {"action_type": args.action_type}
    if args.x is not None:
        payload["x"] = args.x
    if args.y is not None:
        payload["y"] = args.y
    if args.text:
        payload["text"] = args.text
    if args.key:
        payload["key"] = args.key
    if args.keys:
        payload["keys"] = args.keys.split(",")
    if args.dx is not None:
        payload["dx"] = args.dx
    if args.dy is not None:
        payload["dy"] = args.dy
    if args.duration is not None:
        payload["duration"] = args.duration

    data = _post("/v1/browser/actions", payload)
    _exit_on_error(data)
    _print_json(data)


def cmd_page_text(_args):
    """Get page text content."""
    data = _get_json("/v1/browser/page/text")
    _exit_on_error(data)
    print(data.get("data", {}).get("text", ""))


def cmd_page_html(_args):
    """Get page HTML."""
    data = _get_json("/v1/browser/page/html")
    _exit_on_error(data)
    print(data.get("data", {}).get("html", ""))


def cmd_evaluate(args):
    """Evaluate JavaScript in the browser."""
    data = _post("/v1/browser/page/evaluate", {"expression": args.expression})
    _exit_on_error(data)
    print(data.get("data", {}).get("result", ""))


def cmd_run_code(args):
    """Execute code via a shell command."""
    lang = args.lang or "python"
    if lang == "python":
        shell_cmd = f'python3 -c {json.dumps(args.code)}'
    elif lang == "javascript":
        shell_cmd = f'node -e {json.dumps(args.code)}'
    else:
        print(f"Unsupported language: {lang}", file=sys.stderr)
        sys.exit(1)

    data = _post("/v1/shell/exec", {"command": shell_cmd})
    _exit_on_error(data)
    result = data.get("data", data)
    combined = result.get("combined") or result.get("stdout", "")
    if combined:
        print(combined, end="")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Clawdbot Sandbox CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="subcommand", help="Available commands")

    # info
    sub.add_parser("info", help="Show sandbox context")

    # exec
    p_exec = sub.add_parser("exec", help="Run a shell command")
    p_exec.add_argument("shell_command", metavar="command",
                        help="Shell command to run")
    p_exec.add_argument("--async", dest="run_async", action="store_true",
                        help="Run asynchronously")
    p_exec.add_argument("--dir", dest="exec_dir", help="Working directory")
    p_exec.add_argument("--timeout", type=float, help="Timeout in seconds")

    # read
    p_read = sub.add_parser("read", help="Read a file")
    p_read.add_argument("path", help="File path in sandbox")
    p_read.add_argument("--start", type=int, help="Start line")
    p_read.add_argument("--end", type=int, help="End line")

    # write
    p_write = sub.add_parser("write", help="Write content to a file")
    p_write.add_argument("path", help="File path in sandbox")
    p_write.add_argument("content", help="Content to write")
    p_write.add_argument("--append", action="store_true", help="Append mode")

    # ls
    p_ls = sub.add_parser("ls", help="List directory")
    p_ls.add_argument("path", help="Directory path")
    p_ls.add_argument("--recursive", action="store_true")
    p_ls.add_argument("--hidden", action="store_true", help="Show hidden files")

    # upload
    p_upload = sub.add_parser("upload", help="Upload a file to sandbox")
    p_upload.add_argument("local_path", help="Local file path")
    p_upload.add_argument("remote_path", help="Remote path in sandbox")

    # download
    p_download = sub.add_parser("download", help="Download a file from sandbox")
    p_download.add_argument("remote_path", help="Remote path in sandbox")
    p_download.add_argument("--output", help="Local output path")

    # screenshot
    p_ss = sub.add_parser("screenshot", help="Take browser screenshot")
    p_ss.add_argument("--output",
                      help="Output file (default: /tmp/sandbox_screenshot.png)")

    # navigate
    p_nav = sub.add_parser("navigate", help="Navigate browser to URL")
    p_nav.add_argument("url", help="URL to navigate to")
    p_nav.add_argument("--wait-until", dest="wait_until",
                       choices=["load", "domcontentloaded", "networkidle"],
                       default="load", help="Wait condition")

    # browser-action
    p_ba = sub.add_parser("browser-action",
                          help="Execute a low-level browser action")
    p_ba.add_argument("action_type",
                      choices=["MOVE_TO", "MOVE_REL", "CLICK", "MOUSE_DOWN",
                               "MOUSE_UP", "RIGHT_CLICK", "DOUBLE_CLICK",
                               "DRAG_TO", "SCROLL", "TYPING", "PRESS",
                               "KEY_DOWN", "KEY_UP", "HOTKEY", "WAIT"],
                      help="Action type")
    p_ba.add_argument("--x", type=float, help="X coordinate")
    p_ba.add_argument("--y", type=float, help="Y coordinate")
    p_ba.add_argument("--text", help="Text for TYPING action")
    p_ba.add_argument("--key", help="Key for PRESS/KEY_DOWN/KEY_UP")
    p_ba.add_argument("--keys", help="Comma-separated keys for HOTKEY")
    p_ba.add_argument("--dx", type=int, help="Scroll delta X")
    p_ba.add_argument("--dy", type=int, help="Scroll delta Y")
    p_ba.add_argument("--duration", type=float, help="Duration for WAIT")

    # page-text
    sub.add_parser("page-text", help="Get page text content")

    # page-html
    sub.add_parser("page-html", help="Get page HTML")

    # evaluate
    p_eval = sub.add_parser("evaluate", help="Evaluate JavaScript in browser")
    p_eval.add_argument("expression", help="JavaScript expression")

    # run-code
    p_code = sub.add_parser("run-code", help="Execute code via shell")
    p_code.add_argument("code", help="Code to execute")
    p_code.add_argument("--lang", choices=["python", "javascript"],
                        default="python", help="Language (default: python)")

    return parser


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

DISPATCH = {
    "info": cmd_info,
    "exec": cmd_exec,
    "read": cmd_read,
    "write": cmd_write,
    "ls": cmd_ls,
    "upload": cmd_upload,
    "download": cmd_download,
    "screenshot": cmd_screenshot,
    "navigate": cmd_navigate,
    "browser-action": cmd_browser_action,
    "page-text": cmd_page_text,
    "page-html": cmd_page_html,
    "evaluate": cmd_evaluate,
    "run-code": cmd_run_code,
}


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.subcommand:
        parser.print_help()
        sys.exit(1)

    handler = DISPATCH.get(args.subcommand)
    if handler:
        handler(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()

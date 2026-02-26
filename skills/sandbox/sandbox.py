#!/usr/bin/env python3
"""
AIO Sandbox CLI — thin Python wrapper around the sandbox REST API.

Usage:
    sandbox.py info
    sandbox.py exec "<command>" [--async] [--dir <dir>] [--timeout <sec>]
    sandbox.py read <path> [--start <line>] [--end <line>]
    sandbox.py write <path> "<content>" [--append]
    sandbox.py ls <path> [--recursive] [--hidden]
    sandbox.py upload <local_path> <remote_path>
    sandbox.py download <remote_path> [--output <local_path>]
    sandbox.py screenshot [--output <file>]
    sandbox.py navigate <url>
    sandbox.py run-code "<code>" [--lang python|javascript] [--session <id>]
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
    data = _get_json("/v1/sandbox")
    _print_json(data)


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
    content = data.get("data", {}).get("content", "")
    print(content, end="")


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
    data = _post("/v1/browser/page/navigate", {"url": args.url})
    _exit_on_error(data)
    print(f"Navigated to {args.url}")


def cmd_run_code(args):
    """Execute code in Jupyter (Python) or Node.js."""
    lang = args.lang or "python"

    if lang == "python":
        payload = {"code": args.code}
        if args.session:
            payload["session_id"] = args.session
        data = _post("/v1/jupyter/execute", payload)
    elif lang == "javascript":
        payload = {"code": args.code}
        if args.session:
            payload["session_id"] = args.session
            payload["stateful"] = True
        data = _post("/v1/nodejs/execute", payload)
    else:
        print(f"Unsupported language: {lang}", file=sys.stderr)
        sys.exit(1)

    _exit_on_error(data)
    _print_json(data)


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="AIO Sandbox CLI",
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
    p_exec.add_argument("--timeout", type=int, help="Timeout in seconds")

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
                      help="Output file path (default: /tmp/sandbox_screenshot.png)")

    # navigate
    p_nav = sub.add_parser("navigate", help="Navigate browser to URL")
    p_nav.add_argument("url", help="URL to navigate to")

    # run-code
    p_code = sub.add_parser("run-code", help="Execute code")
    p_code.add_argument("code", help="Code to execute")
    p_code.add_argument("--lang", choices=["python", "javascript"],
                        default="python", help="Language (default: python)")
    p_code.add_argument("--session", help="Session ID for state persistence")

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

---
name: gmail
description: Use when you need to control Gmail from Clawdbot via the gmail tool to send messages, read messages, search messages, etc.
metadata:
  {
    "clawdbot":
      {
        "emoji": "✉️",
        "requires":
          {
            "env":
              ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
          },
      },
  }
---

# Gmail Skill

CLI tool for Gmail via Official Google API (Python).

## Setup

The following environment variables are available and are set in the environment:

- `GMAIL_CLIENT_ID`: Your OAuth Client ID
- `GMAIL_CLIENT_SECRET`: Your OAuth Client Secret
- `GMAIL_REFRESH_TOKEN`: Your OAuth Refresh Token (long-lived)

The skill relies exclusively on these environment variables for authentication.

## Usage

This skill is a single Python script (`gmail.py`) using `google-api-python-client` (can be installed via `pip` using:

# Setup python venv ~/.python-venv

- `python3 -m venv ~/.python-venv`
- `~/.python-venv/bin/pip install google-api-python-client`

```bash
~/.python-venv/bin/python3 skills/gmail/gmail.py <command> [args]
```

**Commands:**

- `unread [--limit <n>]`: List recent unread emails (default 10)
- `search <query> [--limit <n>]`: Search emails (Gmail syntax, default 10)
- `read <uid>`: Read full email by message ID (note: Gmail API uses Hex IDs, not integer UIDs)
- `send <to> <subject> [<body>]`: Send email
- `(no args)`: Scrape amounts from the latest email (default behavior)

**Examples:**

```bash
# List unread
~/.python-venv/bin/python3 skills/gmail/gmail.py unread

# Search
~/.python-venv/bin/python3 skills/gmail/gmail.py search --limit 5 "subject:invoice"
~/.python-venv/bin/python3 skills/gmail/gmail.py search "from:amazon newer:2d" --limit 20

# Read
~/.python-venv/bin/python3 skills/gmail/gmail.py read 193b218a...

# Send
~/.python-venv/bin/python3 skills/gmail/gmail.py send recipient@example.com "Subject Here" "Body content goes here"

# Scrape amounts
~/.python-venv/bin/python3 skills/gmail/gmail.py
```

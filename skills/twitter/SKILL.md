---
name: twitter
description: Use when you need to interface with Twitter/X to post tweets, read the home timeline, or search for tweets.
metadata:
  {
    "clawdbot":
      {
        "emoji": "🐦",
        "requires":
          {
            "env":
              [
                "X_KEY",
                "X_SECRET",
                "X_BEARER_TOKEN",
                "X_OAUTH_ID",
                "X_OAUTH_SECRET",
              ],
          },
      },
  }
---

# Twitter Skill

CLI tool for Twitter/X via Tweepy.

## Setup

The following environment variables are required and should be set in your environment:

- `X_KEY`: Consumer Key (API Key)
- `X_SECRET`: Consumer Secret (API Secret)
- `X_BEARER_TOKEN`: Bearer Token (Optional if using full OAuth 1.0a User Context, but recommended)
- `X_OAUTH_ID`: Access Token
- `X_OAUTH_SECRET`: Access Token Secret

## Usage

This skill is a single Python script (`twitter.py`) using `tweepy` installed in the Clawdbot Python environment (`${CLAWDBOT_PYTHON_VENV}`).

```bash
${CLAWDBOT_PYTHON_VENV}/bin/python3 skills/twitter/twitter.py <command> [args]
```

**Commands:**

- `timeline [--limit <n>]`: Fetch authenticated user's home timeline.
- `tweets [username] [--limit <n>]`: Fetch tweets from a specific user (defaults to authenticated user if omitted).
- `post <text>`: Post a new tweet.
- `search <query> [--limit <n>]`: Search for tweets.

**Examples:**

```bash
# Get Home Timeline
${CLAWDBOT_PYTHON_VENV}/bin/python3 skills/twitter/twitter.py timeline

# Post a Tweet
${CLAWDBOT_PYTHON_VENV}/bin/python3 skills/twitter/twitter.py post "Hello world from Clawdbot!"

# Search Tweets
${CLAWDBOT_PYTHON_VENV}/bin/python3 skills/twitter/twitter.py search "AI agents" --limit 5

# Get User Tweets
${CLAWDBOT_PYTHON_VENV}/bin/python3 skills/twitter/twitter.py tweets "GoogleDeepMind"
```

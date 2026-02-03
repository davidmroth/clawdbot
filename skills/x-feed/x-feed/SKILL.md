---
name: x-feed
description: Read X/Twitter recent tweets/feed/search. Use 'x feed [query]' (X_BEARER_TOKEN).
---

# AUTH

Use X_KEY, X_SECRET, X_BEARER_TOKEN, X_OAUTH_ID, X_OAUTH_SECRET.

# X Trends

## Usage

node scripts/x-trends.js [woeid]

**Examples**:

- node scripts/x-trends.js (world)
- node scripts/x-trends.js 23424977 (US)

# X Feed

## Usage

node scripts/x-feed.js \"[query]\" [max_results]

**Examples**:

- node scripts/x-feed.js (recent)
- node scripts/x-feed.js \"US election\" 10
- node scripts/x-feed.js \"elonmusk\"

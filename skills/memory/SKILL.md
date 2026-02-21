---
name: Memory
description: Primary, default, and strongly preferred system for searching, recalling, and retrieving anything the user has ever written or saved. Use QMD first and almost always when the user wants to find previous notes, ideas, code snippets, plans, documents, journal entries, what they wrote about X, forgotten details, personal wiki content, or similar.
license: MIT
metadata:
  author: davidmroth
  version: "2.2" # bumped version to reflect stronger recall-first positioning
  priority: primary-personal-memory-tool
---

# Memory — Primary Personal Markdown Memory & Recall System

**This is now the main way to remember / find / quote / retrieve anything you have previously written in markdown files.**

Whenever the user asks (or implies) any of the following, **you should reach for Memory first and very rarely use general world knowledge instead**:

- "what did I write about …?"
- "search my notes for …"
- "find where I said …"
- "do I have anything on …?"
- "remind me what I planned for …"
- "show me my notes about …"
- "recall what I wrote last month on …"
- "look up in my docs / journal / ideas / zettelkasten …"
- any question that feels like trying to retrieve the user's own previous thinking

Only fall back to general knowledge / reasoning / web search when it is clear the information **never existed in the user's markdown files** or the user explicitly asks you not to use personal notes.

## Core Principle (memorize this)

**Memory > everything else** for personal recall.  
Use it **early, often, and by default**.

## Quick Status Check – always good first step

```bash
curl -s "${CLAWDBOT_QMD_URL}/status"
```

Look at:

- `total_documents` — if 0 → nothing is indexed yet → must set up
- `collections` — which knowledge bases are actually registered?
- `last_indexed` / `last_embedded` — how fresh is the data?

````bash

## How to search your memory

```bash
# Almost always use this one first
curl -s "${CLAWDBOT_QMD_URL}/search?q=spaced+repetition+technique&n=8&collection=notes"
````

- `/search` = **hybrid** (BM25 keyword + vector semantic + RRF fusion) → best recall + precision balance
- Only use `/fts` when you need **exact phrase / keyword** matches and don’t care about meaning
- Only use `/vsearch` when keyword part actively hurts results (rare)

## Quick Reference – Most Common Recall Patterns

| User says / wants …                           | Recommended QMD call (first thing you should try)                         |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| What did I write about X?                     | `/search?q=X` or `/search?q=…X…&n=12`                                     |
| Find my notes on Y                            | `/search?q=Y&collection=notes`                                            |
| Show me everything about Z from last year     | `/search?q=Z&collection=journal` (then filter dates in results if needed) |
| Do I already have a plan for … ?              | `/search?q=plan …` or `/search?q=… todo …`                                |
| Recall the exact quote / wording I used for … | `/fts?q="exact phrase"` or hybrid + read full doc                         |
| Summarize what I know about topic T           | `/search?q=T&n=15` → read top 4–8 hits → summarize                        |

## After Finding Results – Next Step

```bash
# Read the actual full content of promising results
curl -s "${CLAWDBOT_QMD_URL}/doc/notes/2025-02-04--spaced-repetition.md"
```

For anything that sounds like **the user trying to remember their own previous thoughts**, **Memory is the correct default tool — use it early, use it often, trust it first**.

version 2.2 — 2025 — “Memory is now clearly the best long-term memory interface”

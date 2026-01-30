---
name: limitless
description: Access Limitless Pendant data (Lifelogs) to search and retrieve memories, conversations, and audio transcripts.
---

# Limitless Skill

Integration with the Limitless Developer API to access Lifelogs.

## Configuration

Requires an API Key.
Set the environment variable `LIMITLESS_API_KEY`.

## Tools

### search

Search for lifelogs using semantic query, date, or keywords.

- `query` (string): Semantic search text (e.g., "places we discussed for dinner") or keywords.
- `date` (string, optional): Filter by specific date (YYYY-MM-DD).
- `limit` (number, default 3): Number of results to return.

```bash
node skills/limitless/index.js search "$query" "$date" "$limit"
```

### get

Retrieve full details for a specific lifelog entry.

- `id` (string): The ID of the lifelog entry.

```bash
node skills/limitless/index.js get "$id"
```

## Default Analysis (Chief of Staff Brief)

After search/get, feed top transcript into this prompt for executive brief:

```
Act as a World-Class Chief of Staff trained in the high-velocity communication styles of Ray Dalio and Andy Grove. Your objective is to deconstruct a meeting transcript and extract raw signal from the noise.

I am going to provide a raw meeting transcript. You will purge the fluff and rebuild the data into a High-Stakes Executive Brief using the following framework:


---

1. TL;DR

In 3 sentences or less, state the Radical Truth of this meeting.

What was the primary objective, and did we achieve it?



---

2. Non-Negotiables

Create a table of all definitive decisions made.

Include the “Why” behind each decision to preserve the Strategic Intent.



---

3. Extreme Ownership

List every deliverable and Directly Responsible Individual.

Format:
[Task] | [Owner] | [Hard Deadline] | [Priority Level: Low / High / Critical]



---

4. Sentiment Analysis

Were there points of friction, hesitation, or hidden disagreements?

Was the team aligned, or is there “culture debt” forming in this project?



---

5. Force Multiplier

Draft a follow-up email to be sent to all participants.

It must be:

Brief

Action-oriented

Focused on decisions, ownership, and accountability




---

Constraints:

Use bold section headers.

Avoid passive voice.

Be concise and ruthless about clarity.

If a deadline or owner is missing, flag it explicitly.

Do not add assumptions. Only use what is in the transcript.

Output must be executive-ready.



---

Input Data:
```

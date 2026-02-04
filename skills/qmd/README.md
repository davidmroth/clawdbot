### 📊 Feature Parity: Native (Python) vs Reference (JS)

| Feature Category | Feature              | 🟢 JS (Reference)        | 🐍 Python (Native)      | Status             |
| :--------------- | :------------------- | :----------------------- | :---------------------- | :----------------- |
| **Core**         | Database Engine      | SQLite + FTS5 + Vec      | SQLite + FTS5 + Vec     | ✅ **Parity**      |
|                  | Indexing Strategy    | Hash-based (Dedup)       | Hash-based (Dedup)      | ✅ **Parity**      |
|                  | **Chunking**         | **Token-based** (Llama)  | **Token-based** (Llama) | ✅ **Parity**      |
| **Search**       | Keyword (`search`)   | FTS5 + Snippets          | FTS5 + Snippets         | ✅ **Parity**      |
|                  | Semantic (`vsearch`) | Cosine Similarity        | Cosine Similarity       | ✅ **Parity**      |
|                  | **Hybrid (`query`)** | **RRF + Reranker Model** | **RRF Only**            | ⚠️ **Partial** (1) |
| **AI**           | Embeddings           | Integrated (LlamaCpp)    | Integrated (LlamaCpp)   | ✅ **Parity**      |
|                  | **Reranking**        | **Cross-Encoder (Qwen)** | ❌ **None**             | **Gap**            |
| **Config**       | Parsing              | Robust (`yaml` lib)      | Robust (`PyYAML`)       | ✅ **Parity**      |
| **UX**           | Virtual Paths        | Full (`qmd://`)          | Partial (CLI args only) | ⚠️ **Partial**     |
|                  | Output Formats       | JSON, XML, Markdown      | CLI Text Only           | **Gap**            |

### 🔍 Summary of Updates

1.  **Chunking Fixed:**
    - The Python port now uses the **actual LLM tokenizer** to split documents (512 tokens with overlap). This matches the JS behavior exactly and ensures no words are split mid-token.

2.  **Configuration Fixed:**
    - Replaced the fragile custom parser with standard `PyYAML`. The tool is now robust against comments, spacing, and complex YAML structures.

3.  **Hybrid Search (The Last Mile):**
    - **Python** uses **Reciprocal Rank Fusion (RRF)** to mathematically merge keyword and vector results. This is high-quality and very fast.
    - **Gap:** It lacks the final "AI Reranking" pass (where a second model reads the snippets to re-sort them). This is currently blocked by library support in Python.

# Move QMD to Microservice:

This is the **Goldilocks solution**.

Moving `qmd` into a microservice (e.g., a lightweight FastAPI/Flask server running on localhost or a sidecar container) combines the best of both worlds: **Performance** (Python AI ecosystem) and **Integration** (clean API for Clawdbot).

### 🏗️ QMD as a Microservice

| Feature         | CLI (Current)                               | Microservice (Proposed)                       | Benefit                  |
| :-------------- | :------------------------------------------ | :-------------------------------------------- | :----------------------- |
| **Latency**     | **High** (Startup cost per command)         | **Low** (Model stays loaded in RAM)           | 🚀 **Instant Search**    |
| **Concurrency** | **Low** (Single threaded per call)          | **High** (Async server)                       | ⚡️ **Parallel Requests** |
| **State**       | **Stateless** (Reloads DB/Model every time) | **Stateful** (Caches DB connections/Model)    | 🧠 **Efficiency**        |
| **Integration** | `exec("qmd search ...")`                    | `fetch("http://localhost:port/search?q=...")` | 🔌 **Clean API**         |
| **Stability**   | **High** (Process isolation)                | **High** (Process isolation)                  | 🛡️ **Safety**            |

### 🚀 Feasibility: High

1.  **The Code:** We already have `qdm.py`. Wrapping it in `FastAPI` is trivial (approx. 50 lines of code).
    - `POST /update` -> triggers background indexing.
    - `GET /search` -> runs hybrid search.
    - `POST /embed` -> runs vector generation.

2.  **The Model:** Currently, every time you run `qmd search`, we load the GGUF model from disk (slow). A service keeps the LLM loaded in VRAM/RAM, making vector search **milliseconds** instead of seconds.

3.  **Deployment:** Clawdbot can simply start the service in the background (like a daemon) or it can run as a docker-compose service.

### Comparison Table

| Architecture           | Speed                      | Complexity      | Usage Context                    |
| :--------------------- | :------------------------- | :-------------- | :------------------------------- |
| **CLI (Current)**      | 🐢 Slow (Cold start)       | 🟢 Low          | Ad-hoc scripts, Cron jobs        |
| **Native Integration** | 🐇 Fast                    | 🔴 High (Bloat) | Tight core loop requirements     |
| **Microservice**       | 🐆 **Fastest** (Hot cache) | 🟡 Medium       | **Real-time Agent interactions** |

**Recommendation:**
If you plan to use `qmd` heavily for **Agent RAG** (where the bot queries knowledge constantly while thinking), the **Microservice** is the correct architecture. The latency savings from keeping the embedding model loaded are game-changing.

Shall I prototype a `server.py` for this?

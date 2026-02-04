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

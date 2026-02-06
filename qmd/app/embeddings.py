"""
Embedding model management for QMD.
Loads the nomic embedding model once and keeps it resident in memory.
"""

import os
import struct
from typing import Optional

# Default model path inside Docker container
DEFAULT_MODEL_PATH = "/app/qmd-models/nomic-embed-text-v1.5.Q4_K_M.gguf"

# Singleton model instance
_model = None


def get_model_path() -> str:
    return os.environ.get("QMD_EMBED_MODEL_PATH", DEFAULT_MODEL_PATH)


def load_model():
    """Load the embedding model into memory (singleton). Called once at startup."""
    global _model

    from llama_cpp import Llama

    model_path = get_model_path()
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Embedding model not found at {model_path}")

    _model = Llama(model_path=model_path, embedding=True, verbose=False)
    return _model


def get_model():
    """Return the loaded model, raising if not initialized."""
    if _model is None:
        raise RuntimeError("Embedding model not loaded. Call load_model() at startup.")
    return _model


def embed_text(text: str) -> bytes:
    """Embed a text string and return the vector as packed float bytes."""
    model = get_model()
    embedding = model.embed(text)
    # llama-cpp may return nested list
    if isinstance(embedding[0], list):
        embedding = embedding[0]
    return struct.pack(f"{len(embedding)}f", *embedding)


def embed_text_list(text: str) -> list[float]:
    """Embed a text string and return the vector as a Python list of floats."""
    model = get_model()
    embedding = model.embed(text)
    if isinstance(embedding[0], list):
        embedding = embedding[0]
    return embedding


def chunk_by_tokens(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """
    Token-based chunking using the LLM tokenizer.
    Guarantees chunks fit within context and don't split words.
    """
    if not text:
        return []

    model = get_model()

    try:
        tokens = model.tokenize(text.encode("utf-8"))
    except Exception:
        return [text]  # fallback to whole text

    total_tokens = len(tokens)
    if total_tokens <= chunk_size:
        return [text]

    chunks = []
    start = 0

    while start < total_tokens:
        end = min(start + chunk_size, total_tokens)
        chunk_tokens = tokens[start:end]

        try:
            chunk_str = model.detokenize(chunk_tokens).decode("utf-8", errors="ignore")
            chunks.append(chunk_str)
        except Exception:
            pass

        if end == total_tokens:
            break
        start += chunk_size - overlap

    return chunks

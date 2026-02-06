"""
Indexing and embedding pipeline for QMD.
Scans collection directories and generates vector embeddings.
"""

import os
import glob
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from .db import hash_content, extract_title
from .embeddings import chunk_by_tokens, embed_text


def index_collection(
    conn: sqlite3.Connection,
    collection_name: str,
    path: str,
    pattern: str = "**/*.md",
) -> dict:
    """
    Index files from a collection directory.
    Returns stats about what was indexed.
    """
    full_pattern = os.path.join(path, pattern)
    files = glob.glob(full_pattern, recursive=True)

    now = datetime.now(timezone.utc).isoformat()
    stats = {"indexed": 0, "updated": 0, "skipped": 0, "errors": 0}

    for filepath in files:
        if os.path.isdir(filepath):
            continue

        rel_path = os.path.relpath(filepath, path)
        if rel_path.startswith(".git") or "node_modules" in rel_path:
            continue

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            stats["errors"] += 1
            continue

        content_hash = hash_content(content)
        title = extract_title(content, filepath)

        # Insert content (dedup by hash)
        conn.execute(
            "INSERT OR IGNORE INTO content (hash, doc, created_at) VALUES (?, ?, ?)",
            (content_hash, content, now),
        )

        # Check for existing document
        cur = conn.execute(
            "SELECT id, hash FROM documents WHERE collection = ? AND path = ? AND active = 1",
            (collection_name, rel_path),
        )
        existing = cur.fetchone()

        stat = os.stat(filepath)
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()

        if existing:
            doc_id, old_hash = existing
            if old_hash != content_hash:
                conn.execute(
                    "UPDATE documents SET title = ?, hash = ?, modified_at = ? WHERE id = ?",
                    (title, content_hash, mtime, doc_id),
                )
                stats["updated"] += 1
            else:
                stats["skipped"] += 1
        else:
            created = datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat()
            conn.execute(
                """
                INSERT INTO documents (collection, path, title, hash, created_at, modified_at, active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                """,
                (collection_name, rel_path, title, content_hash, created, mtime),
            )
            stats["indexed"] += 1

    conn.commit()
    return stats


def embed_documents(
    conn: sqlite3.Connection,
    force: bool = False,
) -> dict:
    """
    Generate vector embeddings for un-embedded documents.
    Returns stats about the embedding run.
    """
    if force:
        conn.execute("DELETE FROM content_vectors")
        conn.execute("DELETE FROM vectors_vec")
        conn.commit()

    # Find content needing embedding
    cur = conn.execute("""
        SELECT DISTINCT c.hash, c.doc
        FROM content c
        JOIN documents d ON c.hash = d.hash
        LEFT JOIN content_vectors v ON c.hash = v.hash AND v.seq = 0
        WHERE d.active = 1 AND v.hash IS NULL
    """)
    rows = cur.fetchall()

    stats = {"total": len(rows), "processed": 0, "chunks": 0, "errors": 0}

    if len(rows) == 0:
        return stats

    now = datetime.now(timezone.utc).isoformat()

    for content_hash, content_text in rows:
        chunks = chunk_by_tokens(content_text, chunk_size=512, overlap=64)

        for seq, chunk in enumerate(chunks):
            try:
                vector_bytes = embed_text(chunk)

                conn.execute(
                    """
                    INSERT OR REPLACE INTO content_vectors (hash, seq, pos, model, embedded_at)
                    VALUES (?, ?, ?, 'nomic-embed', ?)
                    """,
                    (content_hash, seq, 0, now),
                )

                pk = f"{content_hash}_{seq}"
                conn.execute(
                    "INSERT OR REPLACE INTO vectors_vec (hash_seq, embedding) VALUES (?, ?)",
                    (pk, vector_bytes),
                )
                stats["chunks"] += 1
            except Exception:
                stats["errors"] += 1

        stats["processed"] += 1

        # Commit every 5 documents to avoid holding large transactions
        if stats["processed"] % 5 == 0:
            conn.commit()

    conn.commit()
    return stats

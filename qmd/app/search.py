"""
Search functions for QMD: FTS5 keyword, vector semantic, and hybrid RRF.
"""

import sqlite3
from typing import Optional

from .embeddings import embed_text


def search_fts(
    conn: sqlite3.Connection,
    query: str,
    limit: int = 20,
    collection: Optional[str] = None,
) -> list[dict]:
    """Full-text keyword search using FTS5."""
    if collection:
        cur = conn.execute(
            """
            SELECT filepath, title, rank,
                   snippet(documents_fts, 2, '', '', '...', 64)
            FROM documents_fts
            WHERE documents_fts MATCH ? AND filepath LIKE ?
            ORDER BY rank
            LIMIT ?
            """,
            (query, f"{collection}/%", limit),
        )
    else:
        cur = conn.execute(
            """
            SELECT filepath, title, rank,
                   snippet(documents_fts, 2, '', '', '...', 64)
            FROM documents_fts
            WHERE documents_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (query, limit),
        )

    return [
        {"path": r[0], "title": r[1], "score": r[2], "snippet": r[3], "type": "fts"}
        for r in cur.fetchall()
    ]


def search_vec(
    conn: sqlite3.Connection,
    query: str,
    limit: int = 20,
    collection: Optional[str] = None,
) -> list[dict]:
    """Semantic vector search using cosine similarity."""
    query_vector = embed_text(query)

    sql = """
        SELECT
            d.collection || '/' || d.path AS filepath,
            d.title,
            MIN(vec_distance_cosine(vv.embedding, ?)) AS min_distance
        FROM vectors_vec vv
        JOIN content_vectors cv ON cv.hash || '_' || cv.seq = vv.hash_seq
        JOIN documents d ON d.hash = cv.hash
        WHERE d.active = 1
    """
    params: list = [query_vector]

    if collection:
        sql += " AND d.collection = ?"
        params.append(collection)

    sql += """
        GROUP BY d.path
        ORDER BY min_distance ASC
        LIMIT ?
    """
    params.append(limit)

    try:
        cur = conn.execute(sql, params)
        return [
            {
                "path": r[0],
                "title": r[1],
                "score": round(1.0 - r[2], 4),
                "type": "vec",
            }
            for r in cur.fetchall()
        ]
    except Exception as e:
        return [{"error": str(e)}]


def search_hybrid(
    conn: sqlite3.Connection,
    query: str,
    limit: int = 10,
    collection: Optional[str] = None,
) -> list[dict]:
    """
    Hybrid search using Reciprocal Rank Fusion (RRF).
    Runs both FTS and vector search, then merges results.
    """
    k = 60  # RRF constant

    fts_results = search_fts(conn, query, limit=50, collection=collection)
    vec_results = search_vec(conn, query, limit=50, collection=collection)

    scores: dict[str, float] = {}
    titles: dict[str, str] = {}

    for rank, res in enumerate(fts_results):
        path = res["path"]
        titles[path] = res["title"]
        scores[path] = scores.get(path, 0) + (1 / (k + rank + 1))

    for rank, res in enumerate(vec_results):
        path = res["path"]
        titles[path] = res["title"]
        scores[path] = scores.get(path, 0) + (1 / (k + rank + 1))

    # Sort by RRF score descending
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    return [
        {"path": path, "title": titles[path], "score": round(score, 4), "type": "rrf"}
        for path, score in ranked[:limit]
    ]

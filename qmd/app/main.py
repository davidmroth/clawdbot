"""
QMD Microservice — FastAPI application.
Exposes HTTP endpoints for indexing, embedding, and searching markdown content.
Supports multiple Clawdbot instances via X-Instance-ID header.
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

from .db import get_connection, get_db_path, init_db
from .embeddings import load_model
from .search import search_fts, search_vec, search_hybrid
from .indexer import index_collection, embed_documents
from .config import load_config

logger = logging.getLogger("qmd")

DEFAULT_INSTANCE = "default"


# --- Lifespan: load embedding model once at startup ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading embedding model...")
    try:
        load_model()
        logger.info("Embedding model loaded and resident in memory.")
    except Exception as e:
        logger.error(f"Failed to load embedding model: {e}")
        logger.warning("Vector search and embedding endpoints will not work.")
    yield


app = FastAPI(
    title="QMD — Quick Markdown Search",
    description="Local hybrid search engine for markdown content. Supports FTS5, vector semantic, and hybrid RRF search.",
    version="1.0.0",
    lifespan=lifespan,
)


# --- Helpers ---


def get_instance(x_instance_id: Optional[str]) -> str:
    """Resolve instance ID from header, falling back to default."""
    return x_instance_id.strip() if x_instance_id else DEFAULT_INSTANCE


# --- Request/Response models ---


class IndexRequest(BaseModel):
    """Request to index a specific collection by name, or all configured collections."""
    collection: Optional[str] = None


class EmbedRequest(BaseModel):
    """Request to generate vector embeddings for indexed documents."""
    force: bool = False


class CollectionAddRequest(BaseModel):
    """Request to add a new collection to the config."""
    name: str
    path: str
    pattern: str = "**/*.md"


class ContextRequest(BaseModel):
    """Request to add context annotation to a collection path."""
    collection: str
    path: str
    text: str


# --- Health ---


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- Index ---


@app.post("/index")
async def index(
    body: IndexRequest,
    x_instance_id: Optional[str] = Header(None),
):
    """Index files from configured collections (or a specific one)."""
    instance = get_instance(x_instance_id)
    cfg = load_config(instance)
    collections = cfg.get_collections()

    if not collections:
        raise HTTPException(status_code=404, detail="No collections configured for this instance.")

    if body.collection:
        # Filter to requested collection
        collections = [c for c in collections if c["name"] == body.collection]
        if not collections:
            raise HTTPException(status_code=404, detail=f"Collection '{body.collection}' not found.")

    results = {}
    with get_connection(instance) as conn:
        for col in collections:
            stats = index_collection(
                conn,
                col["name"],
                col["path"],
                col.get("pattern", "**/*.md"),
            )
            results[col["name"]] = stats

    return {"instance": instance, "collections": results}


# --- Embed ---


@app.post("/embed")
async def embed(
    body: EmbedRequest,
    x_instance_id: Optional[str] = Header(None),
):
    """Generate vector embeddings for all un-embedded documents."""
    instance = get_instance(x_instance_id)

    with get_connection(instance) as conn:
        stats = embed_documents(conn, force=body.force)

    return {"instance": instance, "stats": stats}


# --- Search: Hybrid (RRF) ---


@app.get("/search")
async def search(
    q: str = Query(..., description="Search query"),
    n: int = Query(10, description="Number of results"),
    collection: Optional[str] = Query(None, description="Restrict to collection"),
    x_instance_id: Optional[str] = Header(None),
):
    """Hybrid search using Reciprocal Rank Fusion (FTS + Vector)."""
    instance = get_instance(x_instance_id)

    with get_connection(instance) as conn:
        results = search_hybrid(conn, q, limit=n, collection=collection)

    return {"instance": instance, "query": q, "results": results}


# --- Search: Vector only ---


@app.get("/vsearch")
async def vsearch(
    q: str = Query(..., description="Search query"),
    n: int = Query(10, description="Number of results"),
    collection: Optional[str] = Query(None, description="Restrict to collection"),
    x_instance_id: Optional[str] = Header(None),
):
    """Semantic vector search using cosine similarity."""
    instance = get_instance(x_instance_id)

    with get_connection(instance) as conn:
        results = search_vec(conn, q, limit=n, collection=collection)

    return {"instance": instance, "query": q, "results": results}


# --- Search: FTS only ---


@app.get("/fts")
async def fts(
    q: str = Query(..., description="Search query"),
    n: int = Query(20, description="Number of results"),
    collection: Optional[str] = Query(None, description="Restrict to collection"),
    x_instance_id: Optional[str] = Header(None),
):
    """Full-text keyword search using FTS5 (BM25)."""
    instance = get_instance(x_instance_id)

    with get_connection(instance) as conn:
        results = search_fts(conn, q, limit=n, collection=collection)

    return {"instance": instance, "query": q, "results": results}


# --- Document retrieval ---


@app.get("/doc/{path:path}")
async def get_doc(
    path: str,
    line_numbers: bool = Query(False, description="Add line numbers to output"),
    x_instance_id: Optional[str] = Header(None),
):
    """Retrieve a document's content by path."""
    instance = get_instance(x_instance_id)

    with get_connection(instance) as conn:
        # Try exact match
        cur = conn.execute(
            """
            SELECT c.doc, d.collection, d.path, d.title
            FROM documents d
            JOIN content c ON d.hash = c.hash
            WHERE (d.path = ? OR d.collection || '/' || d.path = ?) AND d.active = 1
            LIMIT 1
            """,
            (path, path),
        )
        row = cur.fetchone()

        if not row:
            # Try fuzzy match
            cur = conn.execute(
                """
                SELECT c.doc, d.collection, d.path, d.title
                FROM documents d
                JOIN content c ON d.hash = c.hash
                WHERE d.path LIKE ? AND d.active = 1
                LIMIT 1
                """,
                (f"%{path}%",),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Document not found: {path}")

        doc, collection, doc_path, title = row
        content = doc

        if line_numbers:
            lines = content.splitlines()
            width = len(str(len(lines)))
            content = "\n".join(f"{i+1:>{width}} | {line}" for i, line in enumerate(lines))

        return {
            "instance": instance,
            "collection": collection,
            "path": doc_path,
            "title": title,
            "content": content,
        }


# --- Status ---


@app.get("/status")
async def status(x_instance_id: Optional[str] = Header(None)):
    """Show index status and statistics."""
    instance = get_instance(x_instance_id)
    db_path = get_db_path(instance)

    if not os.path.exists(db_path):
        return {"instance": instance, "indexed": False, "message": "No index found."}

    with get_connection(instance) as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE active = 1"
        ).fetchone()[0]

        vectors = conn.execute("SELECT COUNT(*) FROM content_vectors").fetchone()[0]

        cur = conn.execute("""
            SELECT collection, COUNT(*) as count, MAX(modified_at) as last_mod
            FROM documents
            WHERE active = 1
            GROUP BY collection
        """)
        collections = [
            {"name": r[0], "files": r[1], "last_modified": r[2]}
            for r in cur.fetchall()
        ]

        size_bytes = os.path.getsize(db_path)

    return {
        "instance": instance,
        "indexed": True,
        "db_path": db_path,
        "size_mb": round(size_bytes / (1024 * 1024), 2),
        "total_documents": total,
        "total_vectors": vectors,
        "collections": collections,
    }


# --- Collections ---


@app.get("/collections")
async def list_collections(x_instance_id: Optional[str] = Header(None)):
    """List configured collections for this instance."""
    instance = get_instance(x_instance_id)
    cfg = load_config(instance)
    return {"instance": instance, "collections": cfg.get_collections()}


@app.post("/collections")
async def add_collection_endpoint(
    body: CollectionAddRequest,
    x_instance_id: Optional[str] = Header(None),
):
    """Add a new collection to the instance config."""
    instance = get_instance(x_instance_id)
    cfg = load_config(instance)
    cfg.add_collection(body.name, body.path, body.pattern)
    return {"instance": instance, "message": f"Collection '{body.name}' added."}


@app.delete("/collections/{name}")
async def remove_collection_endpoint(
    name: str,
    x_instance_id: Optional[str] = Header(None),
):
    """Remove a collection from the instance config."""
    instance = get_instance(x_instance_id)
    cfg = load_config(instance)
    if not cfg.remove_collection(name):
        raise HTTPException(status_code=404, detail=f"Collection '{name}' not found.")
    return {"instance": instance, "message": f"Collection '{name}' removed."}


# --- Context ---


@app.post("/context")
async def add_context(
    body: ContextRequest,
    x_instance_id: Optional[str] = Header(None),
):
    """Add a context annotation to a collection path."""
    instance = get_instance(x_instance_id)
    cfg = load_config(instance)
    if not cfg.add_context(body.collection, body.path, body.text):
        raise HTTPException(status_code=404, detail=f"Collection '{body.collection}' not found.")
    return {"instance": instance, "message": "Context added."}


@app.delete("/context/{collection}/{path:path}")
async def remove_context(
    collection: str,
    path: str,
    x_instance_id: Optional[str] = Header(None),
):
    """Remove a context annotation from a collection path."""
    instance = get_instance(x_instance_id)
    cfg = load_config(instance)
    if not cfg.remove_context(collection, path):
        raise HTTPException(status_code=404, detail="Context not found.")
    return {"instance": instance, "message": "Context removed."}

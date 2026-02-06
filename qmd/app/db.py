"""
Database management for QMD.
Handles SQLite + FTS5 + sqlite-vec schema, connections, and per-instance isolation.
"""

import os
import sqlite3
import hashlib
from pathlib import Path
from contextlib import contextmanager

# Base directory for all instance databases
DEFAULT_DATA_DIR = os.path.expanduser("~/.cache/qmd")

# sqlite-vec extension paths to try
VEC_EXTENSION_PATHS = ["/usr/local/lib/vec0.so", "vec0"]


def get_data_dir() -> str:
    return os.environ.get("QMD_DATA_DIR", DEFAULT_DATA_DIR)


def get_db_path(instance_id: str) -> str:
    """Get the SQLite database path for a specific instance."""
    base = get_data_dir()
    return os.path.join(base, instance_id, "index.sqlite")


def hash_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def extract_title(content: str, filename: str) -> str:
    """Extract title from first heading or fall back to filename stem."""
    for line in content.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
        if line.startswith("## "):
            return line[3:].strip()
    return Path(filename).stem


def _load_vec_extension(conn: sqlite3.Connection) -> bool:
    """Attempt to load sqlite-vec extension. Returns True on success."""
    try:
        conn.enable_load_extension(True)
        for path in VEC_EXTENSION_PATHS:
            if os.path.exists(path) or path == "vec0":
                try:
                    conn.load_extension(path)
                    return True
                except Exception:
                    continue
    except Exception:
        pass
    return False


def init_db(db_path: str) -> sqlite3.Connection:
    """Initialize the database schema and return a connection."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")

    vec_loaded = _load_vec_extension(conn)

    # Content-addressable storage
    conn.execute("""
        CREATE TABLE IF NOT EXISTS content (
            hash TEXT PRIMARY KEY,
            doc TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Documents table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection TEXT NOT NULL,
            path TEXT NOT NULL,
            title TEXT NOT NULL,
            hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            modified_at TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (hash) REFERENCES content(hash) ON DELETE CASCADE,
            UNIQUE(collection, path)
        )
    """)

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection, active)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path, active)"
    )

    # LLM Cache
    conn.execute("""
        CREATE TABLE IF NOT EXISTS llm_cache (
            hash TEXT PRIMARY KEY,
            result TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Content Vectors metadata
    conn.execute("""
        CREATE TABLE IF NOT EXISTS content_vectors (
            hash TEXT NOT NULL,
            seq INTEGER NOT NULL DEFAULT 0,
            pos INTEGER NOT NULL DEFAULT 0,
            model TEXT NOT NULL,
            embedded_at TEXT NOT NULL,
            PRIMARY KEY (hash, seq)
        )
    """)

    # Vector table (sqlite-vec) — 768-dim cosine distance
    if vec_loaded:
        try:
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS vectors_vec USING vec0(
                    hash_seq TEXT PRIMARY KEY,
                    embedding float[768] distance_metric=cosine
                )
            """)
        except Exception:
            pass

    # FTS5 full-text search
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
            filepath, title, body,
            tokenize='porter unicode61'
        )
    """)

    # Triggers for FTS auto-sync
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents
        WHEN new.active = 1
        BEGIN
            INSERT INTO documents_fts(rowid, filepath, title, body)
            SELECT
                new.id,
                new.collection || '/' || new.path,
                new.title,
                (SELECT doc FROM content WHERE hash = new.hash)
            WHERE new.active = 1;
        END
    """)

    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
            DELETE FROM documents_fts WHERE rowid = old.id;
        END
    """)

    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents
        BEGIN
            DELETE FROM documents_fts WHERE rowid = old.id AND new.active = 0;
            INSERT OR REPLACE INTO documents_fts(rowid, filepath, title, body)
            SELECT
                new.id,
                new.collection || '/' || new.path,
                new.title,
                (SELECT doc FROM content WHERE hash = new.hash)
            WHERE new.active = 1;
        END
    """)

    conn.commit()
    return conn


@contextmanager
def get_connection(instance_id: str):
    """Context manager that yields an initialized DB connection for an instance."""
    db_path = get_db_path(instance_id)
    conn = init_db(db_path)
    try:
        yield conn
    finally:
        conn.close()

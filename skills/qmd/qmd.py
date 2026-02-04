#!/usr/bin/env python3
import os
import glob
import sqlite3
import argparse
import hashlib
import struct
from pathlib import Path
from datetime import datetime
import yaml

# Import llama_cpp for embeddings
try:
    from llama_cpp import Llama
    LLAMA_AVAILABLE = True
except ImportError:
    LLAMA_AVAILABLE = False

# Configuration
DEFAULT_DB_PATH = os.path.expanduser('~/.cache/qmd/index.sqlite')
# Model path (hardcoded for now based on what we saw in qmd-models)
EMBED_MODEL_PATH = '/app/qmd-models/nomic-embed-text-v1.5.Q4_K_M.gguf'
CONFIG_DIR = os.path.expanduser('~/.config/qmd')
CONFIG_FILE = os.path.join(CONFIG_DIR, 'index.yml')

def get_db_path():
    return os.environ.get('INDEX_PATH', DEFAULT_DB_PATH)

def init_db(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute('PRAGMA foreign_keys = ON')

    # Load sqlite-vec extension
    try:
        conn.enable_load_extension(True)
        # Try common paths
        paths = [
            '/usr/local/lib/vec0.so',
            'vec0'
        ]
        loaded = False
        for p in paths:
            if os.path.exists(p) or p == 'vec0':
                try:
                    conn.load_extension(p)
                    loaded = True
                    # print(f"Loaded extension: {p}")
                    break
                except Exception:
                    continue
        
        if not loaded:
            print("Warning: Could not load sqlite-vec extension. Vector search will not work.")
    except Exception as e:
        print(f"Warning: SQLite extension loading not supported: {e}")

    # Content-addressable storage
    conn.execute('''
        CREATE TABLE IF NOT EXISTS content (
            hash TEXT PRIMARY KEY,
            doc TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    # Documents table
    conn.execute('''
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
    ''')
    
    conn.execute('CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection, active)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path, active)')

    # LLM Cache
    conn.execute('''
        CREATE TABLE IF NOT EXISTS llm_cache (
            hash TEXT PRIMARY KEY,
            result TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    # Content Vectors
    conn.execute('''
        CREATE TABLE IF NOT EXISTS content_vectors (
            hash TEXT NOT NULL,
            seq INTEGER NOT NULL DEFAULT 0,
            pos INTEGER NOT NULL DEFAULT 0,
            model TEXT NOT NULL,
            embedded_at TEXT NOT NULL,
            PRIMARY KEY (hash, seq)
        )
    ''')

    # Vector Table (sqlite-vec)
    # Check if table exists to avoid errors on re-init with different dims?
    # For now, just create if not exists with default dims (768)
    try:
        conn.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS vectors_vec USING vec0(
                hash_seq TEXT PRIMARY KEY,
                embedding float[768] distance_metric=cosine
            )
        ''')
    except Exception as e:
        # Might fail if extension not loaded
        pass

    # FTS Table
    conn.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
            filepath, title, body,
            tokenize='porter unicode61'
        )
    ''')

    # Triggers for FTS
    conn.execute('''
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
    ''')

    conn.execute('''
        CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
            DELETE FROM documents_fts WHERE rowid = old.id;
        END
    ''')

    conn.execute('''
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
    ''')
    
    conn.commit()
    return conn

def hash_content(content):
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

def extract_title(content, filename):
    # Simple extraction: first header or filename
    for line in content.splitlines():
        if line.startswith('# '):
            return line[2:].strip()
        if line.startswith('## '):
            return line[3:].strip()
    return Path(filename).stem

def handelize(path):
    # Simplified version of TS handelize
    return path.replace('___', '/').lower()

class ConfigManager:
    def __init__(self, path):
        self.path = path
        self.config = {'collections': {}}
        self.load()

    def load(self):
        if not os.path.exists(self.path):
            return
        
        try:
            with open(self.path, 'r') as f:
                data = yaml.safe_load(f)
                if data:
                    self.config = data
                    # Ensure collections key exists
                    if 'collections' not in self.config:
                        self.config['collections'] = {}
        except Exception as e:
            print(f"Error loading config: {e}")

    def save(self):
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, 'w') as f:
                yaml.safe_dump(self.config, f, default_flow_style=False, sort_keys=False)
        except Exception as e:
            print(f"Error saving config: {e}")

    def get_collections(self):
        cols = []
        for name, data in self.config.get('collections', {}).items():
            col = {'name': name}
            col.update(data)
            cols.append(col)
        return cols

    def add_context(self, collection, path, text):
        if 'collections' not in self.config:
            self.config['collections'] = {}
            
        if collection not in self.config['collections']:
            print(f"Collection '{collection}' not found.")
            return
        
        if 'context' not in self.config['collections'][collection]:
            self.config['collections'][collection]['context'] = {}
            
        self.config['collections'][collection]['context'][path] = text
        self.save()
        print(f"Context added to '{collection}' for path '{path}'")

    def remove_context(self, collection, path):
        if 'collections' not in self.config:
            return
            
        if collection not in self.config['collections']:
            return
        
        if 'context' in self.config['collections'][collection]:
            if path in self.config['collections'][collection]['context']:
                del self.config['collections'][collection]['context'][path]
                self.save()
                print(f"Context removed from '{collection}' path '{path}'")

def load_config():
    return ConfigManager(CONFIG_FILE)

def get_collections():
    cfg = load_config()
    return cfg.get_collections()

def index_files(collection_name, path, pattern, db_conn):
    print(f"Indexing collection '{collection_name}' in {path}...")
    full_pattern = os.path.join(path, pattern)
    print(f"DEBUG: glob pattern = {full_pattern}")
    # Recursively find files
    files = glob.glob(full_pattern, recursive=True)
    
    now = datetime.utcnow().isoformat()
    
    for filepath in files:
        if os.path.isdir(filepath):
            continue
            
        rel_path = os.path.relpath(filepath, path)
        if rel_path.startswith('.git') or 'node_modules' in rel_path:
            continue
            
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            continue # Skip non-utf8 files
            
        content_hash = hash_content(content)
        title = extract_title(content, filepath)
        
        # Insert content
        db_conn.execute('INSERT OR IGNORE INTO content (hash, doc, created_at) VALUES (?, ?, ?)',
                       (content_hash, content, now))
        
        # Check existing document
        cur = db_conn.execute('SELECT id, hash FROM documents WHERE collection = ? AND path = ? AND active = 1',
                             (collection_name, rel_path))
        existing = cur.fetchone()
        
        stat = os.stat(filepath)
        mtime = datetime.fromtimestamp(stat.st_mtime).isoformat()
        
        if existing:
            doc_id, old_hash = existing
            if old_hash != content_hash:
                # Update
                db_conn.execute('UPDATE documents SET title = ?, hash = ?, modified_at = ? WHERE id = ?',
                               (title, content_hash, mtime, doc_id))
                print(f"Updated: {rel_path}")
        else:
            # Insert
            created = datetime.fromtimestamp(stat.st_ctime).isoformat()
            db_conn.execute('''
                INSERT INTO documents (collection, path, title, hash, created_at, modified_at, active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            ''', (collection_name, rel_path, title, content_hash, created, mtime))
            print(f"Indexed: {rel_path}")
            
    db_conn.commit()

def cmd_update(args):
    db_path = get_db_path()
    conn = init_db(db_path)
    
    collections = get_collections()
    if not collections:
        print("No collections found in config.")
        return

    for col in collections:
        index_files(col['name'], col['path'], col.get('pattern', '**/*.md'), conn)
    
    conn.close()

def cmd_search(args):
    db_path = get_db_path()
    conn = init_db(db_path)
    
    query = args.query
    # Basic FTS search
    cur = conn.execute('''
        SELECT filepath, title, snippet(documents_fts, 2, '<b>', '</b>', '...', 64)
        FROM documents_fts
        WHERE documents_fts MATCH ?
        ORDER BY rank
        LIMIT 20
    ''', (query,))
    
    results = cur.fetchall()
    if not results:
        print("No results found.")
    
    for row in results:
        filepath, title, snippet = row
        print(f"\nFile: {filepath}")
        print(f"Title: {title}")
        print(f"Match: {snippet}")
        print("-" * 40)
        
    conn.close()

def cmd_ls(args):
    db_path = get_db_path()
    conn = init_db(db_path)
    
    if args.collection:
        cur = conn.execute('SELECT path, title FROM documents WHERE collection = ? AND active = 1 ORDER BY path', (args.collection,))
        print(f"Files in collection '{args.collection}':")
    else:
        cur = conn.execute('SELECT collection, COUNT(*) FROM documents WHERE active = 1 GROUP BY collection')
        print("Collections:")
        for row in cur.fetchall():
            print(f"  {row[0]} ({row[1]} files)")
        conn.close()
        return

    for row in cur.fetchall():
        print(f"  {row[0]} ({row[1]})")
    
    conn.close()

def cmd_get(args):
    db_path = get_db_path()
    conn = init_db(db_path)
    
    # Simple resolution: check if it's a path in the DB
    # Try exact match first
    cur = conn.execute('''
        SELECT c.doc 
        FROM documents d 
        JOIN content c ON d.hash = c.hash 
        WHERE d.path = ? OR d.collection || '/' || d.path = ?
        LIMIT 1
    ''', (args.path, args.path))
    
    row = cur.fetchone()
    if row:
        print(row[0])
    else:
        # Try fuzzy match
        cur = conn.execute('''
            SELECT c.doc 
            FROM documents d 
            JOIN content c ON d.hash = c.hash 
            WHERE d.path LIKE ?
            LIMIT 1
        ''', (f"%{args.path}%",))
        row = cur.fetchone()
        if row:
            print(row[0])
        else:
            print(f"Document not found: {args.path}")
            
    conn.close()

def cmd_status(args):
    db_path = get_db_path()
    
    if not os.path.exists(db_path):
        print("No index found.")
        return

    conn = init_db(db_path)
    
    # DB Size
    size_bytes = os.path.getsize(db_path)
    print(f"Index: {db_path}")
    print(f"Size:  {size_bytes / (1024*1024):.2f} MB\n")
    
    # Stats
    total = conn.execute("SELECT COUNT(*) FROM documents WHERE active = 1").fetchone()[0]
    print("Documents")
    print(f"  Total:    {total} files indexed")
    
    # Collections
    print("\nCollections")
    cur = conn.execute('''
        SELECT collection, COUNT(*) as count, MAX(modified_at) as last_mod 
        FROM documents 
        WHERE active = 1 
        GROUP BY collection
    ''')
    
    for row in cur.fetchall():
        name, count, last_mod = row
        print(f"  {name}")
        print(f"    Files:    {count}")
        print(f"    Updated:  {last_mod}")
        
    conn.close()

def cmd_context(args):
    cfg = load_config()
    
    if args.subcommand == 'list':
        for col in cfg.get_collections():
            print(f"Collection: {col['name']}")
            if 'context' in col:
                for path, text in col['context'].items():
                    print(f"  {path}: {text}")
            else:
                print("  (no context)")
                
    elif args.subcommand == 'add':
        # Parse collection/path from qmd:// or just use first collection if ambiguous?
        # Argument is just 'path', so we need to infer collection.
        # For now, let's require explicit collection or default to first.
        
        target_path = args.path
        collection = None
        rel_path = target_path
        
        if target_path.startswith('qmd://'):
            parts = target_path[6:].split('/', 1)
            collection = parts[0]
            rel_path = parts[1] if len(parts) > 1 else '/'
        else:
            # Try to match path to a collection
            abs_path = os.path.abspath(target_path)
            cols = cfg.get_collections()
            for col in cols:
                if abs_path.startswith(col['path']):
                    collection = col['name']
                    rel_path = os.path.relpath(abs_path, col['path'])
                    break
            
            if not collection and cols:
                # Default to first collection if it's just a relative path like "foo/bar"
                # But strictly speaking we should probably be careful.
                # Let's assume the user knows what they are doing if they don't provide a full path.
                collection = cols[0]['name']
                
        if not collection:
            print("Could not determine collection. Use qmd://collection/path format.")
            return

        cfg.add_context(collection, rel_path, args.text)

    elif args.subcommand == 'remove':
        target_path = args.path
        collection = None
        rel_path = target_path
        
        if target_path.startswith('qmd://'):
            parts = target_path[6:].split('/', 1)
            collection = parts[0]
            rel_path = parts[1] if len(parts) > 1 else '/'
        else:
            # Same logic as add
            abs_path = os.path.abspath(target_path)
            cols = cfg.get_collections()
            for col in cols:
                if abs_path.startswith(col['path']):
                    collection = col['name']
                    rel_path = os.path.relpath(abs_path, col['path'])
                    break
                    
            if not collection and cols:
                collection = cols[0]['name']
                
        if not collection:
            print("Could not determine collection.")
            return

        cfg.remove_context(collection, rel_path)

def get_embedding_model():
    if not LLAMA_AVAILABLE:
        print("Error: llama-cpp-python not installed.")
        return None
    
    if not os.path.exists(EMBED_MODEL_PATH):
        print(f"Error: Model not found at {EMBED_MODEL_PATH}")
        return None

    try:
        # Initialize Llama model for embeddings
        # verbose=False to reduce noise
        return Llama(model_path=EMBED_MODEL_PATH, embedding=True, verbose=False)
    except Exception as e:
        print(f"Error initializing model: {e}")
        return None

def chunk_text(text, chunk_size=1000, overlap=100):
    """
    Simple character-based sliding window chunker.
    """
    if not text:
        return []
    
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunks.append(text[start:end])
        
        # If we reached the end, stop
        if end == text_len:
            break
            
        # Move start forward by stride (size - overlap)
        start += (chunk_size - overlap)
        
    return chunks

def cmd_embed(args):
    db_path = get_db_path()
    conn = init_db(db_path)
    
    if args.force:
        print("Force mode: Clearing existing embeddings...")
        conn.execute('DELETE FROM content_vectors')
        conn.execute('DELETE FROM vectors_vec')
        conn.commit()

    # 1. Identify content that needs embedding
    cur = conn.execute('''
        SELECT DISTINCT c.hash, c.doc
        FROM content c
        JOIN documents d ON c.hash = d.hash
        LEFT JOIN content_vectors v ON c.hash = v.hash AND v.seq = 0
        WHERE d.active = 1 AND v.hash IS NULL
    ''')
    
    rows = cur.fetchall()
    count = len(rows)
    print(f"Documents needing embedding: {count}")
    
    if count == 0:
        conn.close()
        return

    if args.dry_run:
        print("Dry run: skipping embedding generation.")
        conn.close()
        return

    # 2. Initialize Model
    llm = get_embedding_model()
    if not llm:
        conn.close()
        return

    print("Generating embeddings (with chunking)...")
    now = datetime.utcnow().isoformat()
    
    processed = 0
    total_chunks = 0
    
    for row in rows:
        content_hash, content_text = row
        
        # Chunk the text
        # Using ~1024 chars (approx 256 tokens) with overlap
        chunks = chunk_text(content_text, chunk_size=1024, overlap=128)
        
        for seq, chunk in enumerate(chunks):
            try:
                embedding = llm.embed(chunk)
                if isinstance(embedding[0], list):
                    embedding = embedding[0]
                    
                vector_bytes = struct.pack(f'{len(embedding)}f', *embedding)
                
                # Insert metadata
                conn.execute('''
                    INSERT OR REPLACE INTO content_vectors (hash, seq, pos, model, embedded_at)
                    VALUES (?, ?, ?, 'nomic-embed', ?)
                ''', (content_hash, seq, 0, now))

                # Insert vector
                pk = f"{content_hash}_{seq}"
                conn.execute('''
                    INSERT OR REPLACE INTO vectors_vec (hash_seq, embedding)
                    VALUES (?, ?)
                ''', (pk, vector_bytes))
                
                total_chunks += 1
                
            except Exception as e:
                print(f"Failed to embed {content_hash} seq {seq}: {e}")

        processed += 1
        if processed % 5 == 0:
            print(f"Processed {processed}/{count} docs ({total_chunks} chunks)...")
            conn.commit()

    conn.commit()
    print(f"Finished. Docs: {processed}, Total Chunks: {total_chunks}")
    conn.close()

def search_vec(conn, query, limit=20, llm=None):
    """Internal vector search function returning list of dicts"""
    if not llm:
        llm = get_embedding_model()
        if not llm:
            return []

    try:
        embedding = llm.embed(query)
        if isinstance(embedding[0], list):
            embedding = embedding[0]
        query_vector = struct.pack(f'{len(embedding)}f', *embedding)
        
        # Group by document path to return unique files
        # We take the MIN distance (best matching chunk)
        cur = conn.execute('''
            SELECT 
                d.path, 
                d.title, 
                MIN(vec_distance_cosine(vv.embedding, ?)) as min_distance
            FROM vectors_vec vv
            JOIN content_vectors cv ON cv.hash || '_' || cv.seq = vv.hash_seq
            JOIN documents d ON d.hash = cv.hash
            WHERE d.active = 1
            GROUP BY d.path
            ORDER BY min_distance ASC
            LIMIT ?
        ''', (query_vector, limit))
        
        return [{'path': r[0], 'title': r[1], 'score': 1.0 - r[2], 'type': 'vec'} for r in cur.fetchall()]
    except Exception as e:
        print(f"Vector search error: {e}")
        return []

def search_fts(conn, query, limit=20):
    """Internal FTS search function returning list of dicts"""
    cur = conn.execute('''
        SELECT filepath, title, rank
        FROM documents_fts
        WHERE documents_fts MATCH ?
        ORDER BY rank
        LIMIT ?
    ''', (query, limit))
    
    # FTS rank is lower = better. We invert it roughly for normalization or just keep as rank.
    # For RRF, we just need the ordered list.
    return [{'path': r[0], 'title': r[1], 'score': r[2], 'type': 'fts'} for r in cur.fetchall()]

def cmd_vsearch(args):
    db_path = get_db_path()
    conn = init_db(db_path)
    
    results = search_vec(conn, args.query, args.limit)
    
    if not results:
        print("No matching documents found.")
    else:
        print(f"Vector search results for: '{args.query}'\n")
        for r in results:
            print(f"{r['score']:.4f}  {r['path']} ({r['title']})")
                
    conn.close()

def cmd_query(args):
    """Hybrid Search using Reciprocal Rank Fusion (RRF)"""
    db_path = get_db_path()
    conn = init_db(db_path)
    
    query = args.query
    
    # 1. Run FTS
    # print("Running keyword search...")
    fts_results = search_fts(conn, query, limit=50)
    
    # 2. Run Vector
    # print("Running semantic search...")
    vec_results = search_vec(conn, query, limit=50)
    
    # 3. Fuse Results (RRF)
    # score = 1 / (k + rank)
    k = 60
    scores = {}
    titles = {}
    
    # Process FTS (Rank is 0-indexed in the list)
    for rank, res in enumerate(fts_results):
        path = res['path']
        titles[path] = res['title']
        scores[path] = scores.get(path, 0) + (1 / (k + rank + 1))
        
    # Process Vec
    for rank, res in enumerate(vec_results):
        path = res['path']
        titles[path] = res['title']
        scores[path] = scores.get(path, 0) + (1 / (k + rank + 1))
        
    # Sort by score DESC
    final_results = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    
    # Display
    print(f"Hybrid search results for: '{query}'\n")
    for i, (path, score) in enumerate(final_results[:args.limit]):
        title = titles[path]
        print(f"{i+1}. {path} ({title}) [RRF: {score:.4f}]")
    
    if not final_results:
        print("No results found.")

    conn.close()

def main():
    parser = argparse.ArgumentParser(description="QMD: Quick MarkDown Indexer (Python Port)")
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Update command
    parser_update = subparsers.add_parser('update', help='Update the index')
    
    # Embed command
    parser_embed = subparsers.add_parser('embed', help='Generate embeddings')
    parser_embed.add_argument('--dry-run', action='store_true', help='Check counts without generating')
    parser_embed.add_argument('--force', action='store_true', help='Force re-embedding of all documents')
    
    # Search command (FTS)
    parser_search = subparsers.add_parser('search', help='Search documents (Keyword/FTS)')
    parser_search.add_argument('query', help='Search query')
    
    # VSearch command (Vector)
    parser_vsearch = subparsers.add_parser('vsearch', help='Search documents (Semantic/Vector)')
    parser_vsearch.add_argument('query', help='Search query')
    parser_vsearch.add_argument('-n', '--limit', type=int, default=10, help='Number of results')

    # Query command (Hybrid)
    parser_query = subparsers.add_parser('query', help='Hybrid Search (FTS + Vector)')
    parser_query.add_argument('query', help='Search query')
    parser_query.add_argument('-n', '--limit', type=int, default=10, help='Number of results')
    
    # Get command
    parser_get = subparsers.add_parser('get', help='Get document content')
    parser_get.add_argument('path', help='Path or partial path to document')
    
    # Status command
    parser_status = subparsers.add_parser('status', help='Show index status')
    
    # List command
    parser_ls = subparsers.add_parser('ls', help='List collections or files')
    parser_ls.add_argument('collection', nargs='?', help='Collection name to list files from')
    
    # Context command
    parser_context = subparsers.add_parser('context', help='Manage contexts')
    context_sub = parser_context.add_subparsers(dest='subcommand')
    
    parser_context_list = context_sub.add_parser('list', help='List contexts')
    
    parser_context_add = context_sub.add_parser('add', help='Add context')
    parser_context_add.add_argument('path', help='Path to add context to')
    parser_context_add.add_argument('text', help='Context text')
    
    parser_context_rem = context_sub.add_parser('remove', help='Remove context')
    parser_context_rem.add_argument('path', help='Path to remove context from')
    
    args = parser.parse_args()
    
    if args.command == 'update':
        cmd_update(args)
    elif args.command == 'embed':
        cmd_embed(args)
    elif args.command == 'search':
        cmd_search(args)
    elif args.command == 'vsearch':
        cmd_vsearch(args)
    elif args.command == 'query':
        cmd_query(args)
    elif args.command == 'get':
        cmd_get(args)
    elif args.command == 'status':
        cmd_status(args)
    elif args.command == 'ls':
        cmd_ls(args)
    elif args.command == 'context':
        cmd_context(args)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()

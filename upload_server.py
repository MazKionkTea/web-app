import os
import uuid
import ast
import re
import time
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from typing import List, Dict
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from llama_cpp import Llama
import chromadb


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Path(CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)
    print("=" * 40)
    print("Upload server is running")
    print("Uploads folder  :", UPLOAD_DIR.resolve())
    print("ChromaDB folder :", Path(CHROMA_PERSIST_DIR).resolve())
    print("Embedding model :", EMBEDDING_MODEL_NAME)
    print("Server          : http://127.0.0.1:8001")
    print("=" * 40)
    yield



app = FastAPI(title="Upload Server", lifespan=lifespan)


UPLOAD_DIR = Path("./uploads")
# ============================================================
# Metadata cache (file_id -> original_filename)
# ============================================================
file_metadata_cache = {}
ALLOWED_EXTENSIONS = {".md", ".txt", ".py"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


# Konfigurasi Chunking
MAX_CHUNK_CHARS = 2000      # ~500 token (1 token ≈ 4 chars)
CHUNK_OVERLAP = 200         # overlap antar chunk (50 token)
MIN_CHUNK_CHARS = 100       # abaikan chunk terlalu kecil


# Embedding & ChromaDB
EMBEDDING_MODEL_NAME = "nomic-embed-text-v2-moe"
CHROMA_PERSIST_DIR = "./chroma_db"
COLLECTION_NAME = "rag_documents"

# Load model embedding (global, load sekali saat startup)
print(f"[INFO] Loading embedding model: {EMBEDDING_MODEL_NAME}...")


EMBEDDING_MODEL_PATH = "./models/nomic-embed-text-v2-moe.Q5_K_M.gguf"
print(f"[INFO] Loading embedding model: {EMBEDDING_MODEL_PATH}...")
embedding_model = Llama(
    model_path=EMBEDDING_MODEL_PATH,
    embedding=True,
    verbose=False,
    n_ctx=2048,
    n_threads=4
)

print(f"[INFO] Embedding model loaded.")

# Setup ChromaDB client (persistent)
chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

# Get or create collection
try:
    collection = chroma_client.get_collection(COLLECTION_NAME)
    print(f"[INFO] ChromaDB collection '{COLLECTION_NAME}' loaded. "
          f"Total documents: {collection.count()}")
except:
    collection = chroma_client.create_collection(COLLECTION_NAME)
    print(f"[INFO] ChromaDB collection '{COLLECTION_NAME}' created.")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================
# Endpoints
# ==========================================================
@app.get("/health")
async def health_check():
    return {"status": "ok"}


def sanitize_filename(filename: str) -> str:
    """Hapus karakter berbahaya dan path traversal."""
    # Hapus karakter yang tidak aman (selain huruf, angka, underscore, dash, dot, spasi)
    safe = re.sub(r'[^\w\-_. ]', '', filename)
    # Hindari path traversal
    safe = safe.replace('..', '').replace('/', '').replace('\\', '')
    # Batasi panjang
    return safe[:100]  # maksimal 100 karakter



@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # 1. Validasi ekstensi
    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .md, .txt, .py files are allowed.")

    # 2. Sanitasi nama asli
    original_name = file.filename
    safe_name = sanitize_filename(original_name)
    if not safe_name:
        safe_name = "unnamed" + extension

    # 3. Buat nama unik (jika ada duplikat, tambahkan counter)
    name_without_ext = Path(safe_name).stem
    ext = Path(safe_name).suffix
    counter = 1
    file_id = safe_name
    while (UPLOAD_DIR / file_id).exists():
        file_id = f"{name_without_ext}_{counter}{ext}"
        counter += 1

    # 4. Baca dan validasi konten
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file not allowed.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 10MB.")

    # 5. Simpan dengan nama asli (sudah unik)
    save_path = UPLOAD_DIR / file_id
    with open(save_path, "wb") as f:
        f.write(content)

    # 6. Simpan metadata (file_id adalah nama file asli yang telah disanitasi)
    file_metadata_cache[file_id] = original_name  # tetap simpan nama asli untuk ditampilkan

    # 7. Return
    return {
        "status": "uploaded",
        "file_id": file_id,            # <- nama file di folder
        "original_filename": original_name,  # nama asli yang dikirim user
        "extension": extension,
        "size": len(content),
    }


# ==========================================================
# CHUNKING FUNCTIONS
# ==========================================================

def estimate_tokens(text: str) -> int:
    """Estimasi kasar jumlah token (1 token ≈ 4 karakter)."""
    return len(text) // 4


def create_chunk(
    chunk_index: int,
    text: str,
    source_file: str,
    file_type: str,
    chunk_type: str,
    chunk_name: str = "",
    line_start: int = 0,
    line_end: int = 0
) -> dict:
    """Buat chunk dict dengan metadata lengkap."""
    return {
        "chunk_id": f"{Path(source_file).stem}_{chunk_index:04d}",
        "chunk_index": chunk_index,
        "text": text.strip(),
        "source_file": source_file,
        "file_type": file_type,
        "chunk_type": chunk_type,
        "chunk_name": chunk_name,
        "line_start": line_start,
        "line_end": line_end,
        "token_estimate": estimate_tokens(text)
    }


def chunk_python_code(file_path: Path) -> List[dict]:
    """
    Chunk file Python (.py) berdasarkan fungsi dan class.
    Kode ASLI dipertahankan, TIDAK dikonversi ke Markdown.
    """
    source = file_path.read_text(encoding="utf-8")
    source_lines = source.splitlines(keepends=True)
    chunks = []
    
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # Fallback ke generic chunking
        return chunk_by_size(source, file_path, "python", "generic")
    
    chunk_idx = 0
    
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            chunk_idx += 1
            start = node.lineno - 1
            end = node.end_lineno
            text = "".join(source_lines[start:end])
            
            chunks.append(create_chunk(
                chunk_index=chunk_idx,
                text=text,
                source_file=file_path.name,
                file_type="python",
                chunk_type="function",
                chunk_name=node.name,
                line_start=start + 1,
                line_end=end
            ))
            
        elif isinstance(node, ast.ClassDef):
            chunk_idx += 1
            start = node.lineno - 1
            end = node.end_lineno
            text = "".join(source_lines[start:end])
            
            chunks.append(create_chunk(
                chunk_index=chunk_idx,
                text=text,
                source_file=file_path.name,
                file_type="python",
                chunk_type="class",
                chunk_name=node.name,
                line_start=start + 1,
                line_end=end
            ))
    
    # Kalau tidak ada fungsi/class, chunk whole file
    if not chunks:
        chunk_idx = 1
        chunks.append(create_chunk(
            chunk_index=chunk_idx,
            text=source,
            source_file=file_path.name,
            file_type="python",
            chunk_type="script",
            chunk_name="full_script",
            line_start=1,
            line_end=len(source_lines)
        ))
    
    return chunks


def chunk_markdown_heading(file_path: Path) -> List[dict]:
    """
    Chunk file Markdown (.md) berdasarkan heading (#, ##, ###, dst).
    Teks Markdown asli dipertahankan.
    """
    source = file_path.read_text(encoding="utf-8")
    lines = source.splitlines(keepends=True)
    chunks = []
    
    heading_pattern = re.compile(r'^(#{1,6})\s+(.+)$')
    section_starts = []
    
    for i, line in enumerate(lines):
        match = heading_pattern.match(line.strip())
        if match:
            level = len(match.group(1))
            title = match.group(2).strip()
            section_starts.append((i, level, title))
    
    if not section_starts:
        return chunk_by_size(source, file_path, "markdown", "full_document")
    
    chunk_idx = 0
    
    for idx, (start_line, level, title) in enumerate(section_starts):
        if idx + 1 < len(section_starts):
            end_line = section_starts[idx + 1][0]
        else:
            end_line = len(lines)
        
        section_text = "".join(lines[start_line:end_line]).strip()
        
        if len(section_text) < MIN_CHUNK_CHARS:
            continue
        
        if len(section_text) > MAX_CHUNK_CHARS:
            sub_chunks = split_text_with_overlap(section_text, MAX_CHUNK_CHARS, CHUNK_OVERLAP)
            for sub_text in sub_chunks:
                chunk_idx += 1
                chunks.append(create_chunk(
                    chunk_index=chunk_idx,
                    text=sub_text,
                    source_file=file_path.name,
                    file_type="markdown",
                    chunk_type=f"h{level}",
                    chunk_name=title,
                    line_start=start_line + 1,
                    line_end=end_line
                ))
        else:
            chunk_idx += 1
            chunks.append(create_chunk(
                chunk_index=chunk_idx,
                text=section_text,
                source_file=file_path.name,
                file_type="markdown",
                chunk_type=f"h{level}",
                chunk_name=title,
                line_start=start_line + 1,
                line_end=end_line
            ))
    
    return chunks


def chunk_text_paragraph(file_path: Path) -> List[dict]:
    """
    Chunk file teks (.txt) berdasarkan ukuran dengan overlap.
    """
    source = file_path.read_text(encoding="utf-8")
    return chunk_by_size(source, file_path, "text", "paragraph")


def chunk_by_size(text: str, file_path: Path, file_type: str, chunk_type: str) -> List[dict]:
    """
    Fallback: chunk berdasarkan ukuran karakter dengan overlap.
    """
    chunks = []
    chunk_idx = 0
    start = 0
    
    while start < len(text):
        chunk_idx += 1
        end = min(start + MAX_CHUNK_CHARS, len(text))
        
        if end < len(text):
            while end > start and text[end - 1] not in (' ', '\n', '\t', '.', '!', '?'):
                end -= 1
        
        chunk_text = text[start:end].strip()
        
        if chunk_text and len(chunk_text) >= MIN_CHUNK_CHARS:
            chunks.append(create_chunk(
                chunk_index=chunk_idx,
                text=chunk_text,
                source_file=file_path.name,
                file_type=file_type,
                chunk_type=chunk_type,
                chunk_name="",
                line_start=0,
                line_end=0
            ))
        
        start = end - CHUNK_OVERLAP
        if start >= len(text):
            break
    
    return chunks


def chunk_generic_fallback(file_path: Path) -> List[dict]:
    """
    Fallback untuk file yang tidak punya chunker khusus.
    """
    source = file_path.read_text(encoding="utf-8")
    return chunk_by_size(source, file_path, file_path.suffix[1:], "generic")


def split_text_with_overlap(text: str, max_chars: int, overlap: int) -> List[str]:
    """
    Split teks besar menjadi bagian-bagian dengan overlap.
    """
    parts = []
    start = 0
    
    while start < len(text):
        end = min(start + max_chars, len(text))
        
        if end < len(text):
            while end > start and text[end - 1] not in (' ', '\n', '\t', '.', '!', '?'):
                end -= 1
        
        parts.append(text[start:end].strip())
        start = end - overlap
        
        if start >= len(text):
            break
    
    return parts if parts else [text]


# Chunker dispatcher
CHUNK_STRATEGIES = {
    ".py": chunk_python_code,
    ".md": chunk_markdown_heading,
    ".txt": chunk_text_paragraph,
}


def chunk_file(file_path: Path) -> List[dict]:
    """
    Dispatch ke chunker yang sesuai berdasarkan ekstensi file.
    """
    extension = file_path.suffix.lower()
    
    if extension in CHUNK_STRATEGIES:
        return CHUNK_STRATEGIES[extension](file_path)
    
    return chunk_generic_fallback(file_path)


# ==========================================================
# EMBEDDING FUNCTIONS
# ==========================================================

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings untuk list teks menggunakan model lokal.
    Return list of vectors.
    """
    embeddings = embedding_model.embed(texts)
    return embeddings


async def save_chunks_to_chromadb(chunks: List[dict], file_id: str, original_filename: str = "") -> dict:
    """
    Simpan chunks + embeddings ke ChromaDB.
    """
    if not chunks:
        return {"status": "no_chunks", "stored": 0}
    
    # Prepare data untuk ChromaDB
    ids = [c["chunk_id"] for c in chunks]
    texts = [c["text"] for c in chunks]
    metadatas = [
        {
            "source_file": c["source_file"],
            "original_filename": original_filename,
            "file_type": c["file_type"],
            "chunk_type": c["chunk_type"],
            "chunk_name": c["chunk_name"],
            "line_start": c["line_start"],
            "line_end": c["line_end"],
            "file_id": file_id,
        }
        for c in chunks
    ]
    
    # Generate embeddings
    print(f"[INFO] Generating embeddings for {len(texts)} chunks...")
    embeddings = await asyncio.to_thread(generate_embeddings, texts)
    print(f"[INFO] Embeddings generated.")
    
    # Cek apakah sudah ada data dari file yang sama
    existing = collection.get(where={"file_id": file_id})
    if existing["ids"]:
        print(f"[INFO] Deleting {len(existing['ids'])} existing chunks for file_id={file_id}")
        collection.delete(ids=existing["ids"])
    
    # Simpan ke ChromaDB
    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas
    )
    
    print(f"[INFO] Stored {len(ids)} chunks to ChromaDB.")
    
    return {
        "status": "stored",
        "stored_count": len(ids),
        "collection_total": collection.count()
    }


# ==========================================================
# ENDPOINT: Process File (Chunking)
# ==========================================================

@app.post("/process/{file_id}")
async def process_file(file_id: str):
    """
    Proses file yang sudah diupload: chunking sesuai tipe file.
    Return chunks dengan metadata lengkap.
    """
    file_path = UPLOAD_DIR / file_id
    
    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"File '{file_id}' not found. Upload first."
        )
    
    try:
        chunks = chunk_file(file_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chunking failed: {str(e)}"
        )
    
    total_tokens = sum(c["token_estimate"] for c in chunks)
    preview = [{"name": c["chunk_name"], "type": c["chunk_type"]} for c in chunks[:10]]
    
    return {
        "status": "processed",
        "file_id": file_id,
        "total_chunks": len(chunks),
        "total_tokens_estimate": total_tokens,
        "chunks": chunks,
        "summary": {
            "file_type": file_path.suffix,
            "chunk_preview": preview,
            "avg_chunk_tokens": total_tokens // len(chunks) if chunks else 0
        }
    }


@app.post("/upload-and-process")
async def upload_and_process(file: UploadFile = File(...)):
    """
    Upload file DAN langsung proses chunking.
    """
    upload_result = await upload_file(file)
    process_result = await process_file(upload_result["file_id"])
    
    return {
        "upload": upload_result,
        "processing": process_result
    }


# ==========================================================
# ENDPOINT: Embed File (Chunk + Embed + Store)
# ==========================================================

@app.post("/embed/{file_id}")
async def embed_file(file_id: str):
    """
    Proses file lengkap: chunking → embedding → simpan ke ChromaDB.
    """
    # 1. Process chunking dulu
    process_result = await process_file(file_id)
    
    if process_result["total_chunks"] == 0:
        raise HTTPException(
            status_code=400,
            detail="No chunks generated from file."
        )
    
    # 2. Simpan ke ChromaDB
    try:
        # Ambil nama asli dari cache, fallback ke string kosong jika tidak ada
        original_filename = file_metadata_cache.get(file_id, "")

        store_result = await save_chunks_to_chromadb(
            process_result["chunks"],
            file_id,
            original_filename = original_filename
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Embedding failed: {str(e)}"
        )
    
    return {
        "status": "embedded",
        "file_id": file_id,
        "chunks_processed": process_result["total_chunks"],
        "tokens_estimate": process_result["total_tokens_estimate"],
        "stored_in_chromadb": store_result["stored_count"],
        "collection_total_docs": store_result["collection_total"]
    }


@app.post("/upload-process-embed")
async def upload_process_embed(file: UploadFile = File(...)):
    """
    Upload → Chunk → Embed → Store dalam satu request.
    """
    # Upload
    upload_result = await upload_file(file)
    file_id = upload_result["file_id"]
    
    # Process (chunking)
    process_result = await process_file(file_id)
    
    # Embed + store
    store_result = await save_chunks_to_chromadb(
        process_result["chunks"],
        file_id,
        upload_result["original_filename"]
    )
    
    return {
        "upload": upload_result,
        "processing": {
            "total_chunks": process_result["total_chunks"],
            "total_tokens_estimate": process_result["total_tokens_estimate"],
        },
        "storage": store_result
    }


@app.get("/collection/info")
async def get_collection_info():
    """
    Info tentang collection ChromaDB.
    """
    return {
        "collection_name": COLLECTION_NAME,
        "total_documents": collection.count(),
        "embedding_model": EMBEDDING_MODEL_NAME,
        "persist_directory": CHROMA_PERSIST_DIR
    }


# ==========================================================
# ENDPOINT: Query RAG
# ==========================================================

@app.post("/query")
async def query_rag(query_data: dict):
    """
    Query RAG: generate embedding dari query, cari di ChromaDB,
    return chunks yang paling relevan.
    
    Request body:
    {
        "query": "teks pertanyaan",
        "top_k": 3  // optional, default 3
    }
    """
    query_text = query_data.get("query", "").strip()
    top_k = query_data.get("top_k", 3)
    
    if not query_text:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    
    if collection.count() == 0:
        return {
            "query": query_text,
            "results": [],
            "message": "No documents in collection. Upload files first."
        }
    
    try:
        # Generate embedding untuk query
        query_embedding = (await asyncio.to_thread(generate_embeddings, [query_text]))[0]
        
        # Search di ChromaDB
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            include=["documents", "metadatas", "distances"]
        )
        
        # Format hasil
        formatted_results = []
        if results["ids"] and results["ids"][0]:
            for i in range(len(results["ids"][0])):
                similarity = 1 - results["distances"][0][i]  # convert distance ke similarity
                formatted_results.append({
                    "chunk_id": results["ids"][0][i],
                    "text": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "similarity_score": round(similarity, 4)
                })
        
        return {
            "query": query_text,
            "top_k": top_k,
            "total_results": len(formatted_results),
            "results": formatted_results
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Query failed: {str(e)}"
        )


@app.post("/query-file")
async def query_specific_file(query_data: dict):
    """
    Query RAG dalam file tertentu.
    
    Request body:
    {
        "query": "teks pertanyaan",
        "file_id": "a1b2c3d4.py",
        "top_k": 3
    }
    """
    query_text = query_data.get("query", "").strip()
    file_id = query_data.get("file_id", "").strip()
    top_k = query_data.get("top_k", 3)
    
    if not query_text:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    
    if not file_id:
        raise HTTPException(status_code=400, detail="file_id is required.")
    
    if collection.count() == 0:
        return {
            "query": query_text,
            "file_id": file_id,
            "results": [],
            "message": "No documents in collection."
        }
    
    try:
        query_embedding = (await asyncio.to_thread(generate_embeddings, [query_text]))[0]
        
        # Search dengan filter file_id
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            where={"file_id": file_id},
            include=["documents", "metadatas", "distances"]
        )
        
        formatted_results = []
        if results["ids"] and results["ids"][0]:
            for i in range(len(results["ids"][0])):
                similarity = 1 - results["distances"][0][i]
                formatted_results.append({
                    "chunk_id": results["ids"][0][i],
                    "text": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "similarity_score": round(similarity, 4)
                })
        
        return {
            "query": query_text,
            "file_id": file_id,
            "top_k": top_k,
            "total_results": len(formatted_results),
            "results": formatted_results
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Query failed: {str(e)}"
        )


# ==========================================================
# ENDPOINT: Chat with RAG
# ==========================================================

@app.post("/chat-with-rag")
async def chat_with_rag(chat_data: dict):
    """
    Chat dengan RAG: retrieve konteks dari ChromaDB, gabung ke prompt, kirim ke LLM.
    
    Request body:
    {
        "messages": [{"role": "user", "content": "pertanyaan"}],
        "top_k": 3,          // optional, jumlah chunk yang di-retrieve
        "temperature": 0.7,  // optional
        "max_tokens": 4096   // optional
    }
    """
    messages = chat_data.get("messages", [])
    top_k = chat_data.get("top_k", 3)
    temperature = chat_data.get("temperature", 0.7)
    max_tokens = chat_data.get("max_tokens", 4096)
    
    if not messages:
        raise HTTPException(status_code=400, detail="Messages cannot be empty.")
    
    # Ambil pesan terakhir user sebagai query
    user_query = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_query = msg.get("content", "")
            break
    
    if not user_query:
        raise HTTPException(status_code=400, detail="No user message found.")
    
    # Retrieve chunks dari ChromaDB (kalau ada dokumen)
    context = ""
    sources = []
    
    if collection.count() > 0:
        try:
            query_embedding = (await asyncio.to_thread(generate_embeddings, [user_query]))[0]
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=min(top_k, collection.count()),
                include=["documents", "metadatas", "distances"]
            )
            
            if results["ids"] and results["ids"][0]:
                for i in range(len(results["ids"][0])):
                    similarity = 1 - results["distances"][0][i]
                    chunk_text = results["documents"][0][i]
                    metadata = results["metadatas"][0][i]

                    # Ambil nama asli file (jika ada), fallback ke source_file
                    original_name = metadata.get("original_filename", metadata.get("source_file", "unknown"))

                    # Batasi panjang chunk dalam konteks (max 500 karakter)
                    chunk_preview = chunk_text[:500]
                    if len(chunk_text) > 500:
                        chunk_preview += "..."
                    
                    context += f"--- Sumber: {original_name} "
                    context += f"(relevansi: {similarity:.2f}) ---\n"
                    context += chunk_preview + "\n\n"
                    
                    sources.append({
                        "file": original_name,
                        "chunk_name": metadata.get("chunk_name", ""),
                        "similarity": round(similarity, 4)
                    })

                # Batasi total panjang konteks (max 2000 karakter)
                if len(context) > 2000:
                    context = context[:2000] + "\n... (konteks dipotong)\n"
                    
        except Exception as e:
            print(f"[WARNING] Retrieval failed: {e}")
    
    # Bangun system prompt dengan konteks
    system_prompt = ""
    if context:
        system_prompt = (
            "Kamu adalah AI assistant. Gunakan KONTEKS di bawah ini untuk menjawab pertanyaan user. "
            "Jika konteks tidak relevan, jawab berdasarkan pengetahuanmu.\n\n"
            f"=== KONTEKS ===\n{context}\n=== AKHIR KONTEKS ==="
        )
    
    # Gabung messages dengan system prompt
    llm_messages = []
    if system_prompt:
        llm_messages.append({"role": "system", "content": system_prompt})
    
    # Filter hanya role yang valid untuk LLM
    for msg in messages:
        if msg.get("role") in ("user", "assistant"):
            llm_messages.append(msg)
    
    # Kirim ke llama-server
    LLAMA_SERVER = "http://localhost:8080"
    
    try:
        import aiohttp
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{LLAMA_SERVER}/v1/chat/completions",
                json={
                    "model": "local-model",
                    "messages": llm_messages,
                    "stream": False,  # Non-streaming dulu untuk simpel
                    "temperature": temperature,
                    "max_tokens": max_tokens
                },
                timeout=aiohttp.ClientTimeout(total=300)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(
                        status_code=502,
                        detail=f"LLM server error: {response.status} - {error_text[:200]}"
                    )
                
                llm_response = await response.json()
                answer = llm_response.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                return {
                    "answer": answer,
                    "sources": sources,
                    "context_used": len(sources) > 0,
                    "model": "local-model"
                }
                
    except ImportError:
        # Fallback kalau aiohttp tidak terinstall
        import urllib.request
        import json as json_mod
        
        req_data = json_mod.dumps({
            "model": "local-model",
            "messages": llm_messages,
            "stream": False,
            "temperature": temperature,
            "max_tokens": max_tokens
        }).encode("utf-8")
        
        req = urllib.request.Request(
            f"{LLAMA_SERVER}/v1/chat/completions",
            data=req_data,
            headers={"Content-Type": "application/json"}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                llm_response = json_mod.loads(resp.read().decode("utf-8"))
                answer = llm_response.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                return {
                    "answer": answer,
                    "sources": sources,
                    "context_used": len(sources) > 0,
                    "model": "local-model"
                }
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"LLM server error: {str(e)}"
            )


@app.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """
    Hapus file dari folder uploads/ dan dari ChromaDB.
    """
    file_path = UPLOAD_DIR / file_id
    chunks_removed = 0

    # Hapus dari ChromaDB
    existing = None
    try:
        existing = collection.get(where={"file_id": file_id})
        if existing["ids"]:
            collection.delete(ids=existing["ids"])
            chunks_removed = len(existing["ids"])
            print(f"[INFO] Deleted {chunks_removed} chunks from ChromaDB for file_id={file_id}")
    except Exception as e:
        print(f"[WARNING] Failed to delete from ChromaDB: {e}")

    # Hapus dari folder uploads
    if file_path.exists():
        file_path.unlink()
        # Hapus dari cache metadata
        file_metadata_cache.pop(file_id, None)
        return {
            "status": "deleted",
            "file_id": file_id,
            "chromadb_chunks_removed": chunks_removed
        }
    else:
        return {
            "status": "not_found",
            "file_id": file_id,
            "message": "File not found on disk, but ChromaDB cleaned.",
            "chromadb_chunks_removed": chunks_removed
        }

# ==========================================================
# Run
# ==========================================================
if __name__ == "__main__":
    import uvicorn
    
    PORT = int(os.getenv("PORT", 8001))
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
    )
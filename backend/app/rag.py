import os
import re
import uuid
from typing import List, Optional, Dict, Any

import httpx
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Embeddings & Vector store (all local, free)
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
from .vector_store import SupabaseVectorStore

# Text extraction
from pypdf import PdfReader
from docx import Document as DocxDocument
import logging

# Simple splitter


def _default_store_dir() -> str:
    base = os.path.join(os.path.dirname(__file__), '..', '..', 'rag_store')
    return os.path.abspath(base)


class RAGSettings(BaseSettings):
    # Paths/collections
    store_dir: str = Field(default_factory=_default_store_dir)
    embed_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    collection_name: str = "student_docs"
    # Chunking
    chunk_size: int = 850                # RAG_CHUNK_SIZE
    chunk_overlap: int = 150              # RAG_CHUNK_OVERLAP
    # Backends/providers
    store_backend: str = "chroma"        # chroma | supabase
    embed_provider: str = "local"        # local | openai | gemini
    llm_provider: str = "none"           # none | ollama | openai | gemini
    # Re-ranking
    rerank: bool = False
    rerank_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    # OpenAI
    openai_api_key: Optional[str] = None
    openai_embed_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-4o-mini"
    # Gemini
    gemini_api_key: Optional[str] = None
    gemini_embed_model: str = "models/text-embedding-004"
    gemini_chat_model: str = "gemini-1.5-flash"

    # Load env from backend/.env, case-insensitive, ignore extras
    _env_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
    model_config = SettingsConfigDict(env_file=_env_file, case_sensitive=False, extra="ignore")


class RAGEngine:
    _model: Optional[SentenceTransformer] = None
    _client: Optional[chromadb.Client] = None
    _collection: Optional[Any] = None
    _svs: Optional[SupabaseVectorStore] = None
    _cross_encoder: Any = None

    def __init__(self, settings: Optional[RAGSettings] = None) -> None:
        self.settings = settings or RAGSettings()
        os.makedirs(self.settings.store_dir, exist_ok=True)
        logging.getLogger("rag").info(
            "RAG init: store_backend=%s embed_provider=%s llm_provider=%s",
            self.settings.store_backend,
            self.settings.embed_provider,
            self.settings.llm_provider,
        )
        if self.settings.store_backend == "chroma":
            self._client = chromadb.PersistentClient(
                path=self.settings.store_dir,
                settings=Settings(anonymized_telemetry=False),
            )
            self._collection = self._client.get_or_create_collection(
                name=self.settings.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        else:
            self._svs = SupabaseVectorStore()

    def _emb_model(self) -> SentenceTransformer:
        if self._model is None:
            # Will download the model once and cache locally
            self._model = SentenceTransformer(self.settings.embed_model_name)
        return self._model

    def _embed_texts(self, texts: List[str]) -> List[List[float]]:
        provider = (self.settings.embed_provider or "local").lower()
        if provider == "openai":
            from openai import OpenAI
            if not self.settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY is required for OpenAI embeddings")
            client = OpenAI(api_key=self.settings.openai_api_key)
            model = self.settings.openai_embed_model
            # OpenAI expects one input per call to get batching; we'll batch via single request if supported
            resp = client.embeddings.create(model=model, input=texts)
            return [d.embedding for d in resp.data]
        elif provider == "gemini":
            import google.generativeai as genai
            if not self.settings.gemini_api_key:
                raise RuntimeError("GEMINI_API_KEY is required for Gemini embeddings")
            genai.configure(api_key=self.settings.gemini_api_key)
            # text-embedding-004 uses embed_content API
            out: List[List[float]] = []
            for t in texts:
                resp = genai.embed_content(model=self.settings.gemini_embed_model, content=t)
                vec = resp.get("embedding") if isinstance(resp, dict) else None  # type: ignore
                # Some versions return {"embedding": {"values": [...]}}
                if isinstance(vec, dict):
                    vec = vec.get("values") or vec.get("embedding")
                if not isinstance(vec, list):
                    raise RuntimeError("Gemini embed_content returned unexpected shape")
                out.append([float(x) for x in vec])
            return out
        else:
            return self._emb_model().encode(texts, normalize_embeddings=True).tolist()

    # -------- Ingestion --------
    def index_document(self, *,
                        document_id: str,
                        subject_id: Optional[str],
                        user_id: Optional[str],
                        file_bytes: bytes,
                        file_name: str,
                        extra_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        logger = logging.getLogger("rag")
        logger.info("[RAG] Index start doc_id=%s subject_id=%s user_id=%s file=%s", document_id, subject_id, user_id, file_name)
        # Update job: starting -> chunking
        try:
            from .rag_jobs import job_store
            job_store.update(document_id, stage="chunking", progress=10, message="Đang tách đoạn (chunking)")
        except Exception:
            pass
        text = self._extract_text(file_bytes=file_bytes, file_name=file_name)
        if not text.strip():
            logger.warning("[RAG] Index skip doc_id=%s: no text extracted", document_id)
            try:
                from .rag_jobs import job_store
                job_store.fail(document_id, "Không trích xuất được nội dung")
            except Exception:
                pass
            return {"ok": False, "chunks": 0, "message": "No text extracted"}
        chunks = self._split_text(text)
        logger.info("[RAG] Index chunked doc_id=%s chunks=%d chunk_size=%s overlap=%s", document_id, len(chunks), self.settings.chunk_size, self.settings.chunk_overlap)
        try:
            from .rag_jobs import job_store
            job_store.update(document_id, stage="embedding", progress=40, message=f"Đang tạo embedding cho {len(chunks)} đoạn")
        except Exception:
            pass
        ids = []
        metadatas = []
        documents = []
        for i, chunk in enumerate(chunks):
            ids.append(f"{document_id}-{i}-{uuid.uuid4().hex[:8]}")
            # Standardize metadata per chunk
            meta = {
                "document_id": str(document_id),
                "subject_id": subject_id or "",
                "user_id": user_id or "",
                "file_name": file_name,
            }
            # derive file extension and source type
            try:
                lower = (file_name or "").lower()
                ext = lower.split('.')[-1] if '.' in lower else ''
                if ext:
                    meta["file_ext"] = ext
            except Exception:
                pass
            if isinstance(extra_metadata, dict):
                # allow: tags (list[str]), author (str), created_at (iso/ts), file_url (str)
                for k in ("tags", "author", "created_at", "file_url"):
                    if k in extra_metadata:
                        meta[k] = extra_metadata[k]
                # set source based on file_url presence
                try:
                    meta["source"] = "url" if (extra_metadata.get("file_url") or "") else "local"
                except Exception:
                    pass
            metadatas.append(meta)
            documents.append(chunk)
        # Compute embeddings with explicit failure reporting
        try:
            embeddings = self._embed_texts(documents)
        except Exception as e:
            logger.exception("[RAG] Embedding failed doc_id=%s error=%s", document_id, e)
            try:
                from .rag_jobs import job_store
                job_store.fail(document_id, f"Tạo embedding thất bại: {e}")
            except Exception:
                pass
            raise
        try:
            dim = len(embeddings[0]) if embeddings and isinstance(embeddings[0], list) else None
        except Exception:
            dim = None
        logger.info("[RAG] Index embeddings computed doc_id=%s provider=%s dim=%s", document_id, self.settings.embed_provider, dim)
        if self.settings.store_backend == "chroma":
            try:
                self._collection.add(ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings)
                logger.info("[RAG] Index stored (chroma) doc_id=%s chunks=%d", document_id, len(chunks))
            except Exception as e:
                logger.exception("[RAG] Index store failed (chroma) doc_id=%s error=%s", document_id, e)
                try:
                    from .rag_jobs import job_store
                    job_store.fail(document_id, f"Lưu vào Chroma thất bại: {e}")
                except Exception:
                    pass
                raise
        else:
            # Supabase pgvector storage
            try:
                try:
                    from .rag_jobs import job_store
                    job_store.update(document_id, stage="storing", progress=70, message="Đang lưu embeddings vào vector store")
                except Exception:
                    pass
                self._svs.add_chunks(
                    document_id=document_id,
                    subject_id=subject_id,
                    user_id=user_id,
                    file_name=file_name,
                    chunks=documents,
                    embeddings=embeddings,
                )
            except Exception as e:
                # Bubble up with context so caller can log
                logger.exception("[RAG] Index store failed (supabase) doc_id=%s error=%s", document_id, e)
                try:
                    from .rag_jobs import job_store
                    job_store.fail(document_id, f"Lưu vào Supabase thất bại: {e}")
                except Exception:
                    pass
                raise RuntimeError(f"RAG Supabase add_chunks failed for document {document_id}: {e}")
        logger.info("[RAG] Index success doc_id=%s chunks=%d", document_id, len(chunks))
        try:
            from .rag_jobs import job_store
            job_store.success(document_id)
        except Exception:
            pass
        return {"ok": True, "chunks": len(chunks)}

    async def index_document_from_url(self, *,
                                      document_id: str,
                                      subject_id: Optional[str],
                                      user_id: Optional[str],
                                      url: str,
                                      file_name: Optional[str] = None,
                                      extra_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.content
        name = file_name or url.split("?")[0].split("/")[-1] or "file.bin"
        return self.index_document(document_id=document_id, subject_id=subject_id, user_id=user_id, file_bytes=content, file_name=name, extra_metadata=extra_metadata)

    # -------- Retrieval & QA --------
    def retrieve(self, query: str, *, top_k: int = 5, subject_id: Optional[str] = None, subject_ids: Optional[List[str]] = None, user_id: Optional[str] = None, tags: Optional[List[str]] = None, author: Optional[str] = None, time_from: Optional[str] = None, time_to: Optional[str] = None, source: Optional[str] = None, file_type: Optional[str] = None, page_from: Optional[int] = None, page_to: Optional[int] = None) -> List[Dict[str, Any]]:
        logger = logging.getLogger("rag")
        backend = self.settings.store_backend
        logger.info("[RAG] Retrieve start backend=%s top_k=%s subj=%s user=%s", backend, top_k, subject_id, user_id)
        if backend == "chroma":
            if not self._collection:
                raise RuntimeError("Chroma collection not initialized")
            where: Dict[str, Any] = {}
            try:
                # Subject filter (single or multi)
                if subject_ids:
                    where["subject_id"] = {"$in": subject_ids}
                elif subject_id is not None:
                    where["subject_id"] = subject_id
                if author:
                    where["author"] = author
                if tags:
                    # require any overlap
                    where["tags"] = {"$in": tags}
                if source in ("local", "url"):
                    where["source"] = source
                if file_type:
                    # rely on file_ext metadata set at index time
                    where["file_ext"] = file_type.lower()
                # time range: created_at comparable if stored as ISO string; $gte/$lte work lexicographically
                time_clause: Dict[str, Any] = {}
                if time_from:
                    time_clause["$gte"] = time_from
                if time_to:
                    time_clause["$lte"] = time_to
                if time_clause:
                    where["created_at"] = time_clause
                # page range filter if per-chunk page metadata exists
                if page_from is not None or page_to is not None:
                    p: Dict[str, Any] = {}
                    if page_from is not None:
                        p["$gte"] = page_from
                    if page_to is not None:
                        p["$lte"] = page_to
                    where["page"] = p
            except Exception:
                pass
            try:
                query_emb = self._embed_texts([query])[0]
                results = self._collection.query(
                    query_embeddings=[query_emb],
                    n_results=max(1, min(top_k, 20)),
                    where=where or None,
                )
            except Exception as e:
                logger.exception("[RAG] Retrieve failed (chroma) error=%s", e)
                raise
            outs: List[Dict[str, Any]] = []
            docs = results.get("documents", [[]])[0]
            metas = results.get("metadatas", [[]])[0]
            dists = results.get("distances", [[]])[0]
            for d, m, dist in zip(docs, metas, dists):
                # Enrich citation structure
                url = (m or {}).get("file_url") if isinstance(m, dict) else None
                title = (m or {}).get("file_name") if isinstance(m, dict) else None
                page = (m or {}).get("page") if isinstance(m, dict) else None
                outs.append({
                    "text": d,
                    "metadata": m,
                    "score": float(1 - dist) if dist is not None else None,
                    "citation": {"title": title, "url": url, "page": page, "snippet": d},
                })
            outs = self._maybe_rerank(query, outs, top_k)
            logger.info("[RAG] Retrieve success backend=chroma results=%d", len(outs))
            return outs
        else:
            try:
                q_emb = self._embed_texts([query])[0]
                outs = self._svs.query(query_embedding=q_emb, top_k=top_k, subject_id=subject_id, user_id=user_id)
                # Enrich with document metadata for filtering and citation
                try:
                    from .supabase_client import get_supabase
                    sb = get_supabase()
                    doc_ids = sorted({m.get("document_id") for m in (o.get("metadata") or {} for o in outs) if m.get("document_id") is not None})
                    doc_meta: Dict[Any, Dict[str, Any]] = {}
                    if doc_ids:
                        res = sb.table("documents").select("id,author,tags,created_at,file_url,subject_id,name,file_path").in_("id", doc_ids).execute()
                        for row in res.data or []:
                            doc_meta[row["id"]] = row
                    # attach and filter
                    filtered: List[Dict[str, Any]] = []
                    for o in outs:
                        m = o.get("metadata") or {}
                        did = m.get("document_id")
                        drow = doc_meta.get(did) if did in doc_meta else None
                        if drow:
                            m["author"] = drow.get("author")
                            m["tags"] = drow.get("tags") or []
                            m["created_at"] = drow.get("created_at")
                            m["file_url"] = drow.get("file_url")
                            m["subject_id"] = drow.get("subject_id") or m.get("subject_id")
                            # infer file_ext/source from name/url
                            try:
                                fname = (drow.get("file_path") or drow.get("name") or "").lower()
                                ext = fname.split('.')[-1] if '.' in fname else ''
                                if ext:
                                    m["file_ext"] = ext
                            except Exception:
                                pass
                            try:
                                m["source"] = "url" if (m.get("file_url") or "") else "local"
                            except Exception:
                                pass
                        # apply filters
                        if author and (m.get("author") or "") != author:
                            continue
                        if tags:
                            mtags = m.get("tags") or []
                            if not any(t in (mtags or []) for t in tags):
                                continue
                        if time_from or time_to:
                            ts = m.get("created_at")
                            if isinstance(ts, str):
                                if time_from and ts < time_from:
                                    continue
                                if time_to and ts > time_to:
                                    continue
                        if source in ("local", "url"):
                            if (m.get("source") or "") != source:
                                continue
                        if file_type:
                            if (m.get("file_ext") or "").lower() != file_type.lower():
                                continue
                        if subject_ids and (m.get("subject_id") or "") not in set(subject_ids):
                            continue
                        # page range best-effort if chunk page present
                        if (page_from is not None or page_to is not None) and (m.get("page") is not None):
                            try:
                                p = int(m.get("page"))
                                if page_from is not None and p < page_from:
                                    continue
                                if page_to is not None and p > page_to:
                                    continue
                            except Exception:
                                pass
                        # build citation
                        o["citation"] = {
                            "title": m.get("file_name"),
                            "url": m.get("file_url"),
                            "page": m.get("page"),
                            "snippet": o.get("text"),
                        }
                        filtered.append(o)
                    outs = filtered
                except Exception:
                    # best effort; fall back to simple citation
                    for o in outs:
                        m = o.get("metadata") or {}
                        o["citation"] = {
                            "title": m.get("file_name"),
                            "url": m.get("file_url"),
                            "page": m.get("page"),
                            "snippet": o.get("text"),
                        }
                outs = self._maybe_rerank(query, outs, top_k)
                logger.info("[RAG] Retrieve success backend=supabase results=%d", len(outs))
                return outs
            except Exception as e:
                logger.exception("[RAG] Retrieve failed (supabase) error=%s", e)
                raise

    def answer(self, query: str, contexts: List[str]) -> str:
        provider = (self.settings.llm_provider or "none").lower()
        prompt = (
            "Bạn là trợ lý hữu ích. Chỉ sử dụng NGỮ CẢNH được cung cấp để trả lời. "
            "Nếu không có trong ngữ cảnh, hãy nói bạn không biết. Trả lời bằng TIẾNG VIỆT.\n\n"
            f"Câu hỏi: {query}\n\n"
            "Ngữ cảnh:\n" + "\n---\n".join(contexts) + "\n\nTrả lời:"
        )
        if provider == "openai":
            try:
                from openai import OpenAI
                if not self.settings.openai_api_key:
                    raise RuntimeError("OPENAI_API_KEY is required for OpenAI LLM")
                client = OpenAI(api_key=self.settings.openai_api_key)
                r = client.chat.completions.create(model=self.settings.openai_chat_model, messages=[{"role": "user", "content": prompt}])
                return (r.choices[0].message.content or "").strip()
            except Exception:
                return self._simple_extractive_answer(query, contexts)
        if provider == "gemini":
            try:
                import google.generativeai as genai
                if not self.settings.gemini_api_key:
                    raise RuntimeError("GEMINI_API_KEY is required for Gemini LLM")
                genai.configure(api_key=self.settings.gemini_api_key)
                model = genai.GenerativeModel(self.settings.gemini_chat_model)
                r = model.generate_content(prompt)
                return (getattr(r, "text", None) or "").strip()
            except Exception:
                return self._simple_extractive_answer(query, contexts)
        if provider == "ollama":
            try:
                import ollama  # type: ignore
                model = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
                r = ollama.chat(model=model, messages=[{"role": "user", "content": prompt}])
                content = r.get("message", {}).get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
            except Exception:
                return self._simple_extractive_answer(query, contexts)
        # none or fallback
        return self._simple_extractive_answer(query, contexts)

    # -------- Utils --------
    def _extract_text(self, *, file_bytes: bytes, file_name: str) -> str:
        name = file_name.lower()
        if name.endswith('.pdf'):
            return self._extract_pdf(file_bytes)
        if name.endswith('.docx'):
            return self._extract_docx(file_bytes)
        if name.endswith('.txt') or name.endswith('.md'):
            try:
                return file_bytes.decode('utf-8', errors='ignore')
            except Exception:
                return ""
        # unknown -> try decode
        try:
            return file_bytes.decode('utf-8', errors='ignore')
        except Exception:
            return ""

    # -------- Metadata extraction & classification --------
    def analyze_file(self, *, file_bytes: bytes, file_name: str) -> Dict[str, Any]:
        """Extract full text then classify simple metadata.
        Returns: { text, title, doc_type, date, year, month, tags }
        """
        text = self._extract_text(file_bytes=file_bytes, file_name=file_name) or ""
        meta = self._classify_metadata(text)
        # Simple keyword-based tags from content
        tags = self._extract_keywords(text, top_k=8)
        out = {"text": text, "tags": tags}
        out.update(meta)
        return out

    def _classify_metadata(self, text: str) -> Dict[str, Any]:
        text = (text or "").strip()
        title = self._guess_title(text)
        detected_date = self._find_date(text)
        year = None
        month = None
        if detected_date:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(detected_date)
                year = dt.year
                month = dt.month
            except Exception:
                pass

        # Try LLM if configured to detect doc type; fallback heuristics
        doc_type = self._guess_type(text, title)

        return {
            "title": title,
            "doc_type": doc_type,
            "date": detected_date,
            "year": year,
            "month": month,
        }

    def _guess_title(self, text: str) -> Optional[str]:
        # First non-empty line up to 120 chars
        for line in (text or "").splitlines():
            s = line.strip()
            if s:
                # prefer all-caps headings
                if len(s) <= 120:
                    return s
                return s[:120]
        return None

    def _find_date(self, text: str) -> Optional[str]:
        """Find the first date and normalize to ISO (YYYY-MM-DD). Supports dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, yyyy/mm/dd."""
        if not text:
            return None
        # Common VN formats
        patterns = [
            r"\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b",  # dd/mm/yyyy or dd-mm-yyyy
            r"\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b",  # yyyy-mm-dd or yyyy/mm/dd
        ]
        import re as _re
        from datetime import datetime
        for pat in patterns:
            m = _re.search(pat, text)
            if m:
                g = m.groups()
                try:
                    if len(g) == 3 and len(g[0]) <= 2:
                        d, mth, y = int(g[0]), int(g[1]), int(g[2])
                        dt = datetime(year=y, month=max(1, min(12, mth)), day=max(1, min(31, d)))
                    else:
                        y, mth, d = int(g[0]), int(g[1]), int(g[2])
                        dt = datetime(year=y, month=max(1, min(12, mth)), day=max(1, min(31, d)))
                    return dt.date().isoformat()
                except Exception:
                    continue
        return None

    def _guess_type(self, text: str, title: Optional[str]) -> str:
        # Heuristics first
        t = (title or "").lower()
        body = (text or "").lower()
        if any(k in t or k in body for k in ["công văn", "cong van", "cv "]):
            return "cong-van"
        if any(k in t or k in body for k in ["quyết định", "quyet dinh"]):
            return "quyet-dinh"
        if any(k in t or k in body for k in ["thông báo", "thong bao"]):
            return "thong-bao"
        if any(k in t or k in body for k in ["biên bản", "bien ban"]):
            return "bien-ban"

        # Try LLM if enabled
        provider = (self.settings.llm_provider or "none").lower()
        if provider == "ollama":
            try:
                import ollama  # type: ignore
                model = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
                prompt = (
                    "Phân loại loại văn bản theo các nhãn: cong-van, quyet-dinh, thong-bao, bien-ban, khac.\n"
                    "Chỉ trả lời 1 nhãn duy nhất, dạng slug không dấu.\n"
                    f"Tiêu đề: {title or ''}\nNội dung: {text[:1500]}\nNhãn:"
                )
                r = ollama.chat(model=model, messages=[{"role": "user", "content": prompt}])
                ans = (r.get("message", {}) or {}).get("content") or ""
                label = ans.strip().split()[0].lower()
                if label in {"cong-van", "quyet-dinh", "thong-bao", "bien-ban"}:
                    return label
            except Exception:
                pass
        return "khac"

    def _extract_keywords(self, text: str, top_k: int = 8) -> List[str]:
        """Lightweight keyword extraction (VN/EN) without external downloads.
        - Lowercase, strip punctuation
        - Remove stopwords and very short tokens
        - Count unigrams and bigrams; select top unique terms
        Returns list of tags (slugs)
        """
        import re as _re
        from collections import Counter

        if not text:
            return []

        s = (text or "").lower()
        # keep unicode letters/digits and spaces
        s = _re.sub(r"[^\w\sà-ỹá-ýâêôăđơưÀ-ỸÁ-ÝÂÊÔĂĐƠƯ]", " ", s)
        tokens = [t for t in _re.split(r"\s+", s) if t]

        # Minimal VN/EN stopwords (extendable)
        stop = {
            "the","and","or","of","to","in","for","on","at","by","with","a","an","is","are","was","were","be","as","it","that","this","from","we","you","they","he","she","i","but","not","have","has","had","will","shall","can","could","may","might","do","does","did",
            "và","hoặc","của","cho","trong","trên","tại","bởi","với","là","một","những","các","được","đã","sẽ","đang","này","kia","đó","khi","từ","theo","về","có","không","đến","tại","hay","nên","cần","nếu","thì","ra","vào","cũng","được",
        }

        def is_good(tok: str) -> bool:
            if len(tok) < 3:
                return False
            if tok.isdigit():
                return False
            if tok in stop:
                return False
            return True

        unigrams = [t for t in tokens if is_good(t)]
        bigrams = [f"{a}-{b}" for a, b in zip(tokens, tokens[1:]) if is_good(a) and is_good(b)]

        counts = Counter(unigrams)
        counts_big = Counter(bigrams)

        # Interleave bigrams and unigrams for diversity
        cand = [w for w, _ in counts_big.most_common(top_k * 2)] + [w for w, _ in counts.most_common(top_k * 2)]
        out: List[str] = []
        for w in cand:
            if len(out) >= top_k:
                break
            if w not in out:
                out.append(w)
        return out



    def _extract_pdf(self, file_bytes: bytes) -> str:
        from io import BytesIO
        reader = PdfReader(BytesIO(file_bytes))
        texts = []
        for page in reader.pages:
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(texts)

    def _extract_docx(self, file_bytes: bytes) -> str:
        from io import BytesIO
        doc = DocxDocument(BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs)

    def _split_text(self, text: str) -> List[str]:
        """Sentence-aware splitter with env-configurable size/overlap.
        - Clean spaces
        - Split into sentences with a lightweight regex
        - Pack sentences into chunks of approx chunk_size with chunk_overlap
        """
        chunk_size = max(200, int(self.settings.chunk_size))  # guardrails
        overlap = max(0, min(int(self.settings.chunk_overlap), chunk_size // 2))

        cleaned = re.sub(r"\s+", " ", text).strip()
        if not cleaned:
            return []

        # Split into rough sentences by punctuation. Keep delimiters by splitting on lookbehind.
        sentences = re.split(r"(?<=[\.!?。！？;；:\n])\s+", cleaned)
        sentences = [s.strip() for s in sentences if s and s.strip()]

        chunks: List[str] = []
        current: List[str] = []
        current_len = 0

        def flush_with_overlap():
            nonlocal current, current_len
            if not current:
                return
            chunk = " ".join(current).strip()
            if chunk:
                chunks.append(chunk)
            # build overlap from end of current chunk
            if overlap > 0 and chunks:
                keep = chunk[-overlap:]
                current = [keep]
                current_len = len(keep)
            else:
                current = []
                current_len = 0

        for sent in sentences:
            if current_len + len(sent) + 1 <= chunk_size:
                current.append(sent)
                current_len += len(sent) + 1
            else:
                flush_with_overlap()
                current.append(sent)
                current_len = len(sent)

        flush_with_overlap()
        # Ensure at least one chunk for very small text
        if not chunks and cleaned:
            chunks = [cleaned[:chunk_size]]
        return chunks

    def _simple_extractive_answer(self, query: str, contexts: List[str]) -> str:
        # Return first 2 chunks as context with a brief preface
        joined = "\n\n".join(contexts[:2])
        return f"(Không có LLM cục bộ; trả lời theo ngữ cảnh gần nhất)\n\n{joined}"

    def _maybe_rerank(self, query: str, outs: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        try:
            if not self.settings.rerank or len(outs) <= 1:
                return outs[:top_k]
            if self._cross_encoder is None:
                from sentence_transformers import CrossEncoder  # type: ignore
                self._cross_encoder = CrossEncoder(self.settings.rerank_model)
            pairs = [(query, o.get("text") or "") for o in outs]
            scores = self._cross_encoder.predict(pairs)
            scored = [(*pair, float(score)) for pair, score in zip(outs, scores)]
            scored.sort(key=lambda x: x[-1], reverse=True)
            reranked = [o for (o, *_s) in scored][:max(1, top_k)]
            for o, _ in zip(reranked, range(len(reranked))):
                o["rerank_score"] = _
            return reranked
        except Exception:
            # best-effort; fallback to original order
            return outs[:top_k]


# Singleton engine
_engine: Optional[RAGEngine] = None


def get_engine() -> RAGEngine:
    global _engine
    if _engine is None:
        _engine = RAGEngine()
    return _engine

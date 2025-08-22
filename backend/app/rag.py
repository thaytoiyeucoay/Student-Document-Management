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
    chunk_size: int = 500                # RAG_CHUNK_SIZE
    chunk_overlap: int = 80              # RAG_CHUNK_OVERLAP
    # Backends/providers
    store_backend: str = "chroma"        # chroma | supabase
    embed_provider: str = "local"        # local | openai | gemini
    llm_provider: str = "none"           # none | ollama | openai | gemini
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
                        file_name: str) -> Dict[str, Any]:
        text = self._extract_text(file_bytes=file_bytes, file_name=file_name)
        if not text.strip():
            return {"ok": False, "chunks": 0, "message": "No text extracted"}
        chunks = self._split_text(text)
        ids = []
        metadatas = []
        documents = []
        for i, chunk in enumerate(chunks):
            ids.append(f"{document_id}-{i}-{uuid.uuid4().hex[:8]}")
            metadatas.append({
                "document_id": str(document_id),
                "subject_id": subject_id or "",
                "user_id": user_id or "",
                "file_name": file_name,
                "chunk_index": i,
            })
            documents.append(chunk)
        embeddings = self._embed_texts(documents)
        if self.settings.store_backend == "chroma":
            self._collection.add(ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings)
        else:
            # Supabase pgvector storage
            try:
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
                raise RuntimeError(f"RAG Supabase add_chunks failed for document {document_id}: {e}")
        return {"ok": True, "chunks": len(chunks)}

    async def index_document_from_url(self, *,
                                      document_id: str,
                                      subject_id: Optional[str],
                                      user_id: Optional[str],
                                      url: str,
                                      file_name: Optional[str] = None) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.content
        name = file_name or url.split("?")[0].split("/")[-1] or "file.bin"
        return self.index_document(document_id=document_id, subject_id=subject_id, user_id=user_id, file_bytes=content, file_name=name)

    # -------- Retrieval & QA --------
    def retrieve(self, query: str, *, top_k: int = 5, subject_id: Optional[str] = None, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if self.settings.store_backend == "chroma":
            where: Dict[str, Any] = {}
            if subject_id:
                where["subject_id"] = subject_id
            if user_id:
                where["user_id"] = user_id
            results = self._collection.query(
                query_texts=[query],
                n_results=max(1, min(top_k, 20)),
                where=where or None,
            )
            outs: List[Dict[str, Any]] = []
            docs = results.get("documents", [[]])[0]
            metas = results.get("metadatas", [[]])[0]
            dists = results.get("distances", [[]])[0]
            for d, m, dist in zip(docs, metas, dists):
                outs.append({"text": d, "metadata": m, "score": float(1 - dist) if dist is not None else None})
            return outs
        else:
            q_emb = self._embed_texts([query])[0]
            return self._svs.query(query_embedding=q_emb, top_k=top_k, subject_id=subject_id, user_id=user_id)

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


# Singleton engine
_engine: Optional[RAGEngine] = None


def get_engine() -> RAGEngine:
    global _engine
    if _engine is None:
        _engine = RAGEngine()
    return _engine

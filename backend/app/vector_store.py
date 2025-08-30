from __future__ import annotations
from typing import Any, Dict, List, Optional
import uuid as _uuid
from .supabase_client import get_supabase
import logging

class SupabaseVectorStore:
    """
    Thin wrapper over a pgvector-backed table and an RPC search function.
    Requires the following in your Supabase Postgres:
      - table: rag_chunks (see backend/pgvector.sql)
      - function: match_rag_chunks(query_embedding vector, match_count int, subject_id text, user_id uuid)
    """
    def __init__(self, table_name: str = "rag_chunks", rpc_name: str = "match_rag_chunks") -> None:
        self.table_name = table_name
        self.rpc_name = rpc_name
        self.sb = get_supabase()

    def add_chunks(self, *,
                   document_id: str,
                   subject_id: Optional[str],
                   user_id: Optional[str],
                   file_name: str,
                   chunks: List[str],
                   embeddings: List[List[float]]) -> None:
        rows: List[Dict[str, Any]] = []
        # Validate user_id as UUID, else set None (to avoid Postgres uuid errors)
        user_uuid: Optional[str] = None
        if user_id:
            try:
                user_uuid = str(_uuid.UUID(str(user_id)))
            except Exception:
                user_uuid = None

        # Use canonical string IDs (UUID-safe). Keep None if empty.
        def _canon_str(val: Optional[str]) -> Optional[str]:
            if val is None:
                return None
            s = str(val).strip()
            return s if s else None

        did_str: Optional[str] = _canon_str(document_id)
        sid_str: Optional[str] = _canon_str(subject_id)

        for i, (text, emb) in enumerate(zip(chunks, embeddings)):
            rows.append({
                "document_id": did_str,
                "subject_id": sid_str,
                "user_id": user_uuid,
                "file_name": file_name,
                "chunk_index": i,
                "content": text,
                "embedding": emb,
            })
        if rows:
            try:
                # Log diagnostic info: number of rows and embedding dimension
                emb_dim = len(rows[0]["embedding"]) if rows and isinstance(rows[0].get("embedding"), list) else None
                logging.getLogger("rag").info("Supabase insert rag_chunks: rows=%s emb_dim=%s document_id=%s subject_id=%s", len(rows), emb_dim, did_str, sid_str)
                self.sb.table(self.table_name).insert(rows).execute()
            except Exception as e:
                # Surface detailed error to caller for logging
                raise RuntimeError(f"Supabase insert into {self.table_name} failed: {e}")

    def query(self, *, query_embedding: List[float], top_k: int, subject_id: Optional[str], user_id: Optional[str]) -> List[Dict[str, Any]]:
        payload: Dict[str, Any] = {
            "query_embedding": query_embedding,
            "match_count": max(1, min(top_k, 50)),
            # Use canonical string subject_id (UUID-safe). Keep None if empty.
            "subject_id": (str(subject_id).strip() or None) if subject_id is not None else None,
            "user_id": user_id,
        }
        res = self.sb.rpc(self.rpc_name, payload).execute()
        data = res.data or []
        # Expect rows with fields: content, file_name, chunk_index, distance, subject_id, user_id, document_id
        outs: List[Dict[str, Any]] = []
        for r in data:
            outs.append({
                "text": r.get("content", ""),
                "metadata": {
                    "file_name": r.get("file_name"),
                    "chunk_index": r.get("chunk_index"),
                    "document_id": r.get("document_id"),
                    "subject_id": r.get("subject_id"),
                    "user_id": r.get("user_id"),
                },
                "score": float(1 - (r.get("distance") or 0.0)),
            })
        return outs

    def get_chunks_by_document(self, document_id: str, limit: int = 100) -> List[str]:
        """Return raw chunk texts for a specific document_id ordered by chunk_index.
        This avoids semantic search when we need all chunks from a document (e.g., quiz generation).
        """
        try:
            did = str(document_id).strip()
            if not did:
                return []
            logging.getLogger("rag").info("SVS.get_chunks_by_document: doc_id=%s limit=%s", did, limit)
            res = (
                self.sb
                .table(self.table_name)
                .select("content, chunk_index")
                .eq("document_id", did)
                .order("chunk_index", desc=False)
                .limit(max(1, min(limit, 500)))
                .execute()
            )
            rows = res.data or []
            logging.getLogger("rag").info("SVS.get_chunks_by_document: raw_rows=%s for doc_id=%s", len(rows), did)
            texts = [r.get("content") for r in rows if isinstance(r.get("content"), str) and r.get("content").strip()]
            logging.getLogger("rag").info("SVS.get_chunks_by_document: non_empty_chunks=%s for doc_id=%s", len(texts), did)
            return texts
        except Exception as e:
            logging.getLogger("rag").exception("SVS.get_chunks_by_document error doc_id=%s: %s", did, e)
            return []

    def delete_chunks_by_document(self, document_id: str) -> None:
        """Delete all chunks for a given document_id (string/UUID-safe)."""
        did = str(document_id).strip()
        if not did:
            return
        try:
            self.sb.table(self.table_name).delete().eq("document_id", did).execute()
        except Exception:
            # ignore deletion errors to avoid blocking reindex
            pass

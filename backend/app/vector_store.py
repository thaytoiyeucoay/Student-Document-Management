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
      - function: match_rag_chunks(query_embedding vector, match_count int, subject_id bigint, user_id uuid)
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

        for i, (text, emb) in enumerate(zip(chunks, embeddings)):
            rows.append({
                "document_id": int(document_id) if str(document_id).isdigit() else None,
                "subject_id": int(subject_id) if (subject_id and str(subject_id).isdigit()) else None,
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
                logging.getLogger("rag").info("Supabase insert rag_chunks: rows=%s emb_dim=%s", len(rows), emb_dim)
                self.sb.table(self.table_name).insert(rows).execute()
            except Exception as e:
                # Surface detailed error to caller for logging
                raise RuntimeError(f"Supabase insert into {self.table_name} failed: {e}")

    def query(self, *, query_embedding: List[float], top_k: int, subject_id: Optional[str], user_id: Optional[str]) -> List[Dict[str, Any]]:
        payload: Dict[str, Any] = {
            "query_embedding": query_embedding,
            "match_count": max(1, min(top_k, 50)),
            "subject_id": int(subject_id) if (subject_id and str(subject_id).isdigit()) else None,
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

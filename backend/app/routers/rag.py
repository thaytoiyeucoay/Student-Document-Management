from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user
from ..rag import get_engine
from ..vector_store import SupabaseVectorStore

router = APIRouter()


class RAGQuery(BaseModel):
    query: str
    subject_id: Optional[str] = None
    top_k: int = 5


class RAGAnswer(BaseModel):
    answer: str
    contexts: List[str]


@router.post("/rag/query", response_model=RAGAnswer)
async def rag_query(payload: RAGQuery, user=Depends(get_current_user)):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    engine = get_engine()
    uid = (user or {}).get("sub") if isinstance(user, dict) else None
    results = engine.retrieve(payload.query, top_k=payload.top_k, subject_id=payload.subject_id, user_id=uid)
    contexts = [r.get("text", "") for r in results]
    answer = engine.answer(payload.query, contexts)
    return RAGAnswer(answer=answer, contexts=contexts)


@router.get("/rag/diag")
async def rag_diag(user=Depends(get_current_user)):
    """Chẩn đoán nhanh: tạo embedding cho 1 câu ngắn và thử insert vào Supabase.
    Trả về kích thước vector, số hàng chèn thử, và lỗi (nếu có)."""
    engine = get_engine()
    try:
        texts = ["chandoan"]
        embs = engine._embed_texts(texts)  # type: ignore
        emb_dim = len(embs[0]) if embs and isinstance(embs[0], list) else None
        store = SupabaseVectorStore()
        # cố gắng chèn 1 hàng thử nghiệm
        store.add_chunks(
            document_id="0",
            subject_id=None,
            user_id=None,
            file_name="__diag__",
            chunks=texts,
            embeddings=embs,
        )
        return {"ok": True, "emb_dim": emb_dim, "inserted_rows": 1}
    except Exception as e:
        # trả về thông tin lỗi cụ thể
        return {"ok": False, "error": str(e)}

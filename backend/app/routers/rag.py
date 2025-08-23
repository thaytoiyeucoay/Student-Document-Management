from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..auth import get_current_user
from ..rag import get_engine
from ..vector_store import SupabaseVectorStore
from ..supabase_client import get_supabase
from ..rag_jobs import job_store

router = APIRouter()


class RAGQuery(BaseModel):
    query: str
    subject_id: Optional[str] = None
    subject_ids: Optional[List[str]] = None
    top_k: int = 5
    # semantic & metadata filters
    tags: Optional[List[str]] = None
    author: Optional[str] = None
    time_from: Optional[str] = None  # ISO string
    time_to: Optional[str] = None    # ISO string
    # advanced metadata
    source: Optional[str] = None      # local | url
    file_type: Optional[str] = None   # pdf, docx, ... (mapped from file_ext)
    page_from: Optional[int] = None
    page_to: Optional[int] = None


class RAGAnswer(BaseModel):
    answer: str
    contexts: List[Any]


# --- Simple in-memory chat memory per thread ---
_chat_memory: Dict[str, List[Dict[str, str]]] = {}


class StreamPayload(RAGQuery):
    thread_id: Optional[str] = None  # client-generated conversation id
    memory: Optional[bool] = True    # whether to use and update memory


@router.post("/rag/stream")
async def rag_stream(payload: StreamPayload, user=Depends(get_current_user)):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    engine = get_engine()
    uid = (user or {}).get("sub") if isinstance(user, dict) else None

    results = engine.retrieve(
        payload.query,
        top_k=payload.top_k,
        subject_id=payload.subject_id,
        subject_ids=payload.subject_ids,
        user_id=uid,
        tags=payload.tags,
        author=payload.author,
        time_from=payload.time_from,
        time_to=payload.time_to,
        source=payload.source,
        file_type=payload.file_type,
        page_from=payload.page_from,
        page_to=payload.page_to,
    )
    contexts: List[str] = [r.get("citation", {}).get("snippet") or r.get("text") or "" for r in results]

    # memory: prepend previous snippets if any, then update
    if payload.thread_id and payload.memory:
        history = _chat_memory.get(payload.thread_id, [])
        prev_ctx = [h.get("snippet", "") for h in history if h.get("snippet")]
        if prev_ctx:
            contexts = prev_ctx[-4:] + contexts  # limit history to last 4 items

    answer = engine.answer(payload.query, contexts)

    # update memory store with last user query and top snippet
    if payload.thread_id and payload.memory:
        best_snippet = contexts[0] if contexts else ""
        _chat_memory.setdefault(payload.thread_id, []).append({
            "query": payload.query,
            "snippet": best_snippet,
        })

    async def _gen():
        # naive chunking to simulate streaming
        text = answer
        step = 128
        for i in range(0, len(text), step):
            yield text[i:i+step]
        # done
    return StreamingResponse(_gen(), media_type="text/plain; charset=utf-8")


 


@router.post("/rag/query", response_model=RAGAnswer)
async def rag_query(payload: RAGQuery, user=Depends(get_current_user)):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    engine = get_engine()
    uid = (user or {}).get("sub") if isinstance(user, dict) else None
    results = engine.retrieve(
        payload.query,
        top_k=payload.top_k,
        subject_id=payload.subject_id,
        subject_ids=payload.subject_ids,
        user_id=uid,
        tags=payload.tags,
        author=payload.author,
        time_from=payload.time_from,
        time_to=payload.time_to,
        source=payload.source,
        file_type=payload.file_type,
        page_from=payload.page_from,
        page_to=payload.page_to,
    )
    # Build contexts with citation objects
    contexts: List[Any] = []
    for r in results:
        cit = r.get("citation") or {}
        contexts.append({
            "title": cit.get("title"),
            "url": cit.get("url"),
            "page": cit.get("page"),
            "snippet": cit.get("snippet") or r.get("text"),
        })
    answer = engine.answer(payload.query, [c.get("snippet", "") for c in contexts])
    return RAGAnswer(answer=answer, contexts=contexts)


@router.get("/rag/jobs/{doc_id}")
async def rag_job_status(doc_id: str, user=Depends(get_current_user)):
    # For now, in-memory by doc_id only. Could add user scoping later.
    return job_store.get(doc_id)


@router.post("/rag/index/{doc_id}")
async def rag_index_now(doc_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    sb = get_supabase()
    q = sb.table("documents").select("id,file_url,file_path,subject_id,user_id,author,tags,created_at").eq("id", doc_id)
    if user and (uid := user.get("sub")):
        q = q.eq("user_id", uid)
    resp = q.execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Document not found or permission denied")
    row = resp.data[0]
    file_url = row.get("file_url")
    if not file_url:
        raise HTTPException(status_code=400, detail="Document has no file_url to index")

    engine = get_engine()
    subject_id = str(row.get("subject_id")) if row.get("subject_id") is not None else None
    uid = (user or {}).get("sub") if isinstance(user, dict) else None
    job_store.start(doc_id)

    async def _run():
        try:
            extra_metadata = {
                "author": row.get("author"),
                "tags": row.get("tags") or [],
                "created_at": row.get("created_at"),
                "file_url": row.get("file_url"),
            }
            await engine.index_document_from_url(document_id=doc_id, subject_id=subject_id, user_id=uid, url=file_url, file_name=row.get("file_path") or "file.bin", extra_metadata=extra_metadata)
        except Exception as e:
            job_store.fail(doc_id, f"Index lỗi: {e}")

    background_tasks.add_task(_run)
    return {"ok": True, "doc_id": doc_id}


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

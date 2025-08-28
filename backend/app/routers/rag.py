from typing import Optional, List, Any, Dict
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..rag import get_engine
from ..vector_store import SupabaseVectorStore
from ..supabase_client import get_supabase
from ..rag_jobs import job_store
from ..config import get_settings
import json
import urllib.request
import urllib.error

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
    # web search
    web_search: Optional[bool] = False
    web_top_k: Optional[int] = 3


class RAGAnswer(BaseModel):
    answer: str
    contexts: List[Any]


# --- Simple in-memory chat memory per thread ---
_chat_memory: Dict[str, List[Dict[str, str]]] = {}


class StreamPayload(RAGQuery):
    thread_id: Optional[str] = None  # client-generated conversation id
    memory: Optional[bool] = True    # whether to use and update memory


@router.post("/rag/stream")
async def rag_stream(payload: StreamPayload):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    engine = get_engine()
    uid = None

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
async def rag_query(payload: RAGQuery):
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    engine = get_engine()
    uid = None
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
    # If requested, augment with web search via Tavily
    if payload.web_search:
        settings = get_settings()
        api_key = getattr(settings, "tavily_api_key", None)
        if api_key:
            try:
                tavily_ctx = _tavily_search(payload.query, api_key=api_key, max_results=max(1, min(int(payload.web_top_k or 3), 8)))
                # Merge, dedupe by url, then simple rerank
                contexts.extend(tavily_ctx)
                contexts = _dedupe_and_rerank_contexts(payload.query, contexts)
            except Exception as e:
                # Do not fail the whole request because of web search error
                contexts.append({"title": "Web search error", "snippet": f"{e}"})
    answer = engine.answer(payload.query, [c.get("snippet", "") for c in contexts])
    return RAGAnswer(answer=answer, contexts=contexts)


@router.get("/rag/jobs/{doc_id}")
async def rag_job_status(doc_id: str):
    # For now, in-memory by doc_id only. Could add user scoping later.
    return job_store.get(doc_id)


@router.post("/rag/index/{doc_id}")
async def rag_index_now(doc_id: str, background_tasks: BackgroundTasks):
    sb = get_supabase()
    q = sb.table("documents").select("id,file_url,file_path,subject_id,user_id,author,tags,created_at").eq("id", doc_id)
    resp = q.execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Document not found or permission denied")
    row = resp.data[0]
    file_url = row.get("file_url")
    if not file_url:
        raise HTTPException(status_code=400, detail="Document has no file_url to index")

    engine = get_engine()
    subject_id = str(row.get("subject_id")) if row.get("subject_id") is not None else None
    uid = None
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
async def rag_diag():
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


def _tavily_search(query: str, api_key: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """Call Tavily Search API and return contexts list.
    Docs: https://api.tavily.com
    """
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": max_results,
        # use deeper search for better recall
        "search_depth": "advanced",
        # we only need sources, not model-written answer
        "include_answer": False,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as he:
        text = he.read().decode("utf-8", errors="ignore") if hasattr(he, 'read') else str(he)
        raise RuntimeError(f"Tavily HTTP {he.code}: {text}")
    except Exception as e:
        raise RuntimeError(f"Tavily request failed: {e}")

    try:
        obj = json.loads(body)
    except Exception as e:
        raise RuntimeError(f"Invalid Tavily response: {e}")

    items = obj.get("results") or []
    contexts: List[Dict[str, Any]] = []
    for it in items:
        title = it.get("title") or it.get("url")
        url_item = it.get("url")
        # prefer full content, then snippet/description
        snippet = (it.get("content") or it.get("snippet") or it.get("meta_description") or "").strip()
        if not snippet:
            snippet = title or url_item or ""
        contexts.append({
            "title": title,
            "url": url_item,
            "snippet": snippet[:1000],
        })
    return contexts


def _dedupe_and_rerank_contexts(query: str, contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate URLs and rerank by naive term overlap with the query."""
    seen = set()
    uniq: List[Dict[str, Any]] = []
    for c in contexts:
        u = (c.get("url") or c.get("title") or c.get("snippet") or "").strip()
        key = u.lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)

    # compute score: count of unique query terms present in snippet/title
    def score(c: Dict[str, Any]) -> int:
        txt = f"{c.get('title') or ''} {c.get('snippet') or ''}".lower()
        terms = {t for t in query.lower().split() if len(t) > 2}
        return sum(1 for t in terms if t in txt)

    uniq.sort(key=score, reverse=True)
    return uniq

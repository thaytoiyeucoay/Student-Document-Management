from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, BackgroundTasks
import logging
from ..schemas import DocumentCreate, DocumentUpdate, DocumentOut
from ..supabase_client import get_supabase
from ..auth import get_current_user
from ..config import get_settings
import uuid
import json
from ..rag import get_engine
from ..rag_jobs import job_store

router = APIRouter()
logger = logging.getLogger(__name__)


def _table_name() -> str:
    return "documents"


@router.get("/documents", response_model=List[DocumentOut])
async def list_documents(subject_id: Optional[str] = None, user=Depends(get_current_user)):
    sb = get_supabase()
    query = sb.table(_table_name()).select("*")
    if subject_id is not None:
        query = query.eq("subject_id", subject_id)
    if user and (uid := user.get("sub")):
        query = query.eq("user_id", uid)
    resp = query.order("id", desc=True).execute()
    return resp.data or []


@router.post("/documents", response_model=DocumentOut)
async def create_document(payload: DocumentCreate, user=Depends(get_current_user)):
    sb = get_supabase()
    data = payload.model_dump(by_alias=True)
    if user and (uid := user.get("sub")):
        data["user_id"] = uid
    # Ensure tags is JSON-serializable
    if data.get("tags") is None:
        data["tags"] = []
    resp = sb.table(_table_name()).insert(data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create document")
    return resp.data[0]


@router.patch("/documents/{doc_id}", response_model=DocumentOut)
async def update_document(doc_id: str, payload: DocumentUpdate, user=Depends(get_current_user)):
    sb = get_supabase()
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    q = sb.table(_table_name()).update(data).eq("id", doc_id)
    if user and (uid := user.get("sub")):
        q = q.eq("user_id", uid)
    resp = q.execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return resp.data[0]


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    q = sb.table(_table_name()).delete().eq("id", doc_id)
    if user and (uid := user.get("sub")):
        q = q.eq("user_id", uid)
    resp = q.execute()
    if resp.count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}


@router.post("/documents/{doc_id}/upload", response_model=DocumentOut)
async def upload_document_file(doc_id: str, file: UploadFile = File(...), enable_rag: bool = Form(False), background_tasks: BackgroundTasks = None, user=Depends(get_current_user)):
    sb = get_supabase()
    settings = get_settings()

    # Make sure the document exists and belongs to user
    q = sb.table(_table_name()).select("*").eq("id", doc_id)
    if user and (uid := user.get("sub")):
        q = q.eq("user_id", uid)
    doc_resp = q.execute()
    if not doc_resp.data:
        raise HTTPException(status_code=404, detail="Document not found")

    # Upload to storage
    ext = (file.filename or "").split(".")[-1].lower() if file.filename else "bin"
    path = f"{doc_id}/{uuid.uuid4().hex}.{ext}"
    content = await file.read()

    storage = sb.storage.from_(settings.supabase_storage_bucket)
    try:
        upload_resp = storage.upload(
            file=content,
            path=path,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {e}")

    # Supabase v2 may return dict-like response; try to detect error
    if upload_resp is None:
        raise HTTPException(status_code=500, detail="Upload failed (no response)")
    if isinstance(upload_resp, dict):
        # If it contains 'error' or similar, raise
        err = upload_resp.get("error") or upload_resp.get("message")
        if err:
            raise HTTPException(status_code=500, detail=f"Upload failed: {err}")

    # Build public URL (ensure bucket has public policy or signed url)
    public_result = storage.get_public_url(path)
    if isinstance(public_result, str):
        public_url = public_result
    elif isinstance(public_result, dict):
        public_url = (
            public_result.get("publicUrl")
            or (public_result.get("data") or {}).get("publicUrl")
            or (public_result.get("data") or {}).get("public_url")
            or (public_result.get("data") or {}).get("publicURL")
        )
        if not isinstance(public_url, str):
            # Fallback: convert to str if unknown shape
            public_url = str(public_result)
    else:
        public_url = str(public_result)

    # Save file path/url to db
    update = sb.table(_table_name()).update({
        "file_path": path,
        "file_url": public_url,
    }).eq("id", doc_id)
    if user and (uid := user.get("sub")):
        update = update.eq("user_id", uid)
    updated = update.execute()
    if not updated.data:
        raise HTTPException(status_code=500, detail="Failed to update document with file info")
    saved_doc = updated.data[0]

    # Trigger RAG indexing in background if enabled (best-effort, non-blocking)
    try:
        if enable_rag:
            # init job status
            try:
                job_store.start(str(doc_id))
                job_store.update(str(doc_id), stage="upload", progress=5, message="Đang tải lên")
            except Exception:
                pass
            engine = get_engine()
            subject_id = str(saved_doc.get("subject_id")) if saved_doc.get("subject_id") is not None else None
            user_id = (user or {}).get("sub") if isinstance(user, dict) else None
            filename = file.filename or path.split("/")[-1]

            def _do_index():
                try:
                    extra_metadata = {
                        "author": saved_doc.get("author"),
                        "tags": saved_doc.get("tags") or [],
                        "created_at": saved_doc.get("created_at"),
                        "file_url": saved_doc.get("file_url"),
                    }
                    res = engine.index_document(
                        document_id=str(doc_id),
                        subject_id=subject_id,
                        user_id=user_id,
                        file_bytes=content,
                        file_name=filename,
                        extra_metadata=extra_metadata,
                    )
                    logger.info("[RAG] Index scheduled and completed doc_id=%s chunks=%s", doc_id, (res or {}).get("chunks"))
                except Exception as e:
                    logger.exception("[RAG] Index failed for doc_id=%s: %s", doc_id, e)

            if background_tasks is not None:
                background_tasks.add_task(_do_index)
                logger.info("[RAG] Index scheduled (background) doc_id=%s enable_rag=%s", doc_id, enable_rag)
            else:
                # Fallback if BackgroundTasks not available for some reason
                _do_index()
        else:
            logger.info("[RAG] Index skipped doc_id=%s enable_rag=%s", doc_id, enable_rag)
    except Exception as e:
        logger.exception("Failed to schedule/skip RAG indexing for doc_id=%s: %s", doc_id, e)

    return saved_doc

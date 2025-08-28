from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, AnyHttpUrl
from typing import Optional, Tuple
from ..config import get_settings
from ..supabase_client import get_supabase
from ..rag import get_engine
from ..rag_jobs import job_store
import uuid
import logging
import json
import re
import urllib.request
import urllib.parse

router = APIRouter()
logger = logging.getLogger(__name__)


class ImportPayload(BaseModel):
    # Either provide file_id or share_link
    file_id: Optional[str] = None
    share_link: Optional[AnyHttpUrl] = None
    subject_id: Optional[str] = None
    name: Optional[str] = None
    enable_rag: Optional[bool] = False


def _extract_drive_file_id_from_link(link: str) -> Optional[str]:
    # Common patterns: /file/d/<id>/, open?id=<id>, uc?id=<id>
    m = re.search(r"/file/d/([a-zA-Z0-9_-]+)", link)
    if m:
        return m.group(1)
    q = urllib.parse.urlparse(link)
    qs = urllib.parse.parse_qs(q.query)
    if "id" in qs and qs["id"]:
        return qs["id"][0]
    return None


def _drive_download(file_id: str, api_key: Optional[str]) -> Tuple[bytes, str, str, str]:
    # Returns (content, filename, mime, web_link)
    # Strategy:
    # 1) If api_key provided: try metadata + alt=media
    # 2) If metadata fails or no api_key: try public download endpoints
    #    - https://drive.usercontent.google.com/download?id=...&export=download
    #    - https://drive.google.com/uc?export=download&id=...
    # In public mode, filename/mime may be inferred from headers.

    meta = {}
    filename = None
    mime = None
    web = f"https://drive.google.com/file/d/{file_id}/view"

    # Try metadata only when api_key is present
    if api_key:
        meta_url = (
            f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id)}"
            f"?fields=name,mimeType,webViewLink&key={urllib.parse.quote(api_key)}"
        )
        try:
            with urllib.request.urlopen(meta_url) as resp:
                meta_txt = resp.read().decode("utf-8")
            meta = json.loads(meta_txt)
            filename = meta.get("name")
            mime = meta.get("mimeType")
            web = meta.get("webViewLink") or web
        except Exception as e:
            # Do not fail hard; continue with public fallback
            logger.warning("Drive metadata failed (will try public download): %s", e)

    # Try alt=media when api_key available
    if api_key:
        dl_url = f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id)}?alt=media&key={urllib.parse.quote(api_key)}"
        try:
            with urllib.request.urlopen(dl_url) as resp:
                content = resp.read()
                hdr_ct = resp.headers.get('Content-Type') or 'application/octet-stream'
                mime = mime or hdr_ct
                # Try to infer filename from Content-Disposition
                disp = resp.headers.get('Content-Disposition') or ''
                m = re.search(r"filename\*=UTF-8'([^;\r\n]+)", disp) or re.search(r'filename="?([^";\r\n]+)"?', disp)
                if m and not filename:
                    filename = m.group(1)
                filename = filename or str(file_id)
                return content, filename, mime or 'application/octet-stream', web
        except Exception as e:
            logger.warning("Drive alt=media failed (will try public download): %s", e)

    # Public download fallback 1: drive.usercontent
    public1 = f"https://drive.usercontent.google.com/download?id={urllib.parse.quote(file_id)}&export=download"
    try:
        with urllib.request.urlopen(public1) as resp:
            content = resp.read()
            hdr_ct = resp.headers.get('Content-Type') or 'application/octet-stream'
            mime = mime or hdr_ct
            disp = resp.headers.get('Content-Disposition') or ''
            m = re.search(r"filename\*=UTF-8'([^;\r\n]+)", disp) or re.search(r'filename="?([^";\r\n]+)"?', disp)
            if m and not filename:
                filename = m.group(1)
            filename = filename or str(file_id)
            return content, filename, mime or 'application/octet-stream', web
    except Exception as e:
        logger.warning("Drive public download (usercontent) failed: %s", e)

    # Public download fallback 2: uc?export=download
    public2 = f"https://drive.google.com/uc?export=download&id={urllib.parse.quote(file_id)}"
    try:
        with urllib.request.urlopen(public2) as resp:
            content = resp.read()
            hdr_ct = resp.headers.get('Content-Type') or 'application/octet-stream'
            mime = mime or hdr_ct
            disp = resp.headers.get('Content-Disposition') or ''
            m = re.search(r"filename\*=UTF-8'([^;\r\n]+)", disp) or re.search(r'filename="?([^";\r\n]+)"?', disp)
            if m and not filename:
                filename = m.group(1)
            filename = filename or str(file_id)
            return content, filename, mime or 'application/octet-stream', web
    except Exception as e:
        logger.warning("Drive public download (uc) failed: %s", e)

    # If all attempts failed
    raise HTTPException(status_code=400, detail="Không thể tải file Google Drive. Hãy đảm bảo file công khai hoặc cung cấp OAuth/credential phù hợp.")


def _graph_get_token(tenant: str, client_id: str, client_secret: str) -> str:
    token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "client_credentials",
        "scope": "https://graph.microsoft.com/.default",
    }).encode("utf-8")
    req = urllib.request.Request(token_url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req) as resp:
            txt = resp.read().decode("utf-8")
        obj = json.loads(txt)
        if not obj.get("access_token"):
            raise RuntimeError("no access_token")
        return obj["access_token"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MS Graph token error: {e}")


def _graph_from_share(share_link: str, token: str) -> Tuple[bytes, str, str, str]:
    # Encode share link per Graph API: base64url of the URL, with "u!" prefix
    b = share_link.encode("utf-8")
    import base64
    enc = base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")
    shares_id = f"u!{enc}"

    # Get driveItem
    url = f"https://graph.microsoft.com/v1.0/shares/{shares_id}/driveItem"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            item_txt = resp.read().decode("utf-8")
        item = json.loads(item_txt)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"MS Graph item error: {e}")

    name = item.get("name") or "file"
    web_url = item.get("webUrl") or share_link
    dl = item.get("@microsoft.graph.downloadUrl")
    if not dl:
        # Fallback: try /content endpoint
        dl = url + "/content"

    # Download raw content (downloadUrl is pre-authenticated)
    try:
        with urllib.request.urlopen(dl) as resp:
            content = resp.read()
            mime = resp.headers.get('Content-Type') or 'application/octet-stream'
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"MS Graph download error: {e}")

    return content, name, mime, web_url


def _infer_ext(filename: str, mime: str) -> str:
    fn = (filename or "").lower()
    if "." in fn:
        ext = fn.rsplit(".", 1)[-1]
        if ext:
            return ext
    # basic mime mapping
    if mime == "application/pdf":
        return "pdf"
    if mime in ("image/png",):
        return "png"
    if mime in ("image/jpeg", "image/jpg"):
        return "jpg"
    if mime in ("image/webp",):
        return "webp"
    return "bin"


def _create_doc_and_upload(content: bytes, filename: str, mime: str, subject_id: Optional[str], link: str, enable_rag: bool) -> dict:
    sb = get_supabase()
    settings = get_settings()

    # Create document first
    body = {
        "subject_id": subject_id,
        "name": filename,
        "link": link,
        "tags": [],
    }
    resp = sb.table("documents").insert(body).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create document")
    doc = resp.data[0]
    doc_id = str(doc["id"]) if isinstance(doc.get("id"), (str, int)) else str(doc.get("id"))

    # Upload to storage
    storage = sb.storage.from_(settings.supabase_storage_bucket)
    ext = _infer_ext(filename, mime)
    path = f"{doc_id}/{uuid.uuid4().hex}.{ext}"
    try:
        upload_resp = storage.upload(
            file=content,
            path=path,
            file_options={"content-type": mime or "application/octet-stream"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {e}")

    if upload_resp is None:
        raise HTTPException(status_code=500, detail="Upload failed (no response)")
    if isinstance(upload_resp, dict):
        err = upload_resp.get("error") or upload_resp.get("message")
        if err:
            raise HTTPException(status_code=500, detail=f"Upload failed: {err}")

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
            public_url = str(public_result)
    else:
        public_url = str(public_result)

    u = sb.table("documents").update({
        "file_path": path,
        "file_url": public_url,
    }).eq("id", doc_id).execute()
    if u.data:
        doc = u.data[0]

    # Best-effort RAG index
    if enable_rag:
        try:
            try:
                job_store.start(str(doc_id))
                job_store.update(str(doc_id), stage="upload", progress=5, message="Đang tải lên")
            except Exception:
                pass
            engine = get_engine()
            subject_opt = str(doc.get("subject_id")) if doc.get("subject_id") is not None else None
            def _do_index():
                try:
                    extra_metadata = {
                        "author": doc.get("author"),
                        "tags": doc.get("tags") or [],
                        "created_at": doc.get("created_at"),
                        "file_url": doc.get("file_url"),
                    }
                    engine.index_document(
                        document_id=str(doc_id),
                        subject_id=subject_opt,
                        user_id=None,
                        file_bytes=content,
                        file_name=filename,
                        extra_metadata=extra_metadata,
                    )
                except Exception as e:
                    logger.exception("[RAG] Index failed for doc_id=%s: %s", doc_id, e)
                    try:
                        job_store.fail(str(doc_id), f"Index thất bại: {e}")
                    except Exception:
                        pass
            # Run inline; FastAPI may add BackgroundTasks if needed in future
            _do_index()
        except Exception as e:
            logger.exception("Failed to schedule/execute RAG indexing for doc_id=%s: %s", doc_id, e)

    return doc


@router.post("/import/google_drive")
async def import_google_drive(payload: ImportPayload):
    s = get_settings()
    file_id = payload.file_id
    if (not file_id) and payload.share_link:
        file_id = _extract_drive_file_id_from_link(str(payload.share_link))
    if not file_id:
        raise HTTPException(status_code=400, detail="Provide file_id or a valid Google Drive share_link")

    content, filename, mime, web = _drive_download(file_id, getattr(s, "google_drive_api_key", None))
    final_name = payload.name or filename
    doc = _create_doc_and_upload(
        content=content,
        filename=final_name,
        mime=mime,
        subject_id=payload.subject_id,
        link=web,
        enable_rag=bool(payload.enable_rag),
    )
    return doc


@router.post("/import/onedrive")
async def import_onedrive(payload: ImportPayload):
    s = get_settings()
    if not payload.share_link:
        raise HTTPException(status_code=400, detail="OneDrive import currently requires share_link")

    client_id = getattr(s, "ms_graph_client_id", None)
    client_secret = getattr(s, "ms_graph_client_secret", None)
    tenant_id = getattr(s, "ms_graph_tenant_id", None)
    if not (client_id and client_secret and tenant_id):
        raise HTTPException(status_code=500, detail="MS Graph credentials are not configured on server")

    token = _graph_get_token(tenant_id, client_id, client_secret)
    content, filename, mime, web = _graph_from_share(str(payload.share_link), token)
    final_name = payload.name or filename
    doc = _create_doc_and_upload(
        content=content,
        filename=final_name,
        mime=mime,
        subject_id=payload.subject_id,
        link=web,
        enable_rag=bool(payload.enable_rag),
    )
    return doc

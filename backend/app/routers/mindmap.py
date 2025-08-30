from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from ..supabase_client import get_supabase

router = APIRouter()


class MindmapGeneratePayload(BaseModel):
    document_id: Optional[str] = None
    subject_id: Optional[str] = None
    max_nodes: int = 20
    language: str = "vi"
    mode: str = Field(default="heuristic", description="heuristic|rag|llm (hiện hỗ trợ heuristic)")


class MindmapNode(BaseModel):
    id: str
    label: str
    score: Optional[float] = None
    type: Optional[str] = Field(default="concept")


class MindmapEdge(BaseModel):
    id: str
    source: str = Field(alias="source")
    target: str = Field(alias="target")
    label: Optional[str] = None
    weight: Optional[float] = None


class MindmapResponse(BaseModel):
    nodes: List[MindmapNode]
    edges: List[MindmapEdge]
    meta: Dict[str, Any]


@router.post("/mindmap/generate", response_model=MindmapResponse)
async def generate_mindmap(payload: MindmapGeneratePayload):
    if not payload.document_id and not payload.subject_id:
        raise HTTPException(status_code=400, detail="Require document_id or subject_id")

    sb = get_supabase()
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    # Heuristic: nếu có subject, lấy danh sách documents của subject làm nodes
    # Nếu chỉ có document, tạo vài nodes giả định dựa trên tên
    meta: Dict[str, Any] = {"source": "heuristic", "from": "document" if payload.document_id else "subject"}

    if payload.subject_id:
        # Lấy subject
        subj = sb.table("subjects").select("id,name,describes").eq("id", payload.subject_id).single().execute()
        if not subj.data:
            raise HTTPException(status_code=404, detail="Subject not found")
        s = subj.data
        root_id = f"subject:{s['id']}"
        nodes.append({"id": root_id, "label": s.get("name") or "Môn học", "type": "topic", "score": 1.0})

        # Lấy documents thuộc subject
        resp = sb.table("documents").select("id,name,describes").eq("subject_id", payload.subject_id).limit(payload.max_nodes).execute()
        docs = resp.data or []
        for i, d in enumerate(docs):
            nid = f"doc:{d['id']}"
            nodes.append({"id": nid, "label": d.get("name") or f"Tài liệu {i+1}", "type": "concept", "score": 0.7})
            edges.append({"id": f"e{subj.data['id']}:{d['id']}", "source": root_id, "target": nid, "label": "liên quan", "weight": 0.5})

    elif payload.document_id:
        # Lấy document cụ thể
        doc = sb.table("documents").select("id,name,describes").eq("id", payload.document_id).single().execute()
        if not doc.data:
            raise HTTPException(status_code=404, detail="Document not found")
        d = doc.data
        root_id = f"doc:{d['id']}"
        nodes.append({"id": root_id, "label": d.get("name") or "Tài liệu", "type": "topic", "score": 1.0})
        # Tạo một vài nodes con đơn giản dựa trên tên/miêu tả (placeholder)
        seeds = []
        title = (d.get("name") or "").split()
        seeds += [w for w in title if len(w) >= 4][:5]
        desc = (d.get("describes") or "").split()
        seeds += [w for w in desc if len(w) >= 6][:5]
        if not seeds:
            seeds = ["Khái niệm", "Định nghĩa", "Ví dụ", "Bài tập"]
        for i, w in enumerate(seeds[: payload.max_nodes - 1]):
            nid = f"k:{i}"
            nodes.append({"id": nid, "label": w, "type": "concept", "score": 0.6})
            edges.append({"id": f"e:{i}", "source": root_id, "target": nid, "label": "liên quan", "weight": 0.4})

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": meta,
    }

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from ..schemas import SubjectCreate, SubjectUpdate, SubjectOut
from ..supabase_client import get_supabase
from ..auth import get_current_user

router = APIRouter()


def _table_name() -> str:
    return "subjects"


@router.get("/subjects", response_model=List[SubjectOut])
async def list_subjects(workspace_id: Optional[str] = None, user=Depends(get_current_user)):
    sb = get_supabase()
    query = sb.table(_table_name()).select("*")
    if workspace_id is not None:
        query = query.eq("workspace_id", workspace_id)
    resp = query.order("id").execute()
    return resp.data or []


@router.post("/subjects", response_model=SubjectOut)
async def create_subject(payload: SubjectCreate, user=Depends(get_current_user)):
    sb = get_supabase()
    data = payload.model_dump()
    if user and (uid := user.get("sub")):
        data["user_id"] = uid
    # workspace_id is optional; if provided by FE it will be stored and enforced by RLS
    resp = sb.table(_table_name()).insert(data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create subject")
    return resp.data[0]


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
async def update_subject(subject_id: str, payload: SubjectUpdate, user=Depends(get_current_user)):
    sb = get_supabase()
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    q = sb.table(_table_name()).update(data).eq("id", subject_id)
    resp = q.execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Subject not found")
    return resp.data[0]


@router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    # First delete dependent documents to avoid FK constraint
    dq = sb.table("documents").delete().eq("subject_id", subject_id)
    dq.execute()

    # Then delete the subject
    q = sb.table(_table_name()).delete().eq("id", subject_id)
    resp = q.execute()
    # Some client versions may not return count; infer from data
    if resp.data == []:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {"ok": True}

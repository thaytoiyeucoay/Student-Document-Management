from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from ..schemas import ScheduleCreate, ScheduleUpdate, ScheduleOut
from ..supabase_client import get_supabase
from ..auth import get_current_user

router = APIRouter()


def _table_name() -> str:
    return "schedules"


@router.get("/schedules", response_model=List[ScheduleOut])
async def list_schedules(
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = None,
    subject_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    sb = get_supabase()
    q = sb.table(_table_name()).select("*")
    if user and (uid := user.get("sub")):
        q = q.eq("user_id", uid)
    if subject_id:
        q = q.eq("subject_id", subject_id)
    if from_:
        q = q.gte("starts_at", from_)
    if to:
        q = q.lte("ends_at", to)
    resp = q.order("starts_at").execute()
    return resp.data or []


@router.post("/schedules", response_model=ScheduleOut)
async def create_schedule(payload: ScheduleCreate, user=Depends(get_current_user)):
    sb = get_supabase()
    data = payload.model_dump(by_alias=True)
    if user and (uid := user.get("sub")):
        data["user_id"] = uid
    resp = sb.table(_table_name()).insert(data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create schedule")
    return resp.data[0]


@router.patch("/schedules/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(schedule_id: str, payload: ScheduleUpdate, user=Depends(get_current_user)):
    sb = get_supabase()
    data = {k: v for k, v in payload.model_dump(by_alias=True).items() if v is not None}
    q = sb.table(_table_name()).update(data).eq("id", schedule_id)
    if user and (uid := user.get("sub")):
        q = q.eq("user_id", uid)
    resp = q.execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return resp.data[0]


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    q = sb.table(_table_name()).delete().eq("id", schedule_id)
    if user and (uid := user.get("sub")):
        q = q.eq("user_id", uid)
    resp = q.execute()
    # Some client versions may not return count; infer from data
    if resp.data == []:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"ok": True}

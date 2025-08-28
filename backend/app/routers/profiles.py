from fastapi import APIRouter, HTTPException
from typing import Any, Dict
from ..supabase_client import get_supabase

router = APIRouter()


@router.get("/profiles/me")
async def get_me():
    """Return a shared public profile so the app can function without auth."""
    sb = get_supabase()
    res = sb.table("profiles").select("*").eq("id", "public").maybe_single().execute()
    data = getattr(res, "data", None)
    if data:
        return data
    # Create default public profile if missing
    created = sb.table("profiles").insert({
        "id": "public",
        "role": "student",
        "full_name": "Public",
    }).execute()
    return created.data[0] if getattr(created, "data", None) else {"id": "public", "role": "student", "full_name": "Public"}


@router.patch("/profiles/me")
async def update_me(payload: Dict[str, Any]):
    allowed = {k: v for k, v in payload.items() if k in {"full_name", "avatar_url"}}
    if not allowed:
        return await get_me()
    sb = get_supabase()
    res = sb.table("profiles").upsert({"id": "public", **allowed}).execute()
    updated = res.data[0] if getattr(res, "data", None) else {"id": "public", **allowed}
    # ensure role default
    if "role" not in updated:
        updated["role"] = "student"
    return updated

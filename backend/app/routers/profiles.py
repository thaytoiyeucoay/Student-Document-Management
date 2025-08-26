from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, Optional
from ..deps import get_profile, get_current_user_required
from ..supabase_client import get_supabase

router = APIRouter()


@router.get("/profiles/me")
async def get_me(profile: Dict[str, Any] = Depends(get_profile)):
    return profile


@router.patch("/profiles/me")
async def update_me(payload: Dict[str, Any], profile: Dict[str, Any] = Depends(get_profile)):
    allowed = {k: v for k, v in payload.items() if k in {"full_name", "avatar_url"}}
    if not allowed:
        return profile
    sb = get_supabase()
    res = sb.table("profiles").update(allowed).eq("id", profile["id"]).execute()
    updated = res.data[0] if res and getattr(res, "data", None) else {**profile, **allowed}
    return updated

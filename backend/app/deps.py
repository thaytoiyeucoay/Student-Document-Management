from typing import Optional, Dict, Any, Callable, List
from fastapi import Depends, HTTPException
from .auth import get_current_user
from .supabase_client import get_supabase


async def get_current_user_required(claims: Optional[Dict[str, Any]] = Depends(get_current_user)) -> Dict[str, Any]:
    if claims is None:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    return claims


def require_roles(*roles: str) -> Callable:
    async def checker(profile: Dict[str, Any] = Depends(get_profile)):
        role = profile.get("role")
        if role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden: insufficient role")
        return profile
    return checker


async def get_profile(claims: Dict[str, Any] = Depends(get_current_user_required)) -> Dict[str, Any]:
    """Fetch or initialize user profile from Supabase using service role.
    Creates a default student profile if not exists.
    """
    uid = claims.get("sub") or claims.get("user_id") or claims.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token claims (no uid)")
    sb = get_supabase()
    # Try get
    res = sb.table("profiles").select("*").eq("id", uid).maybe_single().execute()
    data = res.data if hasattr(res, "data") else None
    if data:
        return data
    # Create if missing
    create = sb.table("profiles").insert({
        "id": uid,
        "role": "student",
    }).execute()
    created = create.data[0] if create.data else {"id": uid, "role": "student"}
    return created


async def get_user_and_profile(
    claims: Dict[str, Any] = Depends(get_current_user_required),
    profile: Dict[str, Any] = Depends(get_profile),
) -> Dict[str, Any]:
    return {"claims": claims, "profile": profile}

from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List
from ..deps import get_profile, require_roles
from ..supabase_client import get_supabase

router = APIRouter()


def _is_owner(sb, workspace_id: int, user_id: str) -> bool:
    res = sb.table("workspaces").select("owner").eq("id", workspace_id).maybe_single().execute()
    owner = res.data.get("owner") if res and getattr(res, "data", None) else None
    return owner == user_id


@router.get("/workspaces")
async def list_my_workspaces(profile: Dict[str, Any] = Depends(get_profile)):
    sb = get_supabase()
    uid = profile["id"]
    # As member or owner
    q_owner = sb.table("workspaces").select("*").eq("owner", uid)
    owner_ws = q_owner.execute().data or []
    q_member = (
        sb.table("workspaces")
        .select("*")
        .in_("id", [m["workspace_id"] for m in (sb.table("workspace_members").select("workspace_id").eq("user_id", uid).execute().data or [])])
    )
    member_ws = q_member.execute().data or []
    # Merge unique by id
    combined = {w["id"]: w for w in (owner_ws + member_ws)}
    return list(combined.values())


@router.post("/workspaces")
async def create_workspace(payload: Dict[str, Any], profile: Dict[str, Any] = Depends(get_profile)):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    sb = get_supabase()
    created = sb.table("workspaces").insert({"name": name, "owner": profile["id"]}).execute()
    ws = created.data[0]
    # Ensure owner appears in members as owner
    sb.table("workspace_members").upsert({
        "workspace_id": ws["id"],
        "user_id": profile["id"],
        "member_role": "owner",
    }, on_conflict="workspace_id,user_id").execute()
    return ws


@router.patch("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: int, payload: Dict[str, Any], profile: Dict[str, Any] = Depends(get_profile)):
    sb = get_supabase()
    if not _is_owner(sb, workspace_id, profile["id"]):
        raise HTTPException(status_code=403, detail="Only owner can update workspace")
    allowed = {k: v for k, v in payload.items() if k in {"name"}}
    if not allowed:
        res = sb.table("workspaces").select("*").eq("id", workspace_id).maybe_single().execute()
        return res.data
    res = sb.table("workspaces").update(allowed).eq("id", workspace_id).execute()
    return res.data[0]


@router.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: int, profile: Dict[str, Any] = Depends(get_profile)):
    sb = get_supabase()
    if not _is_owner(sb, workspace_id, profile["id"]):
        raise HTTPException(status_code=403, detail="Only owner can delete workspace")
    sb.table("workspaces").delete().eq("id", workspace_id).execute()
    return {"ok": True}


@router.get("/workspaces/{workspace_id}/members")
async def list_members(workspace_id: int, profile: Dict[str, Any] = Depends(get_profile)):
    sb = get_supabase()
    # verify membership
    is_member = _is_owner(sb, workspace_id, profile["id"]) or bool(
        sb.table("workspace_members").select("id").eq("workspace_id", workspace_id).eq("user_id", profile["id"]).execute().data
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    res = sb.table("workspace_members").select("*").eq("workspace_id", workspace_id).execute()
    return res.data or []


@router.post("/workspaces/{workspace_id}/members")
async def add_member(workspace_id: int, payload: Dict[str, Any], profile: Dict[str, Any] = Depends(get_profile)):
    sb = get_supabase()
    if not _is_owner(sb, workspace_id, profile["id"]):
        raise HTTPException(status_code=403, detail="Only owner can add members")
    user_id = payload.get("user_id")
    member_role = payload.get("member_role", "editor")
    if member_role not in ("owner", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="invalid member_role")
    res = sb.table("workspace_members").upsert({
        "workspace_id": workspace_id,
        "user_id": user_id,
        "member_role": member_role,
    }, on_conflict="workspace_id,user_id").execute()
    return res.data[0] if res and getattr(res, "data", None) else {"ok": True}


@router.delete("/workspaces/{workspace_id}/members/{user_id}")
async def remove_member(workspace_id: int, user_id: str, profile: Dict[str, Any] = Depends(get_profile)):
    sb = get_supabase()
    if not _is_owner(sb, workspace_id, profile["id"]):
        raise HTTPException(status_code=403, detail="Only owner can remove members")
    sb.table("workspace_members").delete().eq("workspace_id", workspace_id).eq("user_id", user_id).execute()
    return {"ok": True}

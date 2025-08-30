from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from ..supabase_client import get_supabase

router = APIRouter()


# ===== Schemas =====
class GeneratePayload(BaseModel):
    goal: str
    deadline: str  # ISO date (YYYY-MM-DD)
    hours_per_week: float = 6
    available_days: List[str] = Field(default_factory=lambda: ["mon", "wed", "fri"])  # mon..sun
    preferred_time: str = "19:00-21:00"  # HH:MM-HH:MM
    subjects: List[str] = Field(default_factory=list)
    level: Optional[str] = Field(default="beginner")


class PlanItem(BaseModel):
    subject_id: Optional[str] = None
    title: Optional[str] = None
    starts_at: str
    ends_at: str
    focus: Optional[str] = None
    doc_refs: Optional[List[str]] = None


class GenerateResponse(BaseModel):
    plan: List[PlanItem]


class ApplyPayload(BaseModel):
    plan: List[PlanItem]


# ===== Helpers =====
_DAY_MAP = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}


def _parse_time_range(range_str: str) -> Optional[tuple[int, int]]:
    try:
        part1, part2 = range_str.split("-")
        h1, m1 = part1.split(":")
        h2, m2 = part2.split(":")
        start = int(h1) * 60 + int(m1)
        end = int(h2) * 60 + int(m2)
        if end <= start:
            return None
        return start, end
    except Exception:
        return None


def _at_minutes(date: datetime, minutes: int) -> datetime:
    return date.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=minutes)


# ===== Endpoints =====
@router.post("/learning_path/generate", response_model=GenerateResponse)
async def learning_path_generate(payload: GeneratePayload):
    if not payload.subjects:
        raise HTTPException(status_code=400, detail="subjects is required")
    if not payload.goal or not payload.goal.strip():
        raise HTTPException(status_code=400, detail="goal is required")

    start_end = _parse_time_range(payload.preferred_time) or (19 * 60, 21 * 60)
    start_m, end_m = start_end
    # session length: between 60 and 120 mins
    per_day_minutes = min(120, max(60, round((payload.hours_per_week * 60) / max(1, len(payload.available_days)))))

    today = datetime.utcnow()
    try:
        deadline = datetime.fromisoformat(payload.deadline + "T23:59:59")
    except Exception:
        raise HTTPException(status_code=400, detail="deadline invalid, expect YYYY-MM-DD")

    items: List[PlanItem] = []
    cur = today
    idx = 0
    while cur <= deadline and len(items) < 24:  # cap to 24 items for preview
        day_key = _DAY_MAP[cur.weekday()]
        if day_key in payload.available_days:
            subject_id = payload.subjects[idx % len(payload.subjects)]
            title = f"Phiên học {len(items) + 1} — " + (
                "Cơ bản" if payload.level == "beginner" else ("Ôn tập" if payload.level == "intermediate" else "Nâng cao")
            )
            start_dt = _at_minutes(cur, start_m)
            end_dt = _at_minutes(cur, min(end_m, start_m + per_day_minutes))
            items.append(PlanItem(
                subject_id=subject_id,
                title=title,
                starts_at=start_dt.isoformat(),
                ends_at=end_dt.isoformat(),
                focus=payload.goal,
                doc_refs=[],
            ))
            idx += 1
        cur = cur + timedelta(days=1)

    return GenerateResponse(plan=items)


@router.post("/learning_path/apply")
async def learning_path_apply(payload: ApplyPayload):
    if not payload.plan:
        raise HTTPException(status_code=400, detail="plan is empty")
    sb = get_supabase()
    rows: List[Dict[str, Any]] = []
    for it in payload.plan:
        if not it.starts_at or not it.ends_at:
            continue
        rows.append({
            "subject_id": it.subject_id,
            "title": it.title,
            "starts_at": it.starts_at,
            "ends_at": it.ends_at,
            "location": None,
            "note": it.focus,
            "recurrence_rule": None,
        })
    if not rows:
        raise HTTPException(status_code=400, detail="no valid items to apply")
    resp = sb.table("schedules").insert(rows).execute()
    if resp.data is None:
        raise HTTPException(status_code=500, detail="failed to insert schedules")
    return {"created": len(resp.data)}

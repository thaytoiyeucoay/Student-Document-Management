from typing import Optional, List, Union, Dict, Any
from pydantic import BaseModel, Field, AnyHttpUrl


class SubjectBase(BaseModel):
    name: str
    describes: Optional[str] = None
    # Academic semester identifier, e.g., "2025.1" or "2025.2"
    semester: Optional[str] = None


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    describes: Optional[str] = None
    semester: Optional[str] = None


class SubjectOut(SubjectBase):
    id: str  # Supabase may use UUID for id
    user_id: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentBase(BaseModel):
    subjectId: Union[int, str] = Field(..., alias="subject_id")
    name: str
    describes: Optional[str] = None
    author: Optional[str] = None
    link: Optional[AnyHttpUrl] = None
    favorite: Optional[bool] = None
    tags: Optional[List[str]] = None


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    describes: Optional[str] = None
    author: Optional[str] = None
    link: Optional[AnyHttpUrl] = None
    favorite: Optional[bool] = None
    tags: Optional[List[str]] = None


class DocumentOut(DocumentBase):
    id: str  # Supabase may use UUID for id
    file_url: Optional[str] = None
    file_path: Optional[str] = None
    created_at: Optional[str] = None
    user_id: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True


# =====================
# Schedules (Thời khóa biểu)
# =====================

class ScheduleBase(BaseModel):
    subjectId: Optional[str] = Field(default=None, alias="subject_id")
    title: Optional[str] = None
    starts_at: str  # ISO datetime string
    ends_at: str    # ISO datetime string
    location: Optional[str] = None
    note: Optional[str] = None
    recurrence_rule: Optional[Dict[str, Any]] = None  # e.g. {type:'weekly', days:[1,3], until:'...'}


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    subjectId: Optional[str] = Field(default=None, alias="subject_id")
    title: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    location: Optional[str] = None
    note: Optional[str] = None
    recurrence_rule: Optional[Dict[str, Any]] = None


class ScheduleOut(ScheduleBase):
    id: str
    user_id: Optional[str] = None

    class Config:
        from_attributes = True
        populate_by_name = True


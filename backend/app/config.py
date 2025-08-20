import os
from functools import lru_cache
from pathlib import Path
from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "React Study Backend"
    api_prefix: str = "/api"
    debug: bool = Field(default=False)

    frontend_origin: AnyHttpUrl = Field(default="http://localhost:5173")

    supabase_url: AnyHttpUrl
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_storage_bucket: str = Field(default="documents")

    # Pydantic v2 config: load env from backend/.env (not project root .env)
    _env_file = str((Path(__file__).resolve().parent.parent / ".env").resolve())
    model_config = SettingsConfigDict(env_file=_env_file, case_sensitive=False)


@lru_cache()
def get_settings() -> Settings:
    return Settings()

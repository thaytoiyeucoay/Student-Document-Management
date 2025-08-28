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

    # AI / OpenAI
    openai_api_key: str | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    openai_base_url: AnyHttpUrl | None = Field(default=None, validation_alias="OPENAI_BASE_URL")

    # Web search (Tavily)
    tavily_api_key: str | None = Field(default=None, validation_alias="TAVILY_API_KEY")

    # OCR / Tesseract: optional explicit path to tesseract executable (Windows)
    tesseract_cmd: str | None = Field(default=None, validation_alias="TESSERACT_CMD")
    # OCR / Tesseract: optional tessdata directory for language models (e.g., tessdata_best)
    tessdata_dir: str | None = Field(default=None, validation_alias="TESSDATA_DIR")

    # Google Drive (simple API key for public file download via alt=media)
    google_drive_api_key: str | None = Field(default=None, validation_alias="GOOGLE_DRIVE_API_KEY")

    # Microsoft Graph (client credentials for OneDrive share/file download)
    ms_graph_client_id: str | None = Field(default=None, validation_alias="MS_GRAPH_CLIENT_ID")
    ms_graph_client_secret: str | None = Field(default=None, validation_alias="MS_GRAPH_CLIENT_SECRET")
    ms_graph_tenant_id: str | None = Field(default=None, validation_alias="MS_GRAPH_TENANT_ID")

    # Pydantic v2 config: load env from backend/.env (not project root .env)
    _env_file = str((Path(__file__).resolve().parent.parent / ".env").resolve())
    model_config = SettingsConfigDict(env_file=_env_file, case_sensitive=False, extra="ignore")


@lru_cache()
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache
from supabase import create_client, Client
from .config import get_settings


@lru_cache()
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(str(settings.supabase_url), settings.supabase_service_role_key)

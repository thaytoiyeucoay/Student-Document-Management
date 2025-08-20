import time
import httpx
import jwt
from typing import Optional, Dict, Any
from functools import lru_cache
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import get_settings

http_bearer = HTTPBearer(auto_error=False)


class JWKSCache:
    def __init__(self):
        self.keys: Optional[Dict[str, Any]] = None
        self.expires_at: float = 0.0

    async def get_keys(self) -> Dict[str, Any]:
        settings = get_settings()
        now = time.time()
        if self.keys is None or now >= self.expires_at:
            url = f"{settings.supabase_url}/auth/v1/keys"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            self.keys = {key['kid']: key for key in data.get('keys', [])}
            self.expires_at = now + 3600  # 1h cache
        return self.keys or {}


@lru_cache()
def get_jwks_cache() -> JWKSCache:
    return JWKSCache()


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer)) -> Optional[Dict[str, Any]]:
    """Validate Supabase JWT (if provided). Returns claims dict or None for anonymous.
    Raise 401 if invalid token is provided.
    """
    if creds is None:
        return None
    token = creds.credentials
    settings = get_settings()
    jwks_cache = get_jwks_cache()
    keys = await jwks_cache.get_keys()
    unverified = jwt.get_unverified_header(token)
    kid = unverified.get('kid')
    key = keys.get(kid)
    if not key:
        raise HTTPException(status_code=401, detail="Invalid token (kid)")
    try:
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
        claims = jwt.decode(
            token,
            key=public_key,
            algorithms=[unverified.get('alg', 'RS256')],
            audience=None,
            options={"verify_aud": False},  # Supabase tokens typically have no aud
        )
        return claims
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

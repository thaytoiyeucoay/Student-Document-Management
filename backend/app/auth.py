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
            base = str(settings.supabase_url).rstrip("/")
            # Prefer well-known endpoints first
            candidates = [
                f"{base}/.well-known/jwks.json",
                f"{base}/auth/v1/.well-known/jwks.json",
                f"{base}/auth/v1/keys",
                f"{base}/auth/v1/jwks",
            ]
            # Some deployments require explicit apikey/authorization for auth endpoints
            with_headers = {
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {settings.supabase_anon_key}",
                "Accept": "application/json",
            }
            last_err: Exception | None = None
            data: Dict[str, Any] | None = None
            async with httpx.AsyncClient(timeout=10) as client:
                for url in candidates:
                    # Try without headers first (public JWKS), then with headers
                    for hdrs in ({"Accept": "application/json"}, with_headers):
                        try:
                            resp = await client.get(url, headers=hdrs)
                            resp.raise_for_status()
                            data = resp.json()
                            # Simple trace logging (non-fatal): which URL worked
                            print(f"[auth] JWKS OK: {url} headers={'with' if hdrs is with_headers else 'none'}")
                            break
                        except Exception as e:  # try next combination
                            last_err = e
                            # minimal trace for troubleshooting
                            try:
                                status = getattr(getattr(e, 'response', None), 'status_code', None)
                                print(f"[auth] JWKS fail {url} headers={'with' if hdrs is with_headers else 'none'} status={status}")
                            except Exception:
                                pass
                            continue
                    if data is not None:
                        break
            if data is None:
                # propagate last error if all failed
                if last_err:
                    raise last_err
                raise HTTPException(status_code=500, detail="Failed to fetch JWKS")

            # Accept either {"keys": [...]} or raw JWK Set (top-level keys)
            raw_keys = data.get('keys') if isinstance(data, dict) else None
            if not isinstance(raw_keys, list):
                # maybe data itself is a list or a jwk set without 'keys'
                if isinstance(data, list):
                    raw_keys = data
                else:
                    # last resort: wrap single key
                    raw_keys = [data]
            self.keys = {key.get('kid'): key for key in raw_keys if isinstance(key, dict) and key.get('kid')}
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
    try:
        keys = await jwks_cache.get_keys()
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get('kid')
        key = keys.get(kid)
        if not key:
            raise HTTPException(status_code=401, detail="Invalid token (kid)")
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
        claims = jwt.decode(
            token,
            key=public_key,
            algorithms=[unverified.get('alg', 'RS256')],
            audience=None,
            options={"verify_aud": False},  # Supabase tokens typically have no aud
        )
        return claims
    except Exception as e:
        # Fallback: validate token via Supabase /auth/v1/user
        base = str(settings.supabase_url).rstrip("/")
        url = f"{base}/auth/v1/user"
        headers = {
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        try:
            with httpx.Client(timeout=8) as client:
                resp = client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json() or {}
                    uid = data.get("id") or data.get("user", {}).get("id")
                    if uid:
                        # Decode without verification to extract claims fields if needed
                        try:
                            decoded = jwt.decode(token, options={"verify_signature": False})
                            decoded.setdefault("sub", uid)
                            return decoded
                        except Exception:
                            return {"sub": uid}
                # Trace failure once
                try:
                    print(f"[auth] Fallback /auth/v1/user failed status={resp.status_code}: {resp.text[:120]}")
                except Exception:
                    pass
        except Exception:
            pass
        # If both JWKS and fallback fail, reject
        raise HTTPException(status_code=401, detail="Invalid token")

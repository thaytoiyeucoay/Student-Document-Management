from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .routers import subjects, documents, schedules, rag

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok"}

# Routers
app.include_router(subjects.router, prefix=settings.api_prefix, tags=["subjects"])
app.include_router(documents.router, prefix=settings.api_prefix, tags=["documents"])
app.include_router(schedules.router, prefix=settings.api_prefix, tags=["schedules"])
app.include_router(rag.router, prefix=settings.api_prefix, tags=["rag"])

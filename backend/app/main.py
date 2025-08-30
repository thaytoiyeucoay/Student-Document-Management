from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .routers import subjects, documents, schedules, rag
from .routers import learning_path as learning_path_router
from .routers import quiz as quiz_router
from .routers import mindmap as mindmap_router
from .routers import imports as imports_router
from .routers import profiles as profiles_router
from .routers import ocr as ocr_router
from .rag import RAGSettings, get_engine
import logging

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)

# Logging: ensure our custom 'rag' logger emits INFO-level logs
rag_logger = logging.getLogger("rag")
if not rag_logger.handlers:
    # Do not add duplicate handlers on reload
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    handler.setFormatter(formatter)
    rag_logger.addHandler(handler)
rag_logger.setLevel(logging.INFO)
rag_logger.propagate = False

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

# Simple diagnostics: show key app and RAG settings
@app.get("/api/diag")
def diag():
    s = settings
    r = RAGSettings()  # loads from backend/.env
    return {
        "app_name": s.app_name,
        "debug": s.debug,
        "api_prefix": s.api_prefix,
        "rag": {
            "store_backend": r.store_backend,
            "embed_provider": r.embed_provider,
            "gemini_embed_model": r.gemini_embed_model,
            "llm_provider": r.llm_provider,
            "collection_name": r.collection_name,
            "chunk_size": r.chunk_size,
            "chunk_overlap": r.chunk_overlap,
        },
    }

# Force-initialize RAG engine to emit init logs and return current config snapshot
@app.get("/api/diag/rag")
def diag_rag():
    r = RAGSettings()
    # Initialize engine (lazy singleton); will log init message
    _ = get_engine()
    return {
        "rag": {
            "store_backend": r.store_backend,
            "embed_provider": r.embed_provider,
            "gemini_embed_model": r.gemini_embed_model,
            "llm_provider": r.llm_provider,
            "collection_name": r.collection_name,
            "chunk_size": r.chunk_size,
            "chunk_overlap": r.chunk_overlap,
        }
    }

@app.on_event("startup")
def on_startup():
    try:
        rag_logger.info(
            "[RAG] App startup: store_backend=%s embed_provider=%s llm_provider=%s",
            getattr(settings, "store_backend", None),
            getattr(settings, "embed_provider", None),
            getattr(settings, "llm_provider", None),
        )
    except Exception as e:
        rag_logger.exception("[RAG] Startup logging failed: %s", e)

# Routers
app.include_router(subjects.router, prefix=settings.api_prefix, tags=["subjects"])
app.include_router(documents.router, prefix=settings.api_prefix, tags=["documents"])
app.include_router(schedules.router, prefix=settings.api_prefix, tags=["schedules"])
app.include_router(rag.router, prefix=settings.api_prefix, tags=["rag"])
app.include_router(ocr_router.router, prefix=settings.api_prefix, tags=["ai"])
app.include_router(profiles_router.router, prefix=settings.api_prefix, tags=["profiles"])
app.include_router(imports_router.router, prefix=settings.api_prefix, tags=["imports"])
app.include_router(learning_path_router.router, prefix=settings.api_prefix, tags=["learning_path"])
app.include_router(mindmap_router.router, prefix=settings.api_prefix, tags=["mindmap"])
app.include_router(quiz_router.router, prefix=f"{settings.api_prefix}/quiz", tags=["quiz"])


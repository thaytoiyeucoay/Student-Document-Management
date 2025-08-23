import threading
import time
from typing import Dict, Any, Optional


class JobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: Dict[str, Dict[str, Any]] = {}

    def start(self, doc_id: str) -> None:
        with self._lock:
            self._jobs[doc_id] = {
                "doc_id": doc_id,
                "stage": "upload",  # upload -> chunking -> embedding -> storing -> indexed | failed
                "progress": 0,
                "message": "Đã nhận tệp, chuẩn bị xử lý",
                "updated_at": time.time(),
            }

    def update(self, doc_id: str, *, stage: Optional[str] = None, progress: Optional[int] = None, message: Optional[str] = None) -> None:
        with self._lock:
            job = self._jobs.setdefault(doc_id, {"doc_id": doc_id})
            if stage is not None:
                job["stage"] = stage
            if progress is not None:
                job["progress"] = int(max(0, min(100, progress)))
            if message is not None:
                job["message"] = message
            job["updated_at"] = time.time()

    def fail(self, doc_id: str, message: str) -> None:
        self.update(doc_id, stage="failed", progress=100, message=message)

    def success(self, doc_id: str) -> None:
        self.update(doc_id, stage="indexed", progress=100, message="Hoàn tất lập chỉ mục")

    def get(self, doc_id: str) -> Dict[str, Any]:
        with self._lock:
            return dict(self._jobs.get(doc_id, {"doc_id": doc_id, "stage": "unknown", "progress": 0, "message": "Không có job"}))


job_store = JobStore()

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal, Any, Dict
import re
import random
import json
import os

from ..rag import RAGEngine
import logging

router = APIRouter()


class QuizQuestion(BaseModel):
    id: str
    question: str
    choices: List[str]
    answer_index: int
    explanation: Optional[str] = None


class QuizGenerateRequest(BaseModel):
    document_id: Optional[str] = None
    subject_id: Optional[str] = None
    num_questions: int = 5
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    language: Literal["vi", "en"] = "vi"
    mode: Literal["rule", "llm", "hybrid"] = "rule"


class QuizGenerateResponse(BaseModel):
    questions: List[QuizQuestion]
    meta: dict


_engine = RAGEngine()


def _fetch_document_chunks(document_id: str, limit: int = 40) -> List[str]:
    """Fetch raw text chunks belonging to a document from the vector store."""
    texts: List[str] = []
    try:
        logging.getLogger("rag").info("Quiz._fetch_document_chunks: backend=%s doc_id=%s limit=%s", _engine.settings.store_backend, document_id, limit)
        if _engine.settings.store_backend == "chroma":
            coll = _engine._collection  # type: ignore[attr-defined]
            if coll is None:
                texts = []
            else:
                got = coll.get(where={"document_id": document_id}, include=["documents"], limit=limit)
                docs = (got or {}).get("documents") or []
                # shape: List[List[str]] or List[str]
                if docs and isinstance(docs[0], list):
                    for arr in docs:
                        texts.extend([t for t in arr if isinstance(t, str)])
                else:
                    texts.extend([t for t in docs if isinstance(t, str)])
            # Fallback: even if backend=chroma, try Supabase if available
            if not texts:
                try:
                    from ..vector_store import SupabaseVectorStore  # local import to avoid hard dep
                    svs = SupabaseVectorStore()
                    direct = svs.get_chunks_by_document(document_id=str(document_id), limit=limit)
                    texts.extend([t for t in direct if isinstance(t, str)])
                    logging.getLogger("rag").info("Quiz._fetch_document_chunks fallback supabase: got %s chunks", len(texts))
                except Exception:
                    pass
        else:
            # Supabase: fetch directly by document_id from vector store to avoid semantic bias
            svs = getattr(_engine, "_svs", None)
            if svs is None:
                texts = []
            else:
                direct = svs.get_chunks_by_document(document_id=str(document_id), limit=limit)
                texts.extend([t for t in direct if isinstance(t, str)])
            # Fallback: try Chroma if available
            if not texts:
                try:
                    coll = getattr(_engine, "_collection", None)
                    if coll is not None:
                        got = coll.get(where={"document_id": str(document_id)}, include=["documents"], limit=limit)
                        docs = (got or {}).get("documents") or []
                        if docs and isinstance(docs[0], list):
                            for arr in docs:
                                texts.extend([t for t in arr if isinstance(t, str)])
                        else:
                            texts.extend([t for t in docs if isinstance(t, str)])
                        logging.getLogger("rag").info("Quiz._fetch_document_chunks fallback chroma: got %s chunks", len(texts))
                except Exception:
                    pass
        # Always return the collected texts on success
        return texts
    except Exception:
        return texts


def _llm_generate_mcq_from_context(*, chunks: List[str], num: int, lang: str, difficulty: str) -> List[QuizQuestion]:
    """Use configured LLM provider to generate MCQs strictly from provided chunks.
    Returns list of QuizQuestion with normalized fields.
    """
    provider = (_engine.settings.llm_provider or "none").lower()
    logger = logging.getLogger("rag")
    if provider not in {"openai", "gemini", "ollama"}:
        raise HTTPException(status_code=400, detail="LLM provider chưa được cấu hình (llm_provider).")

    # Build instruction prompt (avoid str.format to keep JSON braces literal)
    lang_vi = lang == "vi"
    schema_example = '[ {"question": "string", "choices": ["string","string","string","string"], "answer_index": 0, "explanation": "string"} ]'
    directive = (
        "Bạn là hệ thống tạo câu hỏi trắc nghiệm. Chỉ sử dụng NGỮ CẢNH dưới đây, tuyệt đối không bịa. "
        f"Hãy tạo đúng {num} câu hỏi trắc nghiệm, mỗi câu có 4 lựa chọn, đánh dấu đáp án đúng. "
        "Trả về DUY NHẤT JSON theo schema: \n"
        + schema_example + "\n"
        f"Ngôn ngữ: {'Tiếng Việt' if lang_vi else 'English'}. Độ khó: {difficulty}.\n"
        "Yêu cầu: Câu hỏi phải bám sát nội dung, rõ ràng, không mơ hồ; explanation ngắn gọn.\n"
    )

    # Concatenate context (approx 5 chunks per question)
    max_chunks = max(5, int(num) * 5)
    context = "\n\n---\n".join((chunks or [])[:max_chunks])
    user_prompt = (
        ("Dưới đây là NGỮ CẢNH (trích từ tài liệu). Hãy tạo câu hỏi theo yêu cầu trên.\n\nNgữ cảnh:\n" if lang_vi else
         "Here is the CONTEXT (from the document). Create questions as required above.\n\nContext:\n")
        + context + ("\n\nChỉ trả lời bằng JSON thuần như đã mô tả." if lang_vi else "\n\nAnswer with pure JSON only as described.")
    )

    def _parse_json_array(s: str) -> List[Dict[str, Any]]:
        # Try to extract the first JSON array from text
        try:
            start = s.find("[")
            end = s.rfind("]")
            if start != -1 and end != -1 and end > start:
                return json.loads(s[start:end+1])
            return json.loads(s)
        except Exception:
            return []

    output: List[Dict[str, Any]] = []
    if provider == "openai":
        try:
            from openai import OpenAI  # type: ignore
            if not _engine.settings.openai_api_key:
                raise HTTPException(status_code=400, detail="Thiếu OPENAI_API_KEY cho LLM.")
            client = OpenAI(api_key=_engine.settings.openai_api_key)
            model = _engine.settings.openai_chat_model
            msg = [{"role": "system", "content": directive}, {"role": "user", "content": user_prompt}]
            r = client.chat.completions.create(model=model, messages=msg)
            content = (r.choices[0].message.content or "").strip()
            output = _parse_json_array(content)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Quiz LLM (openai) failed: %s", e)
            raise HTTPException(status_code=500, detail=f"LLM OpenAI lỗi: {e}")
    elif provider == "gemini":
        try:
            import google.generativeai as genai  # type: ignore
            if not _engine.settings.gemini_api_key:
                raise HTTPException(status_code=400, detail="Thiếu GEMINI_API_KEY cho LLM.")
            genai.configure(api_key=_engine.settings.gemini_api_key)
            model = genai.GenerativeModel(_engine.settings.gemini_chat_model)
            r = model.generate_content("\n\n".join([directive, user_prompt]))
            content = (getattr(r, "text", None) or "").strip()
            output = _parse_json_array(content)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Quiz LLM (gemini) failed: %s", e)
            raise HTTPException(status_code=500, detail=f"LLM Gemini lỗi: {e}")
    else:  # ollama
        try:
            import ollama  # type: ignore
            model = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
            r = ollama.chat(model=model, messages=[{"role": "system", "content": directive}, {"role": "user", "content": user_prompt}])
            content = (r.get("message", {}) or {}).get("content") or ""
            output = _parse_json_array(content)
        except Exception as e:
            logger.exception("Quiz LLM (ollama) failed: %s", e)
            raise HTTPException(status_code=500, detail=f"LLM Ollama lỗi: {e}")

    if not isinstance(output, list) or not output:
        raise HTTPException(status_code=500, detail="LLM không trả JSON hợp lệ hoặc rỗng.")

    questions: List[QuizQuestion] = []
    for i, item in enumerate(output):
        try:
            q = str(item.get("question") or "").strip()
            ch = item.get("choices") or []
            ai = int(item.get("answer_index")) if item.get("answer_index") is not None else -1
            ex = str(item.get("explanation") or "").strip() or None
            if not q or not isinstance(ch, list) or len(ch) < 2:
                continue
            # Ensure 4 choices where possible
            choices = [str(x) for x in ch][:4]
            while len(choices) < 4:
                choices.append("(không có)")
            ai = max(0, min(3, ai))
            questions.append(QuizQuestion(id=f"q{i+1}", question=q, choices=choices, answer_index=ai, explanation=ex))
            if len(questions) >= num:
                break
        except Exception:
            continue
    if not questions:
        raise HTTPException(status_code=500, detail="LLM không tạo được câu hỏi hợp lệ.")
    return questions


VN_STOP = {"và","hoặc","của","cho","trong","trên","tại","bởi","với","là","một","những","các","được","đã","sẽ","đang","này","kia","đó","khi","từ","theo","về","có","không","đến","hay","nên","cần","nếu","thì","ra","vào","cũng"}
EN_STOP = {"the","and","or","of","to","in","for","on","at","by","with","a","an","is","are","was","were","be","as","it","that","this","from","we","you","they","he","she","i","but","not","have","has","had","will","shall","can","could","may","might","do","does","did"}


def _build_mcq_from_sentence(sentence: str, lang: str, pool_words: List[str], qid: int) -> Optional[QuizQuestion]:
    s = sentence.strip()
    if len(s) < 40:
        return None
    # pick a word 4-18 chars, not numeric, not stopword
    tokens = re.findall(r"[\wÀ-ỹá-ýÂÊÔĂĐƠƯâêôăđơư]+", s)
    stop = VN_STOP if lang == "vi" else EN_STOP
    cand = [t for t in tokens if 4 <= len(t) <= 18 and t.lower() not in stop and not t.isdigit()]
    if not cand:
        return None
    answer = random.choice(cand)
    # Create cloze question
    blank = "_____"
    question = s.replace(answer, blank, 1)
    # build distractors
    distract_src = [w for w in pool_words if w.lower() != answer.lower() and w.lower() not in stop and 4 <= len(w) <= 18]
    random.shuffle(distract_src)
    distractors = []
    for w in distract_src:
        if w.lower() != answer.lower() and w not in distractors:
            distractors.append(w)
        if len(distractors) >= 3:
            break
    while len(distractors) < 3:
        # fallback random variations
        distractors.append(answer[::-1] if len(answer) > 4 else answer + "x")
    choices = distractors[:3] + [answer]
    random.shuffle(choices)
    correct_idx = choices.index(answer)
    expl = ("Điền từ còn thiếu dựa trên câu trong tài liệu." if lang == "vi" else "Fill the missing word from the document context.")
    return QuizQuestion(id=f"q{qid}", question=question, choices=choices, answer_index=correct_idx, explanation=expl)


@router.post("/generate", response_model=QuizGenerateResponse)
def generate_quiz(payload: QuizGenerateRequest):
    # Require document_id; quiz will be generated from that document only
    if not payload.document_id:
        raise HTTPException(status_code=400, detail="Require document_id. Hãy chọn tài liệu thuộc môn học để tạo quiz.")

    fetch_limit = max(10, payload.num_questions * 6)
    logging.getLogger("rag").info("Quiz.generate: mode=%s doc_id=%s num_q=%s fetch_limit=%s", payload.mode, payload.document_id, payload.num_questions, fetch_limit)
    chunks = _fetch_document_chunks(payload.document_id, limit=fetch_limit)
    if not chunks:
        raise HTTPException(status_code=404, detail="Không tìm thấy nội dung cho tài liệu này (chưa được index RAG?).")
    if payload.mode == "llm" or payload.mode == "hybrid":
        questions = _llm_generate_mcq_from_context(chunks=chunks, num=payload.num_questions, lang=payload.language, difficulty=payload.difficulty)
        return QuizGenerateResponse(
            questions=questions,
            meta={
                "mode": "llm",
                "difficulty": payload.difficulty,
                "language": payload.language,
                "document_id": payload.document_id,
            },
        )
    # rule-based (default)
    # Split into sentences pool
    sentences: List[str] = []
    for ch in chunks:
        sentences += [t.strip() for t in re.split(r"(?<=[\.!?。！？;；:])\s+", ch) if t and len(t.strip()) > 20]

    # Pool of words for distractors
    word_pool = re.findall(r"[\wÀ-ỹá-ýÂÊÔĂĐƠƯâêôăđơư]{4,18}", " ".join(chunks))

    questions: List[QuizQuestion] = []
    random.shuffle(sentences)
    for i, sent in enumerate(sentences):
        if len(questions) >= payload.num_questions:
            break
        q = _build_mcq_from_sentence(sent, payload.language, word_pool, qid=len(questions)+1)
        if q:
            questions.append(q)

    if not questions:
        raise HTTPException(status_code=500, detail="Không tạo được câu hỏi từ tài liệu này. Vui lòng thử tài liệu khác.")

    return QuizGenerateResponse(
        questions=questions,
        meta={
            "mode": "rag",
            "difficulty": payload.difficulty,
            "language": payload.language,
            "document_id": payload.document_id,
        },
    )

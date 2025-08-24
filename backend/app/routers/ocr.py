from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Optional
from ..config import get_settings
from pydantic import BaseModel
from openai import OpenAI
import base64
import io
from pypdf import PdfReader
from PIL import Image, ImageFilter, ImageOps
import pytesseract
import os
from pathlib import Path

router = APIRouter()

# Try to configure pytesseract command (useful on Windows)
try:
    s = get_settings()
    cmd = None
    # Priority: settings.tesseract_cmd -> env TESSERACT_CMD -> common Windows path
    if getattr(s, "tesseract_cmd", None):
        cmd = s.tesseract_cmd
    elif os.getenv("TESSERACT_CMD"):
        cmd = os.getenv("TESSERACT_CMD")
    else:
        common_win = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
        if common_win.exists():
            cmd = str(common_win)
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
except Exception:
    # best-effort only; if it fails, the endpoint will report a clearer error later
    pass

class TranslatePayload(BaseModel):
    text: str
    target_lang: str = "vi"
    return_format: str = "markdown"  # "text" | "markdown"


def _get_openai_client() -> OpenAI:
    # OpenAI api key should be in backend/.env as OPENAI_API_KEY
    try:
        s = get_settings()
        kwargs = {}
        if getattr(s, "openai_api_key", None):
            kwargs["api_key"] = s.openai_api_key
        if getattr(s, "openai_base_url", None):
            kwargs["base_url"] = str(s.openai_base_url)
        client = OpenAI(**kwargs)
        return client
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI client init failed: {e}")


@router.post("/ai/translate")
async def translate_text(payload: TranslatePayload):
    """Translate arbitrary text to target language. Uses a small, inexpensive model by default."""
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    client = _get_openai_client()
    system = (
        "You are a helpful translator. Translate the user's content to the target language. "
        "Preserve lists, tables, code blocks, and math. Prefer LaTeX for formulas when appropriate."
    )
    target = payload.target_lang or "vi"
    fmt = payload.return_format or "markdown"
    prompt = f"Target language: {target}. Return format: {fmt}.\n\n---\n{payload.text}"

    try:
        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {e}")
    out = res.choices[0].message.content if res.choices else ""
    return {"translated": out, "model": "gpt-4o-mini"}


@router.get("/ai/diag")
async def ai_diag():
    s = get_settings()
    return {
        "openai_api_key": bool(getattr(s, "openai_api_key", None)),
        "openai_base_url": str(getattr(s, "openai_base_url", "")) or None,
    }


@router.post("/ai/ocr_translate")
async def ocr_translate(
    file: UploadFile = File(..., description="Image or PDF to OCR"),
    target_lang: str = Form("vi"),
    mode: str = Form("both"),  # "ocr" | "translate" | "both"
    return_format: str = Form("markdown"),  # "text" | "markdown"
):
    """OCR image or PDF, then optionally translate to target_lang.
    - Images: use OpenAI Vision (gpt-4o-mini) to extract structured text and math (LaTeX when possible)
    - PDFs: try text extraction via pypdf; if empty, return 422 suggesting image-based OCR per page
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = file.filename or "file"
    mime = file.content_type or "application/octet-stream"

    # If it's a PDF, try text extraction first (fast, offline)
    extracted_text: Optional[str] = None
    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            pages_text = []
            for p in reader.pages:
                pages_text.append(p.extract_text() or "")
            extracted_text = "\n\n".join(pages_text).strip()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read PDF: {e}")

        if not extracted_text:
            raise HTTPException(status_code=422, detail="PDF appears to be scanned with no extractable text. Please convert pages to images and use image OCR.")

    # If not PDF or PDF has text: for images, call OpenAI Vision; for PDF text, skip to translation step
    client = _get_openai_client()

    if extracted_text is None:
        # Image OCR (PNG/JPEG/WebP etc.) via OpenAI Vision
        b64 = base64.b64encode(content).decode("utf-8")
        data_url = f"data:{mime};base64,{b64}"
        system = (
            "You are an OCR and math extraction expert. Read the image and output clean text. "
            "- Keep original structure where possible (headings, lists).\n"
            "- Normalize mathematical formulas using LaTeX within $...$ or $$...$$.\n"
            "- Do not add commentary; only the textual content."
        )
        try:
            res = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Perform OCR on this image and return the extracted content."},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    },
                ],
                temperature=0,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI Vision error: {e}")
        extracted_text = res.choices[0].message.content if res.choices else ""

    # Mode handling
    if mode == "ocr":
        return {"ocr_text": extracted_text, "translated": None, "model": "gpt-4o-mini"}

    # Translate step
    system = (
        "You are a helpful translator. Translate the user's content to the target language. "
        "Preserve structure and math (LaTeX)."
    )
    prompt = f"Target language: {target_lang}. Return format: {return_format}.\n\n---\n{extracted_text}"
    try:
        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI translate error: {e}")
    translated = res.choices[0].message.content if res.choices else ""

    return {"ocr_text": extracted_text, "translated": translated, "model": "gpt-4o-mini"}


# -------- Free utility: images -> single PDF --------
@router.post("/ai/images_to_pdf")
async def images_to_pdf(files: list[UploadFile] = File(..., description="One or more images (png/jpg/webp) to combine into a single PDF")):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    images: list[Image.Image] = []
    order = 0
    for f in files:
        try:
            data = await f.read()
            if not data:
                continue
            img = Image.open(io.BytesIO(data))
            # Convert to RGB to ensure PDF compatibility (no transparency)
            if img.mode in ("RGBA", "P"):  # palette or alpha
                img = img.convert("RGB")
            elif img.mode == "LA":
                img = img.convert("RGB")
            elif img.mode == "L":
                img = img.convert("RGB")
            else:
                img = img.convert("RGB")
            # Ensure image is loaded before closing file buffers
            images.append(img)
            order += 1
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image file '{f.filename}': {e}")

    if not images:
        raise HTTPException(status_code=400, detail="No valid images to convert")

    # Build PDF in-memory
    output = io.BytesIO()
    first, rest = images[0], images[1:]
    try:
        first.save(output, format="PDF", save_all=True, append_images=rest)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create PDF: {e}")

    output.seek(0)
    filename = "images.pdf" if len(files) > 1 else (files[0].filename.rsplit(".", 1)[0] + ".pdf" if files[0].filename else "image.pdf")
    headers = {"Content-Disposition": f"attachment; filename=\"{filename}\""}
    return StreamingResponse(output, media_type="application/pdf", headers=headers)


# -------- Free OCR: images -> text (Tesseract) --------
@router.post("/ai/free_ocr")
async def free_ocr(
    files: list[UploadFile] = File(..., description="One or more images (png/jpg/webp) for OCR"),
    lang: str = Form("eng"),  # e.g., "eng", "vie", or multi like "eng+vie"
    psm: int = Form(6),        # page segmentation mode; 6 = assume a single uniform block of text
    oem: int = Form(3),        # OCR Engine Mode; 3 = default
    preprocess: str = Form("enhance"),  # none|binary|adaptive|enhance
    upscale: int = Form(2),    # scale factor for small images (1 = no upscale)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    pages: list[dict] = []
    combined: list[str] = []
    for f in files:
        try:
            data = await f.read()
            if not data:
                continue
            img = Image.open(io.BytesIO(data))
            # Convert to a mode suitable for OCR
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")

            # --- Basic preprocessing to improve OCR ---
            proc = img
            # optional upscale for small text
            try:
                if isinstance(upscale, int) and upscale >= 2 and upscale <= 4:
                    new_w = min(proc.width * upscale, 4096)
                    new_h = min(proc.height * upscale, 4096)
                    if new_w > proc.width and new_h > proc.height:
                        proc = proc.resize((new_w, new_h), Image.LANCZOS)
            except Exception:
                pass

            # convert to grayscale
            gray = ImageOps.grayscale(proc)
            if preprocess == "binary":
                # global threshold
                thr = gray.point(lambda p: 255 if p > 160 else 0)
                proc = thr
            elif preprocess == "adaptive":
                # approximate adaptive by slight blur + threshold
                g2 = gray.filter(ImageFilter.MedianFilter(size=3))
                thr = g2.point(lambda p: 255 if p > 150 else 0)
                proc = thr
            elif preprocess == "enhance":
                # sharpen + light threshold
                sh = gray.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
                thr = sh.point(lambda p: 255 if p > 140 else 0)
                proc = thr
            else:
                proc = gray

            # Run Tesseract OCR only
            try:
                cfg = f"--oem {int(oem)} --psm {int(psm)}"
                try:
                    s2 = get_settings()
                    if getattr(s2, "tessdata_dir", None):
                        cfg += f" --tessdata-dir \"{s2.tessdata_dir}\""
                except Exception:
                    pass
                text = pytesseract.image_to_string(proc, lang=lang, config=cfg)
            except Exception as te:
                raise HTTPException(status_code=500, detail=f"Tesseract error: {te}. Ensure Tesseract is installed and on PATH.")
            pages.append({
                "filename": f.filename,
                "text": text,
                "chars": len(text or ""),
            })
            if text:
                combined.append(text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image file '{f.filename}': {e}")

    if not pages:
        raise HTTPException(status_code=400, detail="No valid images to OCR")

    return {
        "ok": True,
        "lang": lang,
        "pages": pages,
        "text": "\n\n".join(combined).strip(),
        "engine": "tesseract",
    }

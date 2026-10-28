"""
Phase 7 — FastAPI Backend

Endpoints:
  GET  /health               — health check
  POST /ocr/image            — multipart image upload, returns text + audio + boxes
  POST /ocr/image/base64     — base64 image upload, returns text + audio + boxes
  WS   /ocr/stream           — websocket, continuous webcam frames
"""

import asyncio
import base64
import binascii
import io
import os
import re
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path

import edge_tts
import uvicorn
import wordninja
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

# ---------------------------------------------------------------------------
# Path setup — works locally and inside Docker
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(PROJECT_ROOT))

from src.pipeline import Pipeline  # noqa: E402

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="OCR Accessibility API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
HF_REPO           = os.getenv("HF_REPO", "MoCamaraData/trocr-ocr-accessibility")
DEVICE            = os.getenv("DEVICE", "cpu")
VOICE             = "en-US-AriaNeural"
SIMILARITY_THRESH = 0.80
FEEDBACK_COOLDOWN = 2.0
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(12 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "30000000"))

# ---------------------------------------------------------------------------
# Pipeline — loaded once at startup
# ---------------------------------------------------------------------------
pipeline: Pipeline | None = None
pipeline_lock = asyncio.Lock()


async def run_pipeline(image: Image.Image) -> dict:
    """Run the shared model off the event loop and serialize inference requests."""
    if pipeline is None:
        raise HTTPException(status_code=503, detail="OCR pipeline is still loading.")
    async with pipeline_lock:
        return await run_in_threadpool(pipeline.run, image)


@app.on_event("startup")
async def load_pipeline() -> None:
    global pipeline
    pipeline = Pipeline(
        device=DEVICE,
        tts_backend="cloud",
        recognition_checkpoint=HF_REPO
    )
    print(f"Pipeline ready — model: {HF_REPO}, device: {DEVICE}")


# ---------------------------------------------------------------------------
# Text assembly
# ---------------------------------------------------------------------------
def fix_token(token: str) -> str:
    token = token.strip()
    if not token or " " in token:
        return token
    # Very short = acronym (WC, NYC, OK) — don't split
    if len(token) <= 3:
        return token
    # Try to split — works on both lowercase and uppercase
    parts = wordninja.split(token.lower())
    if len(parts) > 1:
        # Preserve original casing of the full token on each part
        return " ".join(parts)
    return token


def assemble_tokens(tokens: list[str]) -> str:
    """
    Fix and reassemble tokens into natural speech-ready text.

    - Glued words split: "tobe" → "to be", "exithere" → "exit here"
    - Single words from split boxes joined as one phrase
    - Separate regions (multi-word tokens) separated by '. '

    Examples:
      ["tobe", "ornot"]              → "to be. or not"
      ["PUSH", "DOOR", "HANDLE"]     → "PUSH DOOR HANDLE"
      ["EXIT", "PUSH DOOR HANDLE"]   → "EXIT. PUSH DOOR HANDLE"
    """
    if not tokens:
        return ""

    fixed_tokens = [fix_token(t) for t in tokens]

    segments    = []
    word_buffer = []

    for token in fixed_tokens:
        token = token.strip()
        if not token:
            continue
        if len(token.split()) == 1:
            word_buffer.append(token)
        else:
            if word_buffer:
                segments.append(" ".join(word_buffer))
                word_buffer = []
            segments.append(token)

    if word_buffer:
        segments.append(" ".join(word_buffer))

    return ". ".join(segments)


# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------
async def synthesize(tokens: list[str]) -> bytes:
    """
    Assemble tokens into natural text then make a single TTS call.
    """
    text = assemble_tokens(tokens)
    print(f"TTS synthesizing: {text!r}")
    buffer = io.BytesIO()
    communicate = edge_tts.Communicate(text, VOICE)
    async for part in communicate.stream():
        if part["type"] == "audio":
            buffer.write(part["data"])
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def extract_detections(gated_results: list) -> tuple[list[str], list]:
    tokens = []
    boxes  = []
    for r in gated_results:
        if not r.get("gated", True):
            tokens.append(r["text"])
            boxes.append(r.get("box", []))
    return tokens, boxes


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def is_new_text(current: str, previous: str) -> bool:
    if not current:
        return False
    if not previous:
        return True
    return similarity(current, previous) < SIMILARITY_THRESH


def load_image_from_bytes(image_bytes: bytes) -> Image.Image:
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large (12 MiB maximum).")
    try:
        with Image.open(io.BytesIO(image_bytes)) as source:
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413,
                    detail="Image resolution is too large to process safely.",
                )
            source.load()
            return source.convert("RGB")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Uploaded data is not a valid image.") from exc


def decode_base64_image(image_b64: str) -> Image.Image:
    max_encoded_length = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
    if len(image_b64) > max_encoded_length:
        raise HTTPException(status_code=413, detail="Image is too large (12 MiB maximum).")
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload.") from exc
    return load_image_from_bytes(image_bytes)


def build_feedback_message(result: dict) -> str:
    if result["n_boxes"] == 0:
        return "No readable text detected"
    if result["n_spoken"] == 0 and result["n_silenced"] > 0:
        return "Text detected but not clear enough to read"
    return ""


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
class ImagePayload(BaseModel):
    image: str


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "model": HF_REPO, "device": DEVICE}


# ---------------------------------------------------------------------------
# POST /ocr/image — multipart upload
# ---------------------------------------------------------------------------
@app.post("/ocr/image")
async def ocr_image(file: UploadFile = File(...)):
    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large (12 MiB maximum).")
    image = load_image_from_bytes(image_bytes)

    result = await run_pipeline(image)
    tokens, boxes = extract_detections(result["gated_results"])
    text          = " ".join(tokens)

    audio_b64 = ""
    if tokens:
        audio_bytes = await synthesize(tokens)
        audio_b64   = base64.b64encode(audio_bytes).decode()

    feedback = build_feedback_message(result) if not tokens else ""

    return {
        "text":     text,
        "tokens":   tokens,
        "boxes":    boxes,
        "feedback": feedback,
        "audio":    audio_b64,
        "meta": {
            "n_spoken":   result["n_spoken"],
            "n_silenced": result["n_silenced"],
            "latency":    result["latency"],
            "streaming":  False
        }
    }


# ---------------------------------------------------------------------------
# POST /ocr/image/base64 — base64 upload
# ---------------------------------------------------------------------------
@app.post("/ocr/image/base64")
async def ocr_image_base64(payload: ImagePayload):
    image = decode_base64_image(payload.image)

    result = await run_pipeline(image)
    tokens, boxes = extract_detections(result["gated_results"])
    text          = " ".join(tokens)

    audio_b64 = ""
    if tokens:
        audio_bytes = await synthesize(tokens)
        audio_b64   = base64.b64encode(audio_bytes).decode()

    feedback = build_feedback_message(result) if not tokens else ""

    return {
        "text":     text,
        "tokens":   tokens,
        "boxes":    boxes,
        "feedback": feedback,
        "audio":    audio_b64,
        "meta": {
            "n_spoken":   result["n_spoken"],
            "n_silenced": result["n_silenced"],
            "latency":    result["latency"],
            "streaming":  False
        }
    }


# ---------------------------------------------------------------------------
# WS /ocr/stream — continuous webcam frames
# ---------------------------------------------------------------------------
@app.websocket("/ocr/stream")
async def ocr_stream(websocket: WebSocket):
    await websocket.accept()

    last_text          = ""
    last_feedback_time = 0.0

    try:
        while True:
            data = await websocket.receive_text()

            now = time.monotonic()

            try:
                image = decode_base64_image(data)
            except HTTPException as exc:
                await websocket.send_json({
                    "type": "feedback",
                    "text": "",
                    "tokens": [],
                    "boxes": [],
                    "feedback": exc.detail,
                    "audio": "",
                })
                await websocket.send_json({"type": "processed"})
                continue

            result = await run_pipeline(image)
            tokens, boxes = extract_detections(result["gated_results"])
            text          = " ".join(tokens)

            meta = {
                "n_spoken":   result["n_spoken"],
                "n_silenced": result["n_silenced"],
                "latency":    result["latency"],
                "streaming":  True
            }

            if tokens and is_new_text(text, last_text):
                last_text = text

                await websocket.send_json({
                    "type":     "text",
                    "text":     text,
                    "tokens":   tokens,
                    "boxes":    boxes,
                    "feedback": "",
                    "audio":    "",
                    "meta":     meta
                })

                try:
                    audio_bytes = await synthesize(tokens)
                    audio_b64   = base64.b64encode(audio_bytes).decode()
                    audio_feedback = ""
                except Exception as exc:
                    print(f"TTS error: {exc}")
                    audio_b64 = ""
                    audio_feedback = "Speech synthesis failed"

                # Always send the completion message so the frontend can resume scanning.
                await websocket.send_json({
                    "type":     "audio",
                    "text":     text,
                    "tokens":   tokens,
                    "boxes":    boxes,
                    "feedback": audio_feedback,
                    "audio":    audio_b64,
                    "meta":     meta
                })

            else:
                feedback = build_feedback_message(result)
                if feedback and (now - last_feedback_time) >= FEEDBACK_COOLDOWN:
                    last_feedback_time = now
                    await websocket.send_json({
                        "type":     "feedback",
                        "text":     "",
                        "tokens":   [],
                        "boxes":    [],
                        "feedback": feedback,
                        "audio":    "",
                        "meta":     meta
                    })

            # Acknowledge only after OCR and speech synthesis are complete.
            # Otherwise the browser can send frames that pile up while TTS is awaiting the cloud.
            await websocket.send_json({"type": "processed"})

    except WebSocketDisconnect:
        pass


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

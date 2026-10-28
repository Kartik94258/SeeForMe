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
from pydantic import BaseModel, Field
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
MAX_IMAGE_BASE64_CHARS = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
TTS_TIMEOUT_S = float(os.getenv("TTS_TIMEOUT_S", "8"))

# ---------------------------------------------------------------------------
# Pipeline — loaded once at startup
# ---------------------------------------------------------------------------
pipeline: Pipeline | None = None
pipeline_lock = asyncio.Lock()


async def run_pipeline(
    image: Image.Image,
    *,
    max_crops_override: int = None,
) -> dict:
    """Run shared model off-loop; use a smaller crop budget for live frames."""
    if pipeline is None:
        raise HTTPException(status_code=503, detail="OCR pipeline is still loading.")
    async with pipeline_lock:
        if max_crops_override is None:
            return await run_in_threadpool(pipeline.run, image)
        return await run_in_threadpool(
            pipeline.run,
            image,
            max_crops_override=max_crops_override,
        )


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


async def synthesize_safely(tokens: list[str]) -> tuple[bytes, str, float]:
    """Bound cloud TTS latency and preserve OCR text when speech is unavailable."""
    started = time.perf_counter()
    try:
        audio_bytes = await asyncio.wait_for(
            synthesize(tokens),
            timeout=TTS_TIMEOUT_S,
        )
        elapsed = time.perf_counter() - started
        if not audio_bytes:
            return b"", "Speech synthesis returned no audio", elapsed
        return audio_bytes, "", elapsed
    except asyncio.TimeoutError:
        elapsed = time.perf_counter() - started
        print(f"TTS timed out after {TTS_TIMEOUT_S:.1f}s")
        return b"", "Speech synthesis timed out", elapsed
    except Exception as exc:
        elapsed = time.perf_counter() - started
        print(f"TTS synthesis failed: {exc}")
        return b"", "Speech synthesis failed", elapsed


def include_tts_latency(result: dict, tts_seconds: float) -> None:
    """Report OCR and TTS time separately while keeping total latency end-to-end."""
    latency = result.get("latency")
    if not isinstance(latency, dict):
        return

    ocr_seconds = latency.get("ocr_total_s", latency.get("total_s", 0.0))
    latency["ocr_total_s"] = ocr_seconds
    latency["tts_s"] = round(tts_seconds, 4)
    latency["total_s"] = round(ocr_seconds + tts_seconds, 4)
    latency["within_budget"] = latency["total_s"] <= getattr(pipeline, "budget_s", 2.0)


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
        raise HTTPException(status_code=413, detail=f"Image is too large (maximum {MAX_IMAGE_BYTES} bytes).")
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
    if len(image_b64) > MAX_IMAGE_BASE64_CHARS:
        raise HTTPException(status_code=413, detail=f"Image is too large (maximum {MAX_IMAGE_BYTES} bytes).")
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload.") from exc
    return load_image_from_bytes(image_bytes)


def build_feedback_message(result: dict) -> str:
    if result["n_boxes"] == 0:
        return "No text found. Move closer, improve lighting, and hold the camera steady."
    if result["n_spoken"] == 0 and result["n_silenced"] > 0:
        return "Text found, but recognition confidence is low. Move closer or improve focus."
    return ""


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
class ImagePayload(BaseModel):
    image: str = Field(max_length=MAX_IMAGE_BASE64_CHARS)


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
        raise HTTPException(status_code=413, detail=f"Image is too large (maximum {MAX_IMAGE_BYTES} bytes).")
    image = load_image_from_bytes(image_bytes)

    result = await run_pipeline(image)
    tokens, boxes = extract_detections(result["gated_results"])
    text          = " ".join(tokens)

    audio_b64 = ""
    audio_feedback = ""
    tts_elapsed = 0.0
    if tokens:
        audio_bytes, audio_feedback, tts_elapsed = await synthesize_safely(tokens)
        if audio_bytes:
            audio_b64 = base64.b64encode(audio_bytes).decode()
    include_tts_latency(result, tts_elapsed)

    feedback = build_feedback_message(result) if not tokens else audio_feedback

    return {
        "text":     text,
        "tokens":   tokens,
        "boxes":    boxes,
        "feedback": feedback,
        "audio":    audio_b64,
        "meta": {
            "n_boxes":    result["n_boxes"],
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
    audio_feedback = ""
    tts_elapsed = 0.0
    if tokens:
        audio_bytes, audio_feedback, tts_elapsed = await synthesize_safely(tokens)
        if audio_bytes:
            audio_b64 = base64.b64encode(audio_bytes).decode()
    include_tts_latency(result, tts_elapsed)

    feedback = build_feedback_message(result) if not tokens else audio_feedback

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

    last_text = ""
    last_text_seen = 0.0
    last_feedback_time = 0.0
    send_lock = asyncio.Lock()
    # OCR should not wait for cloud TTS. Keep only a few pending announcements
    # so speech remains useful without building a long queue of stale phrases.
    tts_queue: asyncio.Queue = asyncio.Queue(maxsize=3)

    async def send_message(message: dict) -> None:
        async with send_lock:
            await websocket.send_json(message)

    async def speech_worker() -> None:
        while True:
            job = await tts_queue.get()
            try:
                result = job["result"]
                tokens = job["tokens"]
                audio_bytes, audio_feedback, tts_elapsed = await synthesize_safely(tokens)
                include_tts_latency(result, tts_elapsed)
                audio_b64 = base64.b64encode(audio_bytes).decode() if audio_bytes else ""
                await send_message({
                    "type": "audio",
                    "text": job["text"],
                    "tokens": tokens,
                    "boxes": job["boxes"],
                    "regions": job["regions"],
                    "feedback": audio_feedback,
                    "audio": audio_b64,
                    "meta": job["meta"],
                })
            except asyncio.CancelledError:
                raise
            except WebSocketDisconnect:
                return
            except Exception as exc:
                print(f"Streaming speech delivery failed: {exc}")
            finally:
                tts_queue.task_done()

    worker_task = asyncio.create_task(speech_worker())
    try:
        while True:
            data = await websocket.receive_text()
            now = time.monotonic()

            try:
                image = decode_base64_image(data)
            except HTTPException as exc:
                await send_message({
                    "type": "feedback",
                    "text": "",
                    "tokens": [],
                    "boxes": [],
                    "regions": [],
                    "feedback": exc.detail,
                    "audio": "",
                })
                await send_message({"type": "processed"})
                continue

            try:
                # Live reading prioritizes latency; uploads keep the full crop limit.
                result = await run_pipeline(image, max_crops_override=8)
            except Exception as exc:
                print(f"OCR stream processing failed: {exc}")
                await send_message({
                    "type": "feedback",
                    "text": "",
                    "tokens": [],
                    "boxes": [],
                    "regions": [],
                    "feedback": "OCR processing failed. Please try again.",
                    "audio": "",
                })
                await send_message({"type": "processed"})
                continue

            tokens, boxes = extract_detections(result["gated_results"])
            text = " ".join(tokens)
            regions = [
                {
                    "box": item.get("box", []),
                    "text": item.get("text", ""),
                    "confidence": float(item.get("confidence", 0.0)),
                    "gated": bool(item.get("gated", False)),
                }
                for item in result["gated_results"]
            ]
            meta = {
                "n_boxes": result["n_boxes"],
                "n_spoken": result["n_spoken"],
                "n_silenced": result["n_silenced"],
                "latency": result["latency"],
                "streaming": True,
            }

            # Let the client capture the next frame as soon as OCR has finished.
            # TTS runs in the worker above and cannot stall the camera scan loop.
            if tokens and is_new_text(text, last_text):
                last_text = text
                last_text_seen = now

                await send_message({
                    "type": "text",
                    "text": text,
                    "tokens": tokens,
                    "boxes": boxes,
                    "regions": regions,
                    "feedback": "",
                    "audio": "",
                    "meta": meta,
                })

                job = {
                    "result": result,
                    "text": text,
                    "tokens": tokens,
                    "boxes": boxes,
                    "regions": regions,
                    "meta": meta,
                }
                if tts_queue.full():
                    # Drop the oldest waiting phrase, not the phrase currently speaking.
                    try:
                        tts_queue.get_nowait()
                        tts_queue.task_done()
                    except asyncio.QueueEmpty:
                        pass
                tts_queue.put_nowait(job)
            else:
                # Keep the current phrase deduplicated while it remains in view,
                # but allow it to be spoken again after the user points elsewhere.
                if tokens:
                    last_text_seen = now
                elif now - last_text_seen > 2.5:
                    last_text = ""

                feedback = build_feedback_message(result)
                if feedback and (now - last_feedback_time) >= FEEDBACK_COOLDOWN:
                    last_feedback_time = now
                    await send_message({
                        "type": "feedback",
                        "text": "",
                        "tokens": [],
                        "boxes": [],
                        "feedback": feedback,
                        "audio": "",
                        "meta": meta,
                    })

            await send_message({"type": "processed"})

    except WebSocketDisconnect:
        pass
    finally:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass


# ---------------------------------------------------------------------------
# Local dev entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

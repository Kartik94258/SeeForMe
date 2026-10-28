# app/backend/

FastAPI server that wraps the OCR pipeline and exposes it over HTTP and WebSocket.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns model name and device info |
| `POST` | `/ocr/image` | Multipart image upload → text, boxes, audio (base64 MP3) |
| `POST` | `/ocr/image/base64` | JSON body with base64 image → same response schema |
| `WS` | `/ocr/stream` | WebSocket — continuous webcam frames, streams results back |

### Response schema (HTTP endpoints)

```json
{
  "text": "PUSH DOOR",
  "tokens": ["PUSH", "DOOR"],
  "boxes": [[x, y, w, h]],
  "feedback": "",
  "audio": "<base64 MP3>",
  "meta": {
    "n_spoken": 2,
    "n_silenced": 1,
    "latency": {"detection_s": 0.15, "recognition_s": 0.09, "total_s": 0.25},
    "streaming": false
  }
}
```

### WebSocket message types

- `"text"` — new text detected (audio synthesis in progress)
- `"audio"` — audio ready (base64 MP3 attached)
- `"feedback"` — no readable text, or text not clear enough to read

---

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `HF_REPO` | `MoCamaraData/trocr-ocr-accessibility` | HuggingFace model repo |
| `DEVICE` | `cuda` if available, else `cpu` | Inference device |
| `PROJECT_ROOT` | Two levels up from `main.py` | Root path for `src/` imports |

---

## Running locally

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Run from the project root so that `src/` is on the Python path.

---

## Key implementation details

- The pipeline loads once at startup — not per request.
- The WebSocket stream throttles to one frame every 300 ms (`FRAME_INTERVAL_S = 0.30`).
- Duplicate suppression — the stream only triggers TTS when the new text differs from the last spoken text by more than 20% (`SIMILARITY_THRESH = 0.80`).
- Token assembly splits glued words ("exithere" → "exit here") via `wordninja` before synthesis.
- Feedback messages are rate-limited to one every 2 seconds to avoid flooding the client.

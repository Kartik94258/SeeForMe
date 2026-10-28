---
title: VisionLens API
emoji: 👁️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
short_description: Real-time OCR inference backend for visionlens-ui.vercel.app
---

# VisionLens API

FastAPI inference backend for **VisionLens** — a real-time OCR accessibility assistant that detects, recognizes, and speaks aloud printed text from natural-scene images.

This Space serves the **backend only**. The user-facing app is on Vercel.

- **Live demo:** [visionlens-ui.vercel.app](https://visionlens-ui.vercel.app)
- **Source:** [github.com/MoCamaraData/vision-ocr-accessibility-assistant](https://github.com/MoCamaraData/vision-ocr-accessibility-assistant)
- **Model:** [MoCamaraData/trocr-ocr-accessibility](https://huggingface.co/MoCamaraData/trocr-ocr-accessibility)

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET`  | `/health`           | Model and device info |
| `POST` | `/ocr/image`        | Multipart image upload → text, boxes, audio (base64) |
| `POST` | `/ocr/image/base64` | Base64 image payload, same response schema |
| `WS`   | `/ocr/stream`       | WebSocket for continuous webcam frame processing |

## Stack

docTR (`db_resnet50`) for text detection · TrOCR fine-tuned on COCO-Text (CER 0.1998) for recognition · Edge TTS for speech · FastAPI · Docker.

Built as the capstone project for the AI program at La Cité Collégiale (Ottawa), 2026.

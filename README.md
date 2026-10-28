# VisionLens — Real-Time OCR Accessibility Assistant

[![Deploy to HuggingFace](https://github.com/MoCamaraData/vision-ocr-accessibility-assistant/actions/workflows/deploy.yml/badge.svg)](https://github.com/MoCamaraData/vision-ocr-accessibility-assistant/actions/workflows/deploy.yml)

A real-time camera-to-voice reading assistant that detects, recognizes, and speaks aloud printed text from natural-scene images. Built to help visually impaired users access signage, labels, menus, and documents in their environment, with a hard 2-second latency budget from frame to speech.

**Live demo:** [visionlens-ui.vercel.app](https://visionlens-ui.vercel.app) · **Model:** [MoCamaraData/trocr-ocr-accessibility](https://huggingface.co/MoCamaraData/trocr-ocr-accessibility) · **Experiments:** [DagsHub MLflow](https://dagshub.com/MoCamaraData/vision-ocr-accessibility-assistant/experiments)

## Problem

Visually impaired users navigate environments full of text they cannot read: store signs, restaurant menus, transit information, medication labels, price tags. Off-the-shelf OCR is tuned for clean document scans and fails on the messy, angled, low-light text that appears in the real world. The system also has to be hands-free, since a screen-based reader is not useful when the user cannot see the screen.

## Approach

The pipeline is deliberately split into three stages so each can be evaluated, swapped, and tuned independently.

**Stage 1: Text Detection (docTR · `db_resnet50`)**
A pretrained docTR detector produces axis-aligned bounding boxes for every text region in the frame. The number of detected regions is capped at 12 per frame to bound worst-case latency in the next stage.

**Stage 2: Text Recognition (TrOCR fine-tuned on COCO-Text)**
Each cropped region passes through a TrOCR model that was fine-tuned from `microsoft/trocr-base-printed` on COCO-Text. The dataset shift from clean printed text to natural-scene text was the entire reason for fine-tuning: base TrOCR is strong on documents but weak on signage. Predictions below a 0.75 confidence threshold are silenced rather than spoken aloud, on the principle that for an accessibility tool, saying nothing is better than saying the wrong thing.

**Stage 3: Text-to-Speech (Edge TTS · `en-US-AriaNeural`)**
Surviving predictions are sorted into reading order, deduplicated by IoU, and synthesized as speech using Microsoft's Edge TTS. A local `pyttsx3` fallback is included for offline use.

The entire pipeline is exposed as a FastAPI service with both HTTP and WebSocket endpoints and consumed by a React + Vite frontend that handles live camera streaming, image upload, audio playback, and i18n.

## Results

| Metric | Value | Notes |
|---|---:|---|
| **Character Error Rate (CER)** | **0.1998** | Fine-tuned TrOCR on COCO-Text test split |
| Confidence threshold | 0.75 | Below this, predictions are silenced |
| Detection cap | 12 regions / frame | Bounds worst-case recognition time |
| Latency budget | 2.0 s | Frame to speech, hard requirement |
| Frontend | Vercel | [visionlens-ui.vercel.app](https://visionlens-ui.vercel.app) |
| Backend | HuggingFace Spaces | Dockerized FastAPI service |

CER of 0.1998 means roughly 4 out of 5 characters are read correctly on first pass, which for natural-scene text is competitive with published baselines. All training runs and hyperparameters are tracked in [DagsHub MLflow](https://dagshub.com/MoCamaraData/vision-ocr-accessibility-assistant/experiments).

## Key findings

- **Detection and recognition belong in separate stages.** An end-to-end model would have been simpler to ship but harder to debug and harder to bound. Splitting the pipeline lets the recognition stage be swapped or upgraded without touching detection, and lets the detection cap enforce the latency budget.
- **Fine-tuning on the deployment domain is non-optional.** Base `trocr-base-printed` is trained on document-style text and underperforms badly on signage. Fine-tuning on COCO-Text closed most of that gap and made the system usable.
- **Silencing low-confidence predictions is better than always speaking.** Early versions spoke every detected region. Users found this disorienting because incorrect speech is harder to ignore than missing speech. The 0.75 threshold was chosen empirically to maximize signal over noise.
- **Config-driven pipeline pays off immediately.** Every constant (threshold, crop cap, latency budget, model paths, TTS voice) lives in [`configs/pipeline.yaml`](configs/pipeline.yaml). Tuning the system for a new deployment does not require code changes.
- **Bake model weights into the Docker image.** First-request latency on a fresh container drops from minutes (downloading from the Hub) to seconds. The Dockerfile pulls weights at build time using the `HF_REPO` env variable.

## Repo Structure

```
vision-ocr-accessibility-assistant/
├── app/
│   ├── backend/          FastAPI server (OCR endpoints + WebSocket stream)
│   └── frontend/         React + Vite UI (live camera, upload, i18n)
├── src/
│   ├── detection/        docTR db_resnet50 text detector
│   ├── recognition/      TrOCR processor and model
│   ├── postprocessing/   Cropper, reading-order sorter, IoU deduplicator
│   ├── tts/              Speaker (local pyttsx3 / cloud edge-tts)
│   └── utils/            Shared metrics (IoU, CER, WER)
├── configs/              YAML configuration and environment files
├── notebooks/            Jupyter notebooks (EDA → fine-tuning → demo)
├── docs/                 Architecture notes and evaluation methodology
├── scripts/              Training, evaluation, and deployment scripts
├── data/processed/       Benchmark samples
├── app.py                Gradio entry point (HuggingFace Spaces)
├── Dockerfile            Production image (bakes model weights at build time)
└── docker-compose.yml
```

## Setup

### Docker (recommended)

```bash
docker build -t visionlens .
docker run -p 7860:7860 visionlens
```

### Local development

**Backend**

```bash
cd app/backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend**

```bash
cd app/frontend
npm install
npm run dev
```

Set `VITE_API_URL` in `app/frontend/.env` to point at your backend if it is not running on the default HuggingFace Space URL.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check, returns model and device info |
| `POST` | `/ocr/image` | Multipart image upload, returns text, boxes, audio (base64) |
| `POST` | `/ocr/image/base64` | Base64 image payload, same response schema |
| `WS` | `/ocr/stream` | WebSocket for continuous webcam frame processing |

## Roadmap

**Reading and recognition**
- Long-document mode: lift the 12-crop-per-frame cap for dense text (books, menus, multi-paragraph labels) using a tiled inference strategy with a separate latency budget from the signage fast path
- Handwritten text recognition: fine-tune on a handwriting dataset (IAM or similar) to handle notes, whiteboards, and handwritten prescriptions. The current model is trained on printed text and fails on handwriting.
- Reading speed control: adjustable TTS playback speed for users with different cognitive processing needs

**Languages**
- Full multilingual recognition starting with French (the current FR toggle switches UI labels only; recognition and TTS remain English)
- Language auto-detection so the voice switches automatically without user input

**Deployment and performance**
- On-device inference for offline use (MobileViT or a quantised TrOCR variant), critical for users in stores, transit, or areas with poor connectivity
- Cold-start optimisation: model weight caching to reduce first-request latency on HuggingFace Spaces

**Evaluation**
- Real-world CER benchmark on an in-the-wild signage dataset (current 0.1998 is on COCO-Text test split, which is cleaner than typical deployment conditions)
- Per-class error analysis to identify which text types drive most failures

## Tech Stack

PyTorch, Transformers, docTR, FastAPI, React 18 + Vite 5, Docker, Edge TTS, MLflow (DagsHub), Gradio, HuggingFace Hub, Vercel.

## Capstone Project

Built as the capstone project for the AI program at **La Cité Collégiale** (Ottawa), 2026.

## License

MIT. See [LICENSE](LICENSE).

## Contact

Mohamed Sanoussy Camara · [LinkedIn](https://linkedin.com/in/mohamed-sanoussy-camara) · [Portfolio](https://mocamara-data-portfolio.vercel.app) · [GitHub](https://github.com/MoCamaraData)

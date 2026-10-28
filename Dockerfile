# ---------------------------------------------------------------------------
# Stage 1 — base image
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# Keeps Python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_REPO=MoCamaraData/trocr-ocr-accessibility \
    DEVICE=cpu \
    PROJECT_ROOT=/app

WORKDIR /app

# ---------------------------------------------------------------------------
# System dependencies
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Python dependencies
# ---------------------------------------------------------------------------
COPY app/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Copy project source
# ---------------------------------------------------------------------------
COPY src/         ./src/
COPY configs/     ./configs/
COPY app/backend/ ./app/backend/  

# ---------------------------------------------------------------------------
# Bake model weights into image at build time
# This avoids cold-start delays on Cloud Run
# Requires HF_REPO to be public
# ---------------------------------------------------------------------------
RUN python -c "\
from transformers import TrOCRProcessor, VisionEncoderDecoderModel; \
import os; \
repo = os.environ['HF_REPO']; \
print(f'Downloading {repo}...'); \
TrOCRProcessor.from_pretrained(repo); \
VisionEncoderDecoderModel.from_pretrained(repo); \
print('Model baked into image.')"

# - --------------------------------------------------------------------------
# Expose port
# ---------------------------------------------------------------------------
EXPOSE 7860

CMD ["uvicorn", "app.backend.main:app", "--host", "0.0.0.0", "--port", "7860"]

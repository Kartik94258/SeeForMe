# src/recognition/

Text recognition using Microsoft TrOCR, fine-tuned on COCO-Text.

---

## Files

### `recognizer.py`

Two-function interface matching the detection module pattern.

**`load_recognizer(device, cache_dir, checkpoint)`** — loads `TrOCRProcessor` and `VisionEncoderDecoderModel` from the given checkpoint (defaults to `microsoft/trocr-base-printed` if not specified). Moves the model to device and sets eval mode.

**`run_recognizer(processor, model, crops, device, max_new_tokens)`** — runs inference on a list of cropped PIL images. For each crop, pixel values are fed to the model's `generate()` method with `output_scores=True`. Confidence is computed as the mean of per-token max softmax probabilities across all generated tokens.

```python
from src.recognition.recognizer import load_recognizer, run_recognizer

processor, model = load_recognizer(
    device="cuda",
    checkpoint="MoCamaraData/trocr-ocr-accessibility"
)
results, latency_s = run_recognizer(processor, model, crops, device="cuda")
# results: List[{"text": str, "confidence": float}]
```

---

## Model details

| Property | Value |
|---|---|
| Base model | `microsoft/trocr-base-printed` |
| Fine-tuned checkpoint | `MoCamaraData/trocr-ocr-accessibility` |
| Training data | COCO-Text dataset |
| Character Error Rate (CER) | **0.1998** |
| Architecture | Vision Encoder-Decoder (ViT + GPT-2) |
| Max tokens per crop | 32 (configurable via `configs/pipeline.yaml`) |

---

## Confidence scoring

Confidence is the mean of `softmax(logit).max()` for each generated token. This is a proxy metric — it reflects the model's per-token certainty rather than a calibrated probability. The confidence gate in `src/confidence.py` uses `0.75` as the acceptance threshold.

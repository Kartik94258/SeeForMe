# configs/

YAML configuration files. All pipeline constants live here — nothing is hardcoded in source files.

## Files

| File | Description |
|---|---|
| `pipeline.yaml` | Pipeline hyperparameters: model names, thresholds, latency budget, TTS settings |
| `paths.yaml` | Dataset and output paths for notebooks and scripts |

---

## Key parameters (`pipeline.yaml`)

| Parameter | Default | Notes |
|---|---|---|
| `detection.model` | `db_resnet50` | docTR pretrained model |
| `detection.dedup_iou_threshold` | `0.5` | NMS threshold for overlapping boxes |
| `recognition.confidence_threshold` | `0.75` | Below this → text silenced |
| `recognition.max_crops` | `12` | Caps worst-case latency |
| `recognition.crop_padding` | `4` | Pixels of padding around each detected box |
| `latency.budget_s` | `2.0` | Hard latency requirement from Phase 0 |
| `tts.backend` | `local` | `"local"` (pyttsx3) or `"cloud"` (edge-tts) |

To change a parameter, edit `pipeline.yaml` — no source file changes needed.

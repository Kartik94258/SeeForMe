# src/detection/

Text region detection using docTR's `db_resnet50` model.

---

## Files

### `detector.py`

Wraps the docTR detection predictor with a simple two-function interface.

**`load_detector(device)`** — loads `db_resnet50` (pretrained), moves it to the specified device, sets it to eval mode, and returns the model. Called once at pipeline startup.

**`run_detector(model, img_np, img_w, img_h)`** — runs a single inference pass and converts docTR's relative `[x_min, y_min, x_max, y_max]` coordinates to absolute pixel `[x, y, w, h]` format.

```python
from src.detection.detector import load_detector, run_detector

detector = load_detector(device="cuda")
boxes, latency_s = run_detector(detector, img_np, img_w, img_h)
# boxes: List[[x, y, w, h]] in absolute pixels
```

---

## Model details

| Property | Value |
|---|---|
| Architecture | DBNet (Differentiable Binarization) |
| Backbone | ResNet-50 |
| Source | `doctr.models.detection_predictor("db_resnet50", pretrained=True)` |
| Input | HxWx3 uint8 numpy array (RGB) |
| Output | Bounding boxes in relative [0,1] coords, converted to absolute pixels |
| `assume_straight_pages` | `True` — no perspective correction applied |

Boxes with zero width or height after conversion are discarded.

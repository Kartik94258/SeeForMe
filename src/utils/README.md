# src/utils/

Shared evaluation utilities used across benchmark notebooks and the deduplicator.

---

## `metrics.py`

| Function | Description |
|---|---|
| `compute_iou(a, b)` | Intersection-over-Union for two `[x, y, w, h]` boxes |
| `xywh_to_xyxy(box)` | Converts `[x, y, w, h]` to `[x1, y1, x2, y2]` |
| `match_boxes(pred_boxes, gt_boxes, thresh=0.5)` | Greedy box matching — returns `(tp, fp, fn, ious)` |
| `compute_cer(pred, gt)` | Character Error Rate using edit distance |
| `compute_wer(pred, gt)` | Word Error Rate using edit distance |

`compute_iou` is also imported by `src/postprocessing/deduplicator.py` for NMS.

All functions operate on plain Python lists — no PyTorch or NumPy required at call time.

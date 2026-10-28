# src/postprocessing/

Three sequential transforms applied to detected bounding boxes before recognition.

---

## `deduplicator.py`

IoU-based Non-Maximum Suppression (NMS) that removes redundant overlapping boxes.

**`deduplicate_boxes(boxes, scores, iou_threshold=0.5)`**

Sorts boxes by confidence score (highest first), then greedily suppresses any box whose IoU with an already-kept box exceeds the threshold. Returns kept boxes in their original index order (not confidence order) so that downstream reading-order sorting works correctly.

This step was added after benchmarking revealed low detection precision (0.34) caused by the detector producing duplicate boxes for the same text region.

```python
from src.postprocessing.deduplicator import deduplicate_boxes

boxes, kept_indices = deduplicate_boxes(boxes, scores, iou_threshold=0.5)
```

---

## `reading_order.py`

Sorts boxes into natural reading order: top-to-bottom, left-to-right within each row.

**`sort_boxes(boxes, row_tolerance=0.6)`**

Algorithm:
1. Compute Y-centre for each box.
2. Use `row_tolerance × median_box_height` as the grouping threshold.
3. Iteratively pick the topmost remaining box as the row anchor, collect all boxes whose Y-centre is within the tolerance, sort them left-to-right by X-centre.
4. Sort rows top-to-bottom and flatten.

Returns a list of **indices** into the original boxes list, not the boxes themselves — so it can be applied to align any parallel arrays.

```python
from src.postprocessing.reading_order import sort_boxes

sorted_indices = sort_boxes(boxes, row_tolerance=0.6)
boxes_ordered  = [boxes[i] for i in sorted_indices]
```

---

## `cropper.py`

Crops each bounding box from the source image with configurable padding.

**`crop_boxes(img_pil, boxes, padding=4)`**

Adds `padding` pixels around each box, clamps to image boundaries, and returns a list of `PIL.Image` crops — one per box. Zero-area crops (after clamping) are silently skipped.

```python
from src.postprocessing.cropper import crop_boxes

crops = crop_boxes(img_pil, boxes_ordered, padding=4)
# crops: List[PIL.Image] — fed directly to run_recognizer()
```

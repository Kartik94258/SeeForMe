"""Convert docTR's normalized word detections to absolute pixel boxes."""
from __future__ import annotations

import math
from typing import Iterable, List, Sequence


def detection_rows_to_boxes(
    rows: Iterable[Sequence[float]],
    image_width: int,
    image_height: int,
) -> List[List[float]]:
    """Convert [xmin, ymin, xmax, ymax, score] rows into [x, y, w, h] pixels.

    docTR's standalone detection predictor returns normalized coordinates in the
    range [0, 1]. Confidence is intentionally ignored here; recognition applies
    the text confidence gate later in the pipeline.
    """
    if image_width <= 0 or image_height <= 0 or rows is None:
        return []

    boxes: List[List[float]] = []
    for row in rows:
        try:
            if row is None or len(row) < 4:
                continue
            x1, y1, x2, y2 = (float(row[index]) for index in range(4))
        except (TypeError, ValueError, IndexError, OverflowError):
            continue

        if not all(math.isfinite(value) for value in (x1, y1, x2, y2)):
            continue

        # Small model-coordinate drift can occur at borders; clamp safely.
        x1 = min(1.0, max(0.0, x1))
        y1 = min(1.0, max(0.0, y1))
        x2 = min(1.0, max(0.0, x2))
        y2 = min(1.0, max(0.0, y2))
        if x2 <= x1 or y2 <= y1:
            continue

        left = round(x1 * image_width, 3)
        top = round(y1 * image_height, 3)
        width = round((x2 - x1) * image_width, 3)
        height = round((y2 - y1) * image_height, 3)
        boxes.append([float(left), float(top), float(width), float(height)])

    return boxes

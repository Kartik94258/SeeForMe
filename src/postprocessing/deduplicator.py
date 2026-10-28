"""
IoU-based bounding box deduplication.
Removes overlapping boxes that likely refer to the same text region,
keeping the highest-confidence box when overlap exceeds the threshold.

This fixes the low precision (0.34) identified in benchmarks.
"""

from typing import List, Tuple
from src.utils.metrics import compute_iou

def deduplicate_boxes(
    boxes: List[List[float]],
    scores: List[float],
    iou_threshold: float = 0.5
) -> Tuple[List[List[float]], List[int]]:
    """
    Remove duplicate boxes using greedy IoU-based NMS.

    Sorts boxes by confidence score (highest first), then suppresses
    any lower-confidence box that overlaps a kept box by more than
    iou_threshold.

    Args:
        boxes:         List of [x, y, w, h] in absolute pixel coords
        scores:        Confidence score for each box (same order as boxes)
        iou_threshold: Overlap threshold above which a box is suppressed

    Returns:
        deduped_boxes:   List of kept boxes
        kept_indices:    Original indices of kept boxes (for aligning
                         other arrays like rec_results)
    """
    if not boxes:
        return [], []

    # Sort by confidence descending
    order = sorted(range(len(boxes)), key=lambda i: scores[i], reverse=True)

    kept = []
    suppressed = set()

    for i in order:
        if i in suppressed:
            continue
        kept.append(i)
        for j in order:
            if j == i or j in suppressed:
                continue
            if compute_iou(boxes[i], boxes[j]) >= iou_threshold:
                suppressed.add(j)

    # Return in original index order (not confidence order)
    # so reading order sort downstream works correctly
    kept_sorted = sorted(kept)
    return [boxes[i] for i in kept_sorted], kept_sorted

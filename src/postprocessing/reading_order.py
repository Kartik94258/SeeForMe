"""
Sorts detected text boxes into natural reading order:
top-to-bottom, left-to-right within each row.

Strategy:
  1. Compute median box height to define row tolerance
  2. Group boxes into rows where Y centres are within
     (row_tolerance * median_height) of each other
  3. Sort rows top-to-bottom, boxes within each row left-to-right
"""

from typing import List
import numpy as np


def sort_boxes(
    boxes: List[List[float]],
    row_tolerance: float = 0.6
) -> List[int]:
    """
    Args:
        boxes:         List of [x, y, w, h] in absolute pixel coords
        row_tolerance: fraction of median box height used to group
                       boxes into the same row. Higher = more lenient.

    Returns:
        List of indices into boxes, sorted in reading order.
        Returns [] if boxes is empty.
    """
    if not boxes:
        return []

    if len(boxes) == 1:
        return [0]

    arr = np.array(boxes)          # shape (N, 4): x, y, w, h
    centres_y = arr[:, 1] + arr[:, 3] / 2   # y centre of each box
    centres_x = arr[:, 0] + arr[:, 2] / 2   # x centre of each box
    median_h  = float(np.median(arr[:, 3]))
    tolerance = row_tolerance * median_h

    # Group into rows
    remaining = list(range(len(boxes)))
    rows = []

    while remaining:
        # Anchor row on the topmost remaining box
        top_idx = min(remaining, key=lambda i: centres_y[i])
        row_y   = centres_y[top_idx]

        row = [i for i in remaining if abs(centres_y[i] - row_y) <= tolerance]
        rows.append(sorted(row, key=lambda i: centres_x[i]))  # left → right
        remaining = [i for i in remaining if i not in set(row)]

    # Sort rows top → bottom
    rows.sort(key=lambda row: centres_y[row[0]])

    return [i for row in rows for i in row]

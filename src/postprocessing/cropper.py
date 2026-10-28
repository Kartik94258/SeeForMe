"""
Crops detected text regions from an image with padding.
"""
from typing import List, Tuple
from PIL import Image


def crop_boxes_with_boxes(
    img_pil: Image.Image,
    boxes: List[List[float]],
    padding: int = 4,
) -> Tuple[List[Image.Image], List[List[float]]]:
    """Return crops and exactly the boxes that produced them, in matching order."""
    width, height = img_pil.size
    crops: List[Image.Image] = []
    valid_boxes: List[List[float]] = []

    for box in boxes:
        x, y, w, h = box
        x1 = max(0, int(x) - padding)
        y1 = max(0, int(y) - padding)
        x2 = min(width, int(x + w) + padding)
        y2 = min(height, int(y + h) + padding)

        if x2 <= x1 or y2 <= y1:
            continue

        crop = img_pil.crop((x1, y1, x2, y2))
        if crop.width <= 0 or crop.height <= 0:
            continue

        crops.append(crop)
        valid_boxes.append(box)

    return crops, valid_boxes


def crop_boxes(
    img_pil: Image.Image,
    boxes: List[List[float]],
    padding: int = 4,
) -> List[Image.Image]:
    """Return cropped RGB image regions; invalid zero-area regions are skipped."""
    crops, _ = crop_boxes_with_boxes(img_pil, boxes, padding=padding)
    return crops

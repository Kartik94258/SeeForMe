"""
src/postprocessing/cropper.py

Crops detected text regions from an image with padding.

Usage:
    crops = crop_boxes(img_pil, boxes, padding=4)
    # crops: List[PIL.Image] — one per detected box
"""

from typing import List
from PIL import Image


def crop_boxes(
    img_pil: Image.Image,
    boxes: List[List[float]],
    padding: int = 4
) -> List[Image.Image]:
    """
    Crop each bounding box from the image with padding.

    Args:
        img_pil: source image as PIL.Image (RGB)
        boxes:   List of [x, y, w, h] in absolute pixel coordinates
        padding: pixels of padding to add around each box 

    Returns:
        List of cropped PIL.Image objects, one per box.
        Empty crops (zero area after clamping) are skipped.
    """
    W, H = img_pil.size
    crops = []

    for box in boxes:
        x, y, w, h = box
        x1 = max(0, int(x) - padding)
        y1 = max(0, int(y) - padding)
        x2 = min(W, int(x + w) + padding)
        y2 = min(H, int(y + h) + padding)

        if x2 > x1 and y2 > y1:
            crops.append(img_pil.crop((x1, y1, x2, y2)))

    return crops

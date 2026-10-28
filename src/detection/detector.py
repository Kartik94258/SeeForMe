"""
Wraps docTR db_resnet50 for text detection.

Loads model once at startup, exposes a simple run_detector() interface.

Usage:
    boxes, latency = run_detector(detector, img_np, img_w, img_h)
    # boxes: List[[x, y, w, h]] in absolute pixel coordinates
"""

import time
from typing import List, Tuple

import numpy as np
import torch
from doctr.models import detection_predictor


def load_detector(device: str = "cuda") -> object:
    """
    Args:
        device: "cuda" for GPU, "cpu" for local testing

    Returns:
        docTR detection predictor (already moved to device)
    """
    print(f"Loading detector (db_resnet50) on {device}...")
    model = detection_predictor(
        "db_resnet50",
        pretrained=True,
        assume_straight_pages=True
    ).to(device)
    model.eval()
    print("Detector ready")
    return model


def run_detector(
    model,
    img_np: np.ndarray,
    img_w: int,
    img_h: int
) -> Tuple[List[List[float]], float]:
    """
    Run detection on a single image.
    Args:
        model:   loaded docTR detection predictor
        img_np:  image as HxWx3 uint8 numpy array (RGB)
        img_w:   image width in pixels
        img_h:   image height in pixels

    Returns:
        boxes:   List of [x, y, w, h] in absolute pixel coordinates
        latency: inference time in seconds
    """
    t0 = time.perf_counter()
    with torch.no_grad():
        result = model([img_np])
    latency = time.perf_counter() - t0

    boxes = []
    try:
        for row in result[0]["words"]:
            # docTR returns [x_min, y_min, x_max, y_max, confidence]
            # in relative coordinates [0, 1] — convert to absolute pixels
            x1 = row[0] * img_w
            y1 = row[1] * img_h
            x2 = row[2] * img_w
            y2 = row[3] * img_h
            w, h = x2 - x1, y2 - y1
            if w > 0 and h > 0:
                boxes.append([float(x1), float(y1), float(w), float(h)])
    except (KeyError, IndexError, TypeError):
        pass

    return boxes, latency

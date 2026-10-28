"""
Wraps a configurable docTR text detection architecture.

Loads model once at startup, exposes a simple run_detector() interface.

Usage:
    boxes, latency = run_detector(detector, img_np, img_w, img_h)
    # boxes: List[[x, y, w, h]] in absolute pixel coordinates
"""

import time
from typing import List, Tuple

from src.detection.box_parser import detection_rows_to_boxes

import numpy as np
import torch
from doctr.models import detection_predictor


def load_detector(
    device: str = "cuda",
    architecture: str = "db_mobilenet_v3_large",
) -> object:
    """
    Args:
        device: "cuda" for GPU, "cpu" for local testing

    Returns:
        docTR detection predictor (already moved to device)
    """
    print(f"Loading detector ({architecture}) on {device}...")
    model = detection_predictor(
        architecture,
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
    with torch.inference_mode():
        result = model([img_np])
    latency = time.perf_counter() - t0

    try:
        rows = result[0]["words"]
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
        # Do not silently report "no text" when the detector output format changes.
        print(f"WARNING: unexpected docTR detection output: {exc}")
        return [], latency

    boxes = detection_rows_to_boxes(rows, img_w, img_h)
    return boxes, latency

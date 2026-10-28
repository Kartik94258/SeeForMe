"""
Usage:
    from src.recognition.recognizer import load_recognizer, run_recognizer

    processor, model = load_recognizer(device="cuda")
    results, latency = run_recognizer(processor, model, crops, device="cuda")
    # results: List[{"text": str, "confidence": float}]
"""

import time
from typing import List, Tuple, Dict

import numpy as np
import torch
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel, logging

# Suppress the expected pooler weight warning — those weights are unused
logging.set_verbosity_error()

DEFAULT_CHECKPOINT = "microsoft/trocr-base-printed"


def load_recognizer(
    device: str = "cuda",
    cache_dir: str = None,
    checkpoint: str = None
) -> Tuple:
    """
    Load TrOCR processor and model.

    Args:
        device:     "cuda" or "cpu"
        cache_dir:  optional path to cache model weights (useful on Drive)
        checkpoint: model name or local path — defaults to trocr-base-printed.
                    Pass fine-tuned model path here for Phase 6b.

    Returns:
        (processor, model) tuple
    """
    ckpt = checkpoint if checkpoint else DEFAULT_CHECKPOINT
    print(f"Loading recognizer: {ckpt} on {device}...")
    processor = TrOCRProcessor.from_pretrained(ckpt, cache_dir=cache_dir)
    model     = VisionEncoderDecoderModel.from_pretrained(
        ckpt, cache_dir=cache_dir
    ).to(device)
    model.eval()
    params = sum(p.numel() for p in model.parameters()) / 1e6
    print(f"Recognizer ready ✓  ({params:.0f}M parameters)")
    return processor, model


def run_recognizer(
    processor,
    model,
    crops: List[Image.Image],
    device: str = "cuda",
    max_new_tokens: int = 32
) -> Tuple[List[Dict], float]:
    """
    Run TrOCR on a list of cropped text images.

    Args:
        processor:      TrOCR processor
        model:          TrOCR model
        crops:          List of PIL.Image crops (RGB)
        device:         "cuda" or "cpu"
        max_new_tokens: max tokens to generate per crop

    Returns:
        results: List of dicts {"text": str, "confidence": float}
                 one per crop, in the same order as input
        latency: total inference time in seconds for all crops
    """
    if not crops:
        return [], 0.0

    results = []
    t0 = time.perf_counter()

    for crop in crops:
        px = processor(
            images=crop.convert("RGB"),
            return_tensors="pt"
        ).pixel_values.to(device)

        with torch.no_grad():
            out = model.generate(
                px,
                max_new_tokens=max_new_tokens,
                output_scores=True,
                return_dict_in_generate=True
            )

        text = processor.batch_decode(
            out.sequences, skip_special_tokens=True
        )[0].strip()

        # Confidence = mean of per-token max softmax probabilities
        conf = float(np.mean([
            torch.softmax(s, dim=-1).max().item()
            for s in out.scores
        ])) if out.scores else 0.0

        results.append({"text": text, "confidence": conf})

    latency = time.perf_counter() - t0
    return results, latency

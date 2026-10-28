"""
Usage:
    from src.recognition.recognizer import load_recognizer, run_recognizer

    processor, model = load_recognizer(device="cuda")
    results, latency = run_recognizer(processor, model, crops, device="cuda")
    # results: List[{"text": str, "confidence": float}]
"""

import time
from typing import List, Tuple, Dict

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
    max_new_tokens: int = 32,
    batch_size: int = 4,
) -> Tuple[List[Dict], float]:
    """Recognize cropped text regions in small batches.

    Batching avoids repeatedly invoking the model for every single word.
    Confidence retains the original metric: mean maximum-token probability,
    excluding generated steps after each sequence's first EOS token.
    """
    if not crops:
        return [], 0.0

    batch_size = max(1, int(batch_size))
    results: List[Dict] = []
    t0 = time.perf_counter()

    for offset in range(0, len(crops), batch_size):
        batch_crops = [crop.convert("RGB") for crop in crops[offset:offset + batch_size]]
        pixel_values = processor(
            images=batch_crops,
            return_tensors="pt",
        ).pixel_values.to(device)

        with torch.inference_mode():
            out = model.generate(
                pixel_values,
                max_new_tokens=max_new_tokens,
                output_scores=True,
                return_dict_in_generate=True,
            )

        texts = processor.batch_decode(out.sequences, skip_special_tokens=True)
        if out.scores:
            # [batch, steps], with one maximum-softmax probability per generated token.
            per_step_confidence = torch.stack(
                [torch.softmax(score.float(), dim=-1).amax(dim=-1) for score in out.scores],
                dim=1,
            )

            step_count = per_step_confidence.shape[1]
            token_ids = out.sequences[:, 1:1 + step_count]
            positions = torch.arange(step_count, device=token_ids.device).unsqueeze(0)

            eos_ids = model.generation_config.eos_token_id
            if eos_ids is not None:
                if isinstance(eos_ids, int):
                    eos_ids = [eos_ids]
                eos_mask = torch.zeros_like(token_ids, dtype=torch.bool)
                for eos_id in eos_ids:
                    eos_mask |= token_ids.eq(eos_id)
                # Include the EOS token itself, but ignore padded decoding steps after it.
                lengths = torch.where(eos_mask, positions + 1, step_count).amin(dim=1).clamp(min=1)
            else:
                lengths = torch.full(
                    (per_step_confidence.shape[0],),
                    step_count,
                    dtype=torch.long,
                    device=per_step_confidence.device,
                )

            active_steps = positions < lengths.unsqueeze(1)
            confidence_tensor = (
                (per_step_confidence * active_steps).sum(dim=1)
                / active_steps.sum(dim=1).clamp(min=1)
            )
            confidences = confidence_tensor.float().cpu().tolist()
        else:
            confidences = [0.0] * len(texts)

        results.extend(
            {"text": text.strip(), "confidence": float(confidence)}
            for text, confidence in zip(texts, confidences)
        )

    return results, time.perf_counter() - t0

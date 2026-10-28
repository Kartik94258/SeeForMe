"""
Confidence gating filters recognition results based on confidence score.

Low-confidence text is silenced for safety.

"""

from typing import List, Dict


def apply_gate(
    results: List[Dict],
    boxes: List[List[float]],
    threshold: float = 0.75
) -> List[Dict]:
    """
    Args:
        results:   List of {"text": str, "confidence": float}
                   from run_recognizer(), in reading order
        boxes:     List of [x, y, w, h] corresponding to each result
        threshold: minimum confidence to speak (default 0.75)

    Returns:
        List of dicts:
        {
            "text":       str,
            "confidence": float,
            "box":        [x, y, w, h],
            "gated":      bool   ← True = silenced, False = spoken
        }
        All results are returned (both spoken and silenced) so the
        visual overlay in Phase 6 can color-code boxes by gate status.
    """
    assert len(results) == len(boxes), \
        f"results ({len(results)}) and boxes ({len(boxes)}) must have same length"

    gated = []
    for result, box in zip(results, boxes):
        gated.append({
            "text":       result["text"],
            "confidence": result["confidence"],
            "box":        box,
            "gated":      result["confidence"] < threshold
        })

    n_spoken  = sum(1 for r in gated if not r["gated"])
    n_silenced = sum(1 for r in gated if r["gated"])
    print(f"Gate ({threshold}): {n_spoken} spoken, {n_silenced} silenced")

    return gated

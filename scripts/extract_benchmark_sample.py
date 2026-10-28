"""
scripts/extract_benchmark_sample.py

Run ONCE before Phase 2 benchmarking.
Extracts a reproducible sample of images + crops from COCO-Text,
copies them to data/processed/benchmark_sample/, and saves
the annotation JSON so both 02a and 02b notebooks load from it.

Usage:
    python scripts/extract_benchmark_sample.py

Outputs:
    data/processed/benchmark_sample/
        images/                  <- copied image files (detection benchmark)
        crops/                   <- cropped text regions (recognition benchmark)
        detection_sample.json    <- image_id, file_name, gt_boxes
        recognition_sample.json  <- crop_id, gt_text, bbox, image_id
        sample_stats.json        <- summary stats for verification
"""

import json
import random
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

# ── Config ───────────────────────────────────────────────────────────────────
SEED              = 42
N_DETECTION       = 200    # images for 02a (CRAFT vs DBNet)
N_RECOGNITION     = 500    # crops for 02b (EasyOCR vs TrOCR)
MIN_TEXT_LEN      = 3      # minimum GT text length for recognition crops
CROP_PADDING      = 4      # pixels of padding around each crop
MIN_CROP_SIZE     = 10     # skip crops smaller than this (px in either dimension)

# ── Paths ─────────────────────────────────────────────────────────────────────
# Works both locally and in Colab (just change DATA_ROOT if needed)
SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

DATA_ROOT     = PROJECT_ROOT / "data" / "raw"
COCO_IMG_DIR  = DATA_ROOT / "train2014"
COCOTEXT_JSON = DATA_ROOT / "cocotext.v2.json"

OUT_DIR       = PROJECT_ROOT / "data" / "processed" / "benchmark_sample"
IMG_OUT_DIR   = OUT_DIR / "images"
CROP_OUT_DIR  = OUT_DIR / "crops"

# ── Helpers ───────────────────────────────────────────────────────────────────
def to_int(x):
    try:
        return int(x)
    except (ValueError, TypeError):
        return x


def clip_bbox(x, y, w, h, W, H):
    """Clip bbox to image boundaries. Returns clipped [x, y, w, h]."""
    x1 = max(0, x)
    y1 = max(0, y)
    x2 = min(W, x + w)
    y2 = min(H, y + h)
    return x1, y1, x2 - x1, y2 - y1


def crop_pil(img, x, y, w, h, padding=CROP_PADDING):
    """Crop a PIL image with padding, clamped to image bounds."""
    W, H = img.size
    x1 = max(0, int(x) - padding)
    y1 = max(0, int(y) - padding)
    x2 = min(W, int(x + w) + padding)
    y2 = min(H, int(y + h) + padding)
    return img.crop((x1, y1, x2, y2))


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    random.seed(SEED)
    np.random.seed(SEED)

    # ── Validate paths ────────────────────────────────────────────────────────
    assert DATA_ROOT.exists(),     f"Data root not found: {DATA_ROOT}"
    assert COCO_IMG_DIR.exists(),  f"Image dir not found: {COCO_IMG_DIR}"
    assert COCOTEXT_JSON.exists(), f"JSON not found: {COCOTEXT_JSON}"

    # ── Load COCO-Text ────────────────────────────────────────────────────────
    print("Loading COCO-Text...")
    with open(COCOTEXT_JSON, "r", encoding="utf-8") as f:
        cocotext = json.load(f)

    imgs      = {to_int(k): v for k, v in cocotext["imgs"].items()}
    anns      = {to_int(k): v for k, v in cocotext["anns"].items()}
    imgToAnns = {to_int(k): [to_int(a) for a in v]
                 for k, v in cocotext["imgToAnns"].items()}

    print(f"  Images     : {len(imgs):,}")
    print(f"  Annotations: {len(anns):,}")

    # ── Create output directories ─────────────────────────────────────────────
    IMG_OUT_DIR.mkdir(parents=True, exist_ok=True)
    CROP_OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nOutput directory: {OUT_DIR}")

    # ─────────────────────────────────────────────────────────────────────────
    # PART 1 — Detection sample (full images with GT boxes)
    # Criteria: image file exists + has at least 1 legible GT box
    # ─────────────────────────────────────────────────────────────────────────
    print("\n── Building detection sample ──")

    def get_legible_boxes(image_id):
        """Return list of [x,y,w,h] for legible annotations on this image."""
        boxes = []
        for ann_id in imgToAnns.get(image_id, []):
            ann = anns.get(ann_id)
            if ann is None:
                continue
            if ann.get("legibility") != "legible":
                continue
            bbox = ann.get("bbox")
            if not bbox or len(bbox) != 4:
                continue
            x, y, w, h = bbox
            if w > 0 and h > 0:
                img_info = imgs.get(image_id, {})
                W = img_info.get("width", 99999)
                H = img_info.get("height", 99999)
                cx, cy, cw, ch = clip_bbox(x, y, w, h, W, H)
                if cw > 0 and ch > 0:
                    boxes.append([cx, cy, cw, ch])
        return boxes

    # Find all eligible image IDs
    eligible_det = [
        img_id for img_id in imgToAnns
        if get_legible_boxes(img_id)
        and (COCO_IMG_DIR / imgs[img_id]["file_name"]).exists()
    ]

    print(f"  Eligible images: {len(eligible_det):,}")
    assert len(eligible_det) >= N_DETECTION, \
        f"Not enough eligible images ({len(eligible_det)}) for sample size {N_DETECTION}"

    det_sample_ids = random.sample(eligible_det, N_DETECTION)

    # Build detection sample records + copy images
    detection_sample = []
    print(f"  Copying {N_DETECTION} images...")

    for i, img_id in enumerate(det_sample_ids):
        img_info  = imgs[img_id]
        file_name = img_info["file_name"]
        src_path  = COCO_IMG_DIR / file_name
        dst_path  = IMG_OUT_DIR / file_name

        # Copy image (skip if already copied)
        if not dst_path.exists():
            shutil.copy2(src_path, dst_path)

        gt_boxes = get_legible_boxes(img_id)
        detection_sample.append({
            "image_id":  img_id,
            "file_name": file_name,
            "width":     img_info["width"],
            "height":    img_info["height"],
            "gt_boxes":  gt_boxes,          # list of [x,y,w,h] clipped to bounds
            "n_gt_boxes": len(gt_boxes)
        })

        if (i + 1) % 50 == 0:
            print(f"    {i+1}/{N_DETECTION} done")

    # Save detection sample JSON
    det_json_path = OUT_DIR / "detection_sample.json"
    with open(det_json_path, "w", encoding="utf-8") as f:
        json.dump(detection_sample, f, indent=2)

    print(f"  Saved: {det_json_path}")
    print(f"  Total GT boxes in sample: {sum(s['n_gt_boxes'] for s in detection_sample):,}")

    # ─────────────────────────────────────────────────────────────────────────
    # PART 2 — Recognition sample (individual text crops)
    # Criteria: legible + English + text length >= MIN_TEXT_LEN + crop large enough
    # ─────────────────────────────────────────────────────────────────────────
    print("\n── Building recognition sample ──")

    eligible_crops = []

    for ann in anns.values():
        # Filter criteria
        if ann.get("legibility") != "legible":
            continue
        if str(ann.get("language", "")).strip().lower() != "english":
            continue

        text = ann.get("utf8_string", "").strip()
        if len(text) < MIN_TEXT_LEN:
            continue

        bbox = ann.get("bbox")
        if not bbox or len(bbox) != 4:
            continue

        x, y, w, h = bbox
        if w <= 0 or h <= 0:
            continue

        image_id = to_int(ann.get("image_id", -1))
        img_info = imgs.get(image_id)
        if img_info is None:
            continue

        img_path = COCO_IMG_DIR / img_info["file_name"]
        if not img_path.exists():
            continue

        # Clip bbox to image bounds
        W = img_info["width"]
        H = img_info["height"]
        cx, cy, cw, ch = clip_bbox(x, y, w, h, W, H)
        if cw < MIN_CROP_SIZE or ch < MIN_CROP_SIZE:
            continue

        eligible_crops.append({
            "image_id":  image_id,
            "file_name": img_info["file_name"],
            "bbox":      [cx, cy, cw, ch],
            "gt_text":   text,
        })

    print(f"  Eligible crops: {len(eligible_crops):,}")
    assert len(eligible_crops) >= N_RECOGNITION, \
        f"Not enough eligible crops ({len(eligible_crops)}) for sample size {N_RECOGNITION}"

    rec_sample = random.sample(eligible_crops, N_RECOGNITION)

    # Save each crop as an image file + build record
    print(f"  Cropping and saving {N_RECOGNITION} crops...")
    recognition_sample = []

    for i, item in enumerate(rec_sample):
        src_path  = COCO_IMG_DIR / item["file_name"]
        img_pil   = Image.open(src_path).convert("RGB")

        x, y, w, h = item["bbox"]
        crop_pil_img = crop_pil(img_pil, x, y, w, h)

        # Unique crop filename: imageID_x_y_w_h.jpg
        crop_fname = f"{item['image_id']}_{int(x)}_{int(y)}_{int(w)}_{int(h)}.jpg"
        crop_path  = CROP_OUT_DIR / crop_fname
        crop_pil_img.save(crop_path, quality=95)

        recognition_sample.append({
            "crop_id":    i,
            "crop_file":  crop_fname,
            "image_id":   item["image_id"],
            "file_name":  item["file_name"],
            "bbox":       item["bbox"],
            "gt_text":    item["gt_text"],
            "text_len":   len(item["gt_text"]),
            "crop_w":     crop_pil_img.size[0],
            "crop_h":     crop_pil_img.size[1],
        })

        if (i + 1) % 100 == 0:
            print(f"    {i+1}/{N_RECOGNITION} done")

    # Save recognition sample JSON
    rec_json_path = OUT_DIR / "recognition_sample.json"
    with open(rec_json_path, "w", encoding="utf-8") as f:
        json.dump(recognition_sample, f, indent=2)

    print(f"  Saved: {rec_json_path}")

    # ─────────────────────────────────────────────────────────────────────────
    # PART 3 — Sample stats (for verification)
    # ─────────────────────────────────────────────────────────────────────────
    text_lengths   = [r["text_len"]  for r in recognition_sample]
    crop_widths    = [r["crop_w"]    for r in recognition_sample]
    crop_heights   = [r["crop_h"]   for r in recognition_sample]
    gt_box_counts  = [s["n_gt_boxes"] for s in detection_sample]

    stats = {
        "seed": SEED,
        "detection": {
            "n_images":         len(detection_sample),
            "total_gt_boxes":   sum(gt_box_counts),
            "mean_gt_boxes_per_image": float(np.mean(gt_box_counts)),
            "min_gt_boxes":     int(min(gt_box_counts)),
            "max_gt_boxes":     int(max(gt_box_counts)),
        },
        "recognition": {
            "n_crops":          len(recognition_sample),
            "mean_text_len":    float(np.mean(text_lengths)),
            "median_text_len":  float(np.median(text_lengths)),
            "mean_crop_w":      float(np.mean(crop_widths)),
            "mean_crop_h":      float(np.mean(crop_heights)),
            "min_crop_w":       int(min(crop_widths)),
            "min_crop_h":       int(min(crop_heights)),
        }
    }

    stats_path = OUT_DIR / "sample_stats.json"
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    # ── Final summary ─────────────────────────────────────────────────────────
    print("\n" + "=" * 50)
    print("  BENCHMARK SAMPLE EXTRACTION COMPLETE")
    print("=" * 50)
    print(f"  Detection images : {len(detection_sample)}")
    print(f"  Recognition crops: {len(recognition_sample)}")
    print(f"  Output dir       : {OUT_DIR}")
    print(f"\n  Files saved:")
    print(f"    detection_sample.json   ({det_json_path.stat().st_size / 1024:.1f} KB)")
    print(f"    recognition_sample.json ({rec_json_path.stat().st_size / 1024:.1f} KB)")
    print(f"    sample_stats.json")
    print(f"    images/   ({len(list(IMG_OUT_DIR.iterdir()))} files)")
    print(f"    crops/    ({len(list(CROP_OUT_DIR.iterdir()))} files)")
    print(f"\n  Next step: upload data/processed/benchmark_sample/ to Google Drive")
    print(f"  Then run 02a_detection_benchmark.ipynb and 02b_recognition_benchmark.ipynb")


if __name__ == "__main__":
    main()

"""
Shared scoring utilities used across benchmark notebooks.
"""

import editdistance
import numpy as np


def xywh_to_xyxy(box):
    x, y, w, h = box
    return [x, y, x + w, y + h]


def compute_iou(a, b):
    ax1, ay1, ax2, ay2 = xywh_to_xyxy(a)
    bx1, by1, bx2, by2 = xywh_to_xyxy(b)
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    ua = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / ua if ua > 0 else 0.0


def match_boxes(pred_boxes, gt_boxes, thresh=0.5):
    tp, fp = 0, 0
    ious, matched_gt = [], set()
    for pb in pred_boxes:
        best_iou, best_j = 0.0, -1
        for j, gb in enumerate(gt_boxes):
            if j in matched_gt:
                continue
            iou = compute_iou(pb, gb)
            if iou > best_iou:
                best_iou, best_j = iou, j
        if best_iou >= thresh:
            tp += 1
            matched_gt.add(best_j)
            ious.append(best_iou)
        else:
            fp += 1
    fn = len(gt_boxes) - len(matched_gt)
    return tp, fp, fn, ious


def compute_cer(pred, gt):
    pred, gt = pred.strip().lower(), gt.strip().lower()
    if not gt:
        return 0.0
    return editdistance.eval(pred, gt) / len(gt)


def compute_wer(pred, gt):
    pw = pred.strip().lower().split()
    gw = gt.strip().lower().split()
    if not gw:
        return 0.0
    return editdistance.eval(pw, gw) / len(gw)

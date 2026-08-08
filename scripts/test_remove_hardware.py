"""Unit tests for the SAM2 hardware-mask classification in
batch-clean-photos.py. Pure geometry/numpy — no torch, no model download,
mirrors the approach of test_ghost_mannequin.py.

Run: python scripts/test_remove_hardware.py
"""
import importlib.util
import sys
from pathlib import Path

import numpy as np

_spec = importlib.util.spec_from_file_location(
    "batch_clean_photos", Path(__file__).parent / "batch-clean-photos.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
classify_hardware_masks = _module.classify_hardware_masks
parse_point_arg = _module.parse_point_arg
adjust_points_to_crop = _module.adjust_points_to_crop

W, H = 400, 600


def mask_from_bbox(x1, y1, x2, y2):
    """Return a SAM2-style mask dict for a rectangular bbox region."""
    seg = np.zeros((H, W), dtype=bool)
    seg[y1:y2, x1:x2] = True
    return {"segmentation": seg, "area": float(seg.sum()), "bbox": [x1, y1, x2, y2]}


def make_garment():
    """Central garment mask — big, not touching any border."""
    return mask_from_bbox(120, 120, 280, 480)


def run(name, masks, expect_labels, expect_bboxes=None):
    union, _ = classify_hardware_masks(masks, W, H)
    got = set()
    bboxes = expect_bboxes or {}
    if union is not None:
        # Verify each expected region by checking the union covers its pixels
        for label in expect_labels:
            bbox = bboxes.get(label)
            if bbox is None or union[bbox[1] : bbox[3], bbox[0] : bbox[2]].any():
                got.add(label)
    ok = got == set(expect_labels)
    print(f"{'PASS' if ok else 'FAIL'}: {name} -> found {sorted(got)}")
    if not ok:
        print(f"      expected {sorted(expect_labels)}")
        sys.exit(1)


# 1. Garment + hanging hanger (top border) + stand (bottom border) + tiny hook
garment = make_garment()
hanger = mask_from_bbox(180, 0, 220, 140)      # touches top border, above garment
stand = mask_from_bbox(60, 560, 340, 600)      # touches bottom border (mannequin stand)
hook = mask_from_bbox(190, 2, 210, 10)         # tiny — below the 0.4% area floor
run(
    "hanger + stand removed, tiny hook ignored",
    [garment, hanger, stand, hook],
    ["hanger", "stand"],
    {"hanger": (0, 0, 220, 140), "stand": (60, 560, 340, 600)},
)

# 1b. Full-frame wall mask (bigger than the garment, touches all borders)
# must NOT be treated as the garment — the garment is the largest
# border-free mask, and the wall is too big to be hardware either.
wall = mask_from_bbox(0, 0, W, H)
run("wall mask ignored, garment identified correctly", [wall, garment], [])

# 2. Only the garment — nothing qualifies
run("garment only -> no hardware", [garment], [])

# 3. A prop that overlaps the garment heavily is NOT hardware (it IS the garment)
overlap_prop = mask_from_bbox(140, 140, 260, 300)  # inside garment bbox, 100% overlap
run("overlapping mask excluded (it is the garment)", [garment, overlap_prop], [])

# 4. Bedsheet remnant touching the bottom border -> hardware
sheet = mask_from_bbox(0, 540, 400, 600)
run("bedsheet bottom remnant removed", [garment, sheet], ["sheet"], {"sheet": (0, 540, 400, 600)})

# 5. Mid-air side object not touching border, not above garment -> NOT hardware
side_prop = mask_from_bbox(10, 200, 90, 380)
run("mid-air side prop excluded", [garment, side_prop], [])

# 6. Empty mask list -> (None, None)
union, gb = classify_hardware_masks([], W, H)
assert union is None and gb is None, "empty masks must return (None, None)"

# 7. Garment bbox reported correctly (nonzero max index = 479 for a mask
# covering rows 120..479 inclusive)
_, gb = classify_hardware_masks([garment, hanger], W, H)
assert gb == (120, 479), f"garment bbox wrong: {gb}"

# ─── parse_point_arg ────────────────────────────────────────────────
assert parse_point_arg(None) == []
assert parse_point_arg("") == []
assert parse_point_arg("0.5,0.3") == [(0.5, 0.3)]
assert parse_point_arg("0.5,0.3;0.6,0.25") == [(0.5, 0.3), (0.6, 0.25)]
assert parse_point_arg(" 0.5 , 0.3 ; 0.6,0.25 ") == [(0.5, 0.3), (0.6, 0.25)]
print("PASS: parse_point_arg")

# ─── adjust_points_to_crop ──────────────────────────────────────────
# No crop: normalized -> raw px (200x300 frame).
assert adjust_points_to_crop([(0.5, 0.5), (0.25, 0.1)], None, 200, 300) == [
    (100, 150),
    (50, 30),
]
# With crop (40, 60, 160, 240): taps offset into the cropped frame. The
# second tap maps to raw (50, 30) — above the crop's y1=60 — so it's dropped.
assert adjust_points_to_crop([(0.5, 0.5), (0.25, 0.1)], (40, 60, 160, 240), 200, 300) == [
    (60, 90)
]
# Tap outside the crop (raw px 20,30 lands left of x1=40) is dropped.
assert adjust_points_to_crop([(0.5, 0.5), (0.1, 0.1)], (40, 60, 160, 240), 200, 300) == [
    (60, 90)
]
assert adjust_points_to_crop([], (40, 60, 160, 240), 200, 300) == []
print("PASS: adjust_points_to_crop")

print("\n7/7 hardware-mask classification + 2/2 point-prompt helpers passed")

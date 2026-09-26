"""
Heuristic cloth-agnostic mask generation.

Approximates the garment region as a rectangle over the person's rembg
silhouette bbox (shoulders-to-waist for "upper", etc.) — no pose/parsing
model required. Lower quality than AutoMasker (DensePose+SCHP) but no
extra GPU weights or inference cost. AutoMasker is the planned upgrade
once this is validated end-to-end.
"""
import numpy as np
import cv2
from PIL import Image

# (top, bottom) as fraction of silhouette bbox height
VERTICAL_RANGES = {
    "upper": (0.20, 0.55),
    "lower": (0.45, 0.90),
    "overall": (0.18, 0.90),
}


def person_silhouette(person_pil: Image.Image) -> np.ndarray:
    """Alpha-channel silhouette via rembg; full-white fallback if unavailable."""
    try:
        from rembg import remove as rembg_remove
        output = rembg_remove(person_pil)
        if output.mode == "RGBA":
            return np.array(output.split()[-1])
    except (ImportError, SystemExit, Exception):
        # rembg's bg.py calls sys.exit(1) (not ImportError) when its onnx
        # backend is missing/broken — catch SystemExit too or it kills the
        # whole worker instead of falling back.
        pass
    return np.ones((person_pil.height, person_pil.width), dtype=np.uint8) * 255


def generate_heuristic_mask(person_pil: Image.Image, cloth_type: str = "upper") -> Image.Image:
    """Rectangle-over-silhouette cloth mask. cloth_type: upper/lower/overall."""
    if cloth_type not in VERTICAL_RANGES:
        cloth_type = "upper"

    silhouette = person_silhouette(person_pil)
    w, h = person_pil.width, person_pil.height

    ys, xs = np.where(silhouette > 127)
    if len(ys) == 0:
        y0, y1, x0, x1 = 0, h, 0, w
    else:
        y0, y1 = int(ys.min()), int(ys.max())
        x0, x1 = int(xs.min()), int(xs.max())

    person_h = y1 - y0
    frac_top, frac_bot = VERTICAL_RANGES[cloth_type]
    rect_y0 = int(y0 + frac_top * person_h)
    rect_y1 = int(y0 + frac_bot * person_h)
    margin_x = int(0.05 * (x1 - x0))
    rect_x0 = max(x0 + margin_x, 0)
    rect_x1 = min(x1 - margin_x, w)

    rect = np.zeros((h, w), dtype=np.uint8)
    rect[rect_y0:rect_y1, rect_x0:rect_x1] = 255

    mask = cv2.bitwise_and(rect, silhouette)

    kernel_size = max(3, (max(w, h) // 100) | 1)  # force odd
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=2)
    mask = cv2.GaussianBlur(mask, (kernel_size, kernel_size), 0)
    mask[mask >= 128] = 255
    mask[mask < 128] = 0

    return Image.fromarray(mask)

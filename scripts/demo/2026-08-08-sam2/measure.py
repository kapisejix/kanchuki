"""Measure residual grey 'plastic/hanger/mannequin' pixels inside the garment
cutout for raw vs engine-only vs SAM2-pro outputs — the docs' §2.3 metric,
re-run for this session's SAM2 build. Grey = low saturation + mid luminance
(the mannequin bust, hanger, wall hook colors), exactly what the 2026-08-07
report measured as 14.6% / 9.6% surviving the old pipeline.
"""
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(r"E:/Kanchuki/scripts/demo/2026-08-08-sam2")
INPUT = Path(r"E:/Kanchuki/scripts/demo/2026-08-07-status/input")


def grey_frac_in_cutout(path: Path) -> float:
    """% of cutout (rembg alpha) pixels that are grey-ish (plastic/metal)."""
    import io

    from rembg import new_session, remove

    session = new_session("isnet-general-use")
    src = Image.open(path).convert("RGB")
    buf = io.BytesIO()
    src.save(buf, format="PNG")
    cutout = remove(buf.getvalue(), session=session)
    fg = Image.open(io.BytesIO(cutout)).convert("RGBA")
    rgb = np.asarray(fg)[..., :3].astype(np.int16)
    alpha = np.asarray(fg)[..., 3] > 128
    if alpha.sum() == 0:
        return 0.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    sat = np.abs(r - g) + np.abs(g - b) + np.abs(b - r)
    lum = (r + g + b) / 3
    grey = (sat < 90) & (lum > 60) & (lum < 235)
    return float(grey[alpha].mean() * 100)


for name in ["shot1-mannequin.jpg", "shot2-hanger.jpg", "shot3-folded.jpg"]:
    raw = INPUT / name
    plain = BASE / "out-plain" / name
    pro = BASE / "out-pro" / name
    print(f"{name}:")
    print(f"  raw    -> {grey_frac_in_cutout(raw):5.2f}% grey in foreground")
    print(f"  engine -> {grey_frac_in_cutout(plain):5.2f}% grey in foreground")
    print(f"  SAM2   -> {grey_frac_in_cutout(pro):5.2f}% grey in foreground")
